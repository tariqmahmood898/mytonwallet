import { Cell, internal, SendMode } from '@ton/core';

import type { DieselStatus } from '../../../global/types';
import type { CheckTransactionDraftOptions } from '../../methods/types';
import type {
  ApiAccountWithChain,
  ApiAnyDisplayError,
  ApiNetwork,
  ApiParsedPayload,
  ApiSignedTransfer,
  ApiToken,
} from '../../types';
import type {
  AnyPayload,
  ApiCheckMultiTransactionDraftResult,
  ApiCheckTransactionDraftResult,
  ApiEmulationWithFallbackResult,
  ApiFetchEstimateDieselResult,
  ApiSubmitMultiTransferResult,
  ApiSubmitTransferOptions,
  ApiSubmitTransferTonResult,
  ApiSubmitTransferWithDieselResult,
  PreparedTransactionToSign,
  TonTransferParams,
} from './types';
import type { Signer } from './util/signer';
import type { TonWallet } from './util/tonCore';
import { ApiTransactionDraftError, ApiTransactionError } from '../../types';

import { DEFAULT_FEE, DIESEL_ADDRESS, STON_PTON_ADDRESS } from '../../../config';
import { parseAccountId } from '../../../util/account';
import { bigintMultiplyToNumber } from '../../../util/bigint';
import { fromDecimal, toDecimal } from '../../../util/decimals';
import { getDieselTokenAmount, isDieselAvailable } from '../../../util/fee/transferFee';
import { omit, pick, split } from '../../../util/iteratees';
import { logDebug, logDebugError } from '../../../util/logs';
import { pause } from '../../../util/schedulers';
import { getMaxMessagesInTransaction } from '../../../util/ton/transfer';
import { parsePayloadBase64 } from './util/metadata';
import { sendExternal } from './util/sendExternal';
import { getSigner } from './util/signer';
import { isExpiredTransactionError, isSeqnoMismatchError } from './util/tonCore';
import {
  commentToBytes,
  getOurFeePayload,
  getTonClient,
  getWalletPublicKey,
  packBytesAsSnake,
  packBytesAsSnakeCell,
  packBytesAsSnakeForEncryptedData,
  parseAddress,
  parseBase64,
  parseStateInitCell,
} from './util/tonCore';
import { fetchStoredChainAccount, fetchStoredWallet } from '../../common/accounts';
import { callBackendGet } from '../../common/backend';
import { withoutTransferConcurrency } from '../../common/preventTransferConcurrency';
import { getTokenByAddress } from '../../common/tokens';
import { base64ToBytes } from '../../common/utils';
import { MINUTE, SEC } from '../../constants';
import { ApiServerError, handleServerError } from '../../errors';
import { checkHasTransaction } from './activities';
import { resolveAddress } from './address';
import {
  ATTEMPTS,
  FEE_FACTOR,
  LEDGER_VESTING_SUBWALLET_ID,
  TOKEN_TRANSFER_FORWARD_AMOUNT,
  TRANSFER_TIMEOUT_SEC,
} from './constants';
import { emulateTransaction } from './emulation';
import {
  buildTokenTransfer,
  calculateTokenBalanceWithMintless,
  getTokenBalanceWithMintless,
  getToncoinAmountForTransfer,
} from './tokens';
import { getContractInfo, getTonWallet, getWalletBalance, getWalletInfo, getWalletSeqno } from './wallet';

const WAIT_TRANSFER_TIMEOUT = MINUTE;
const WAIT_PAUSE = SEC;

const MAX_BALANCE_WITH_CHECK_DIESEL = 100000000n; // 0.1 TON
const PENDING_DIESEL_TIMEOUT_SEC = 15 * 60; // 15 min

const DIESEL_NOT_AVAILABLE: ApiFetchEstimateDieselResult = {
  status: 'not-available',
  nativeAmount: 0n,
  remainingFee: 0n,
  realFee: 0n,
};

export async function checkTransactionDraft(
  options: CheckTransactionDraftOptions,
): Promise<ApiCheckTransactionDraftResult> {
  const {
    accountId,
    amount = 0n,
    tokenAddress,
    shouldEncrypt,
    isBase64Data,
    stateInit: stateInitString,
    forwardAmount,
    allowGasless,
  } = options;
  let { toAddress, data } = options;

  const { network } = parseAccountId(accountId);

  let result: ApiCheckTransactionDraftResult = {};

  try {
    result = await checkToAddress(network, toAddress);
    if ('error' in result) {
      return result;
    }

    toAddress = result.resolvedAddress!;

    const { isInitialized } = await getContractInfo(network, toAddress);

    let stateInit: Cell | undefined;

    if (stateInitString) {
      try {
        stateInit = Cell.fromBase64(stateInitString);
      } catch {
        return {
          ...result,
          error: ApiTransactionDraftError.InvalidStateInit,
        };
      }
    }

    if (result.isBounceable && !isInitialized && !stateInit) {
      result.isToAddressNew = !(await checkHasTransaction(network, toAddress));
      return {
        ...result,
        error: ApiTransactionDraftError.InactiveContract,
      };
    }

    result.resolvedAddress = toAddress;

    if (amount < 0n) {
      return {
        ...result,
        error: ApiTransactionDraftError.InvalidAmount,
      };
    }

    const account = await fetchStoredChainAccount(accountId, 'ton');
    const wallet = getTonWallet(account.byChain.ton);

    if (typeof data === 'string' && isBase64Data) {
      data = base64ToBytes(data);
    }

    if (data && typeof data === 'string' && shouldEncrypt) {
      const toPublicKey = await getWalletPublicKey(network, toAddress);
      if (!toPublicKey) {
        return {
          ...result,
          error: ApiTransactionDraftError.WalletNotInitialized,
        };
      }
    }

    const { address, isInitialized: isWalletInitialized } = account.byChain.ton;

    if (data && typeof data === 'string' && !isBase64Data) {
      data = commentToBytes(data);
    }

    let toncoinAmount: bigint;
    const { seqno, balance: toncoinBalance } = await getWalletInfo(network, wallet);
    let balance: bigint;
    let fee: bigint;
    let realFee: bigint;

    if (!tokenAddress) {
      balance = toncoinBalance;
      toncoinAmount = amount;
      fee = 0n;
      realFee = 0n;

      if (data instanceof Uint8Array) {
        data = shouldEncrypt ? packBytesAsSnakeForEncryptedData(data) : packBytesAsSnake(data);
      }
    } else {
      const tokenTransfer = await buildTokenTransfer({
        network,
        tokenAddress,
        fromAddress: address,
        toAddress,
        amount,
        payload: data,
        forwardAmount,
        isLedger: account.type === 'ledger',
      });
      ({ amount: toncoinAmount, toAddress, payload: data } = tokenTransfer);
      const { realAmount: realToncoinAmount, isTokenWalletDeployed, mintlessTokenBalance } = tokenTransfer;

      // When the token is transferred, actually some TON is transferred, and the token sits inside the payload.
      // From the user perspective, this TON amount is a fee.
      fee = toncoinAmount;
      realFee = realToncoinAmount;

      const tokenWalletAddress = toAddress;
      balance = await calculateTokenBalanceWithMintless(
        network, tokenWalletAddress, isTokenWalletDeployed, mintlessTokenBalance,
      );
    }

    const isFullTonTransfer = !tokenAddress && toncoinBalance === amount;

    const signer = getSigner(accountId, account, undefined, true);
    const signingResult = await signTransaction({
      account,
      messages: [{
        toAddress,
        amount: toncoinAmount,
        payload: data,
        stateInit,
        hints: {
          tokenAddress,
        },
      }],
      seqno,
      signer,
      doPayFeeFromAmount: isFullTonTransfer,
    });
    if ('error' in signingResult) {
      return {
        ...result,
        error: signingResult.error,
      };
    }

    // todo: Use `received` from the emulation to calculate the real fee. Check what happens when the receiver is the same wallet.
    const { networkFee } = applyFeeFactorToEmulationResult(
      await emulateTransactionWithFallback(network, wallet, signingResult.transaction, isWalletInitialized),
    );
    fee += networkFee;
    realFee += networkFee;
    result.fee = fee;
    result.realFee = realFee;
    result.diesel = DIESEL_NOT_AVAILABLE;

    let isEnoughBalance: boolean;

    if (!tokenAddress) {
      isEnoughBalance = toncoinBalance >= fee + (isFullTonTransfer ? 0n : amount);
    } else {
      const canTransferGasfully = toncoinBalance >= fee;

      if (allowGasless) {
        result.diesel = await getDiesel({
          accountId,
          tokenAddress,
          canTransferGasfully,
          toncoinBalance,
          tokenBalance: balance,
        });
      }

      if (isDieselAvailable(result.diesel)) {
        isEnoughBalance = amount + getDieselTokenAmount(result.diesel) <= balance;
      } else {
        isEnoughBalance = canTransferGasfully && amount <= balance;
      }
    }

    return isEnoughBalance ? result : {
      ...result,
      error: ApiTransactionDraftError.InsufficientBalance,
    };
  } catch (err: any) {
    return {
      ...handleServerError(err),
      ...result,
    };
  }
}

function estimateDiesel(
  address: string,
  tokenAddress: string,
  toncoinAmount: string,
  isW5?: boolean,
  isStars?: boolean,
) {
  return callBackendGet<{
    status: DieselStatus;
    // The amount is defined only when the status is "available" or "stars-fee": https://github.com/mytonwallet-org/mytonwallet-backend/blob/44c1bf43fb776286152db8901b45fe8341752e35/src/endpoints/diesel.ts#L163
    amount?: string;
    pendingCreatedAt?: string;
  }>('/diesel/estimate', {
    address, tokenAddress, toncoinAmount, isW5, isStars,
  });
}

export async function checkToAddress(network: ApiNetwork, toAddress: string) {
  const result: {
    addressName?: string;
    isScam?: boolean;
    resolvedAddress?: string;
    isToAddressNew?: boolean;
    isBounceable?: boolean;
    isMemoRequired?: boolean;
  } = {};

  const resolved = await resolveAddress(network, toAddress);
  if (resolved === 'dnsNotResolved') return { ...result, error: ApiTransactionDraftError.DomainNotResolved };
  if (resolved === 'invalidAddress') return { ...result, error: ApiTransactionDraftError.InvalidToAddress };
  result.addressName = resolved.name;
  result.resolvedAddress = resolved.address;
  result.isMemoRequired = resolved.isMemoRequired;
  result.isScam = resolved.isScam;
  toAddress = resolved.address;

  const { isUserFriendly, isTestOnly, isBounceable } = parseAddress(toAddress);

  result.isBounceable = isBounceable;

  const regex = /[+=/]/;
  const isUrlSafe = !regex.test(toAddress);

  if (!isUserFriendly || !isUrlSafe || (network === 'mainnet' && isTestOnly)) {
    return {
      ...result,
      error: ApiTransactionDraftError.InvalidAddressFormat,
    };
  }

  return result;
}

export async function submitTransfer(options: ApiSubmitTransferOptions): Promise<ApiSubmitTransferTonResult> {
  const {
    accountId,
    password,
    amount,
    tokenAddress,
    shouldEncrypt,
    isBase64Data,
    forwardAmount = TOKEN_TRANSFER_FORWARD_AMOUNT,
    noFeeCheck,
  } = options;
  let { stateInit } = options;

  let { toAddress, data } = options;

  const { network } = parseAccountId(accountId);

  try {
    const account = await fetchStoredChainAccount(accountId, 'ton');
    const { address: fromAddress, isInitialized } = account.byChain.ton;
    const wallet = getTonWallet(account.byChain.ton);
    const signer = getSigner(accountId, account, password);

    let encryptedComment: string | undefined;

    if (typeof data === 'string') {
      const result = await stringToPayload({
        network, toAddress, data, signer, shouldEncrypt, isBase64Data,
      });
      if ('error' in result) return result;
      ({ payload: data, encryptedComment } = result);
    }

    let toncoinAmount: bigint;

    if (!tokenAddress) {
      toncoinAmount = amount;

      if (data instanceof Uint8Array) {
        data = shouldEncrypt ? packBytesAsSnakeForEncryptedData(data) : packBytesAsSnake(data);
      }
    } else {
      ({
        amount: toncoinAmount,
        toAddress,
        payload: data,
        stateInit,
      } = await buildTokenTransfer({
        network,
        tokenAddress,
        fromAddress,
        toAddress,
        amount,
        payload: data,
        forwardAmount,
        isLedger: account.type === 'ledger',
      }));
    }

    return await withoutTransferConcurrency(network, fromAddress, async (finalizeInBackground) => {
      const { seqno, balance: toncoinBalance } = await getWalletInfo(network, wallet);
      const isFullTonTransfer = !tokenAddress && toncoinBalance === amount;

      const signingResult = await signTransaction({
        account,
        messages: [{
          toAddress,
          amount: toncoinAmount,
          payload: data,
          stateInit,
          hints: {
            tokenAddress,
          },
        }],
        seqno,
        signer,
        doPayFeeFromAmount: isFullTonTransfer,
      });
      if ('error' in signingResult) return signingResult;
      const { transaction } = signingResult;

      if (!noFeeCheck) {
        const { networkFee } = await emulateTransactionWithFallback(network, wallet, transaction, isInitialized);

        const isEnoughBalance = isFullTonTransfer
          ? toncoinBalance > networkFee
          : toncoinBalance >= toncoinAmount + networkFee;

        if (!isEnoughBalance) {
          return { error: ApiTransactionError.InsufficientBalance };
        }
      }

      const client = getTonClient(network);
      const { msgHash, boc, msgHashNormalized } = await sendExternal(client, wallet, transaction);

      finalizeInBackground(() => retrySendBoc(network, fromAddress, boc, seqno));

      return {
        amount,
        seqno,
        encryptedComment,
        toAddress,
        msgHash,
        msgHashNormalized,
        toncoinAmount,
      };
    });
  } catch (err: any) {
    logDebugError('submitTransfer', err);

    return { error: resolveTransactionError(err) };
  }
}

export async function submitTransferWithDiesel(options: {
  accountId: string;
  password?: string;
  toAddress: string;
  amount: bigint;
  data?: AnyPayload;
  tokenAddress: string;
  shouldEncrypt?: boolean;
  dieselAmount: bigint;
  isGaslessWithStars?: boolean;
}): Promise<ApiSubmitTransferWithDieselResult> {
  try {
    const {
      toAddress,
      amount,
      accountId,
      password,
      tokenAddress,
      shouldEncrypt,
      dieselAmount,
      isGaslessWithStars,
    } = options;

    let { data } = options;

    const { network } = parseAccountId(accountId);

    const account = await fetchStoredChainAccount(accountId, 'ton');
    const { address: fromAddress, version } = account.byChain.ton;

    let encryptedComment: string | undefined;

    if (typeof data === 'string') {
      const signer = getSigner(accountId, account, password);
      const result = await stringToPayload({
        network, toAddress, data, signer, shouldEncrypt,
      });
      if ('error' in result) return result;
      ({ payload: data, encryptedComment } = result);
    }

    const messages: TonTransferParams[] = [
      await buildTokenTransfer({
        network,
        tokenAddress,
        fromAddress,
        toAddress,
        amount,
        payload: data,
        isLedger: account.type === 'ledger',
      }),
    ];

    if (!isGaslessWithStars) {
      messages.push(
        await buildTokenTransfer({
          network,
          tokenAddress,
          fromAddress,
          toAddress: DIESEL_ADDRESS,
          amount: dieselAmount,
          shouldSkipMintless: true,
          payload: getOurFeePayload(),
          isLedger: account.type === 'ledger',
        }),
      );
    }

    const result = await submitMultiTransfer({
      accountId,
      password,
      messages,
      isGasless: true,
    });

    return {
      ...result,
      encryptedComment,
      withW5Gasless: version === 'W5',
    };
  } catch (err) {
    logDebugError('submitTransferWithDiesel', err);

    return { error: resolveTransactionError(err) };
  }
}

async function stringToPayload({
  network, toAddress, data, shouldEncrypt, signer, isBase64Data,
}: {
  network: ApiNetwork;
  data: string;
  shouldEncrypt?: boolean;
  toAddress: string;
  signer: Signer;
  isBase64Data?: boolean;
}): Promise<{
  payload?: Uint8Array | Cell;
  encryptedComment?: string;
} | { error: ApiAnyDisplayError }> {
  let payload: Uint8Array | Cell | undefined;
  let encryptedComment: string | undefined;

  if (!data) {
    payload = undefined;
  } else if (isBase64Data) {
    payload = parseBase64(data);
  } else if (shouldEncrypt) {
    const toPublicKey = (await getWalletPublicKey(network, toAddress))!;
    const result = await signer.encryptComment(data, toPublicKey);
    if ('error' in result) return result;
    payload = result;
    encryptedComment = result.subarray(4).toString('base64');
  } else {
    payload = commentToBytes(data);
  }

  return { payload, encryptedComment };
}

export function resolveTransactionError(error: any): ApiAnyDisplayError | string {
  if (error instanceof ApiServerError) {
    if (isExpiredTransactionError(error.message)) {
      return ApiTransactionError.IncorrectDeviceTime;
    } else if (isSeqnoMismatchError(error.message)) {
      return ApiTransactionError.ConcurrentTransaction;
    } else if (error.statusCode === 400) {
      return error.message;
    } else if (error.displayError) {
      return error.displayError;
    }
  }
  return ApiTransactionError.UnsuccesfulTransfer;
}

export async function checkMultiTransactionDraft(
  accountId: string,
  messages: TonTransferParams[],
  withDiesel?: boolean,
): Promise<ApiCheckMultiTransactionDraftResult> {
  let totalAmount: bigint = 0n;

  const { network } = parseAccountId(accountId);
  const account = await fetchStoredChainAccount(accountId, 'ton');

  try {
    for (const { toAddress, amount } of messages) {
      if (amount < 0n) {
        return { error: ApiTransactionDraftError.InvalidAmount };
      }

      const isMainnet = network === 'mainnet';
      const { isValid, isTestOnly } = parseAddress(toAddress);

      if (!isValid || (isMainnet && isTestOnly)) {
        return { error: ApiTransactionDraftError.InvalidToAddress };
      }

      totalAmount += amount;
    }

    // Check individual token balances
    const { hasInsufficientTokenBalance, parsedPayloads } = await isTokenBalanceInsufficient(
      network,
      account.byChain.ton.address,
      messages,
    );

    const wallet = getTonWallet(account.byChain.ton);
    const { seqno, balance } = await getWalletInfo(network, wallet);

    const signer = getSigner(accountId, account, undefined, true);
    const signingResult = await signTransaction({ account, messages, seqno, signer });
    if ('error' in signingResult) return signingResult;

    const emulation = applyFeeFactorToEmulationResult(
      await emulateTransactionWithFallback(
        network,
        wallet,
        signingResult.transaction,
        account.byChain.ton.isInitialized,
      ),
    );
    const result = { emulation, parsedPayloads };

    // TODO Should `totalAmount` be `0` for `withDiesel`?
    // Check for insufficient balance (both tokens and TON) and return error
    const hasInsufficientTonBalance = !withDiesel && balance < totalAmount + result.emulation.networkFee;

    if (hasInsufficientTokenBalance || hasInsufficientTonBalance) {
      return { ...result, error: ApiTransactionDraftError.InsufficientBalance };
    }

    return result;
  } catch (err: any) {
    return handleServerError(err);
  }
}

async function isTokenBalanceInsufficient(
  network: ApiNetwork,
  walletAddress: string,
  messages: TonTransferParams[],
): Promise<{
    hasInsufficientTokenBalance: boolean;
    parsedPayloads: (ApiParsedPayload | undefined)[];
  }> {
  const payloadParsingResults = await Promise.all(
    messages.map(async ({ payload, toAddress }) => {
      if (!payload) return { tokenResult: undefined, parsedPayload: undefined };

      try {
        const payloadAsString = getPayloadFromTransfer({ payload, isBase64Payload: true })!.toBoc().toString('base64');
        const parsedPayload = await parsePayloadBase64(network, toAddress, payloadAsString);

        if (parsedPayload?.type === 'tokens:transfer') {
          return {
            tokenResult: {
              tokenAddress: parsedPayload.tokenAddress,
              amount: parsedPayload.amount,
            },
            parsedPayload,
          };
        }

        return { tokenResult: undefined, parsedPayload };
      } catch (e) {
        // If payload parsing fails, treat as regular TON transfer
        logDebugError('isTokenBalanceInsufficient', 'Error parsing payload', e);
      }

      return { tokenResult: undefined, parsedPayload: undefined };
    }),
  );

  // Accumulate token amounts by address
  const tokenAmountsByAddress: Record<string, bigint> = {};
  const parsedPayloads = payloadParsingResults.map((result) => result?.parsedPayload);
  let hasUnknownToken = false;

  for (const result of payloadParsingResults) {
    if (result?.tokenResult) {
      const { tokenAddress, amount } = result.tokenResult;

      if (!tokenAddress) {
        // Possible when the jetton wallet is not deployed, therefore the minter address is unknown and set to "".
        // This is handled in `parsePayloadSlice`. If the sender jetton wallet is not deployed, assuming the balance is 0.
        hasUnknownToken = true;
        continue;
      }

      if (!tokenAmountsByAddress[tokenAddress]) {
        tokenAmountsByAddress[tokenAddress] = 0n;
      }
      tokenAmountsByAddress[tokenAddress] += amount;
    }
  }

  if (hasUnknownToken) {
    return { hasInsufficientTokenBalance: true, parsedPayloads };
  }

  const tokenAddresses = Object.keys(tokenAmountsByAddress);
  if (tokenAddresses.length === 0) {
    return { hasInsufficientTokenBalance: false, parsedPayloads }; // No token transfers
  }

  const tokenBalances = await Promise.all(
    tokenAddresses.map((tokenAddress) =>
      tokenAddress !== STON_PTON_ADDRESS
        ? getTokenBalanceWithMintless(network, walletAddress, tokenAddress)
        : 0n,
    ),
  );

  // Check if any token has insufficient balance
  for (let i = 0; i < tokenAddresses.length; i++) {
    const tokenAddress = tokenAddresses[i];
    const requiredAmount = tokenAmountsByAddress[tokenAddress];
    const availableBalance = tokenBalances[i];

    if (tokenAddress === STON_PTON_ADDRESS) {
      continue; // PTON can be here from the built-in swaps
    }

    if (availableBalance < requiredAmount) {
      return { hasInsufficientTokenBalance: true, parsedPayloads };
    }
  }

  return { hasInsufficientTokenBalance: false, parsedPayloads };
}

export type GaslessType = 'diesel' | 'w5';

interface SubmitMultiTransferOptions {
  accountId: string;
  /** Required only for mnemonic accounts */
  password?: string;
  messages: TonTransferParams[];
  expireAt?: number;
  isGasless?: boolean;
}

// todo: Support submitting multiple transactions (not only multiple messages). The signing already supports that. It will allow to: 1) send multiple NFTs with a single API call, 2) renew multiple domains in a single function call, 3) simplify the implementation of swapping with Ledger
export async function submitMultiTransfer({
  accountId, password, messages, expireAt, isGasless,
}: SubmitMultiTransferOptions): Promise<ApiSubmitMultiTransferResult> {
  const { network } = parseAccountId(accountId);

  const account = await fetchStoredChainAccount(accountId, 'ton');
  const { address: fromAddress, isInitialized, version } = account.byChain.ton;

  try {
    const wallet = getTonWallet(account.byChain.ton);

    let totalAmount = 0n;
    messages.forEach((message) => {
      totalAmount += BigInt(message.amount);
    });

    return await withoutTransferConcurrency(network, fromAddress, async (finalizeInBackground) => {
      const { seqno, balance } = await getWalletInfo(network, wallet);

      const gaslessType = isGasless ? version === 'W5' ? 'w5' : 'diesel' : undefined;
      const withW5Gasless = gaslessType === 'w5';

      const signer = getSigner(accountId, account, password);
      const signingResult = await signTransaction({
        account,
        messages,
        expireAt: withW5Gasless
          ? Math.round(Date.now() / 1000) + PENDING_DIESEL_TIMEOUT_SEC
          : expireAt,
        seqno,
        signer,
        shouldBeInternal: withW5Gasless,
      });
      if ('error' in signingResult) return signingResult;
      const { transaction } = signingResult;

      if (!isGasless) {
        const { networkFee } = await emulateTransactionWithFallback(network, wallet, transaction, isInitialized);
        if (balance < totalAmount + networkFee) {
          return { error: ApiTransactionError.InsufficientBalance };
        }
      }

      const client = getTonClient(network);
      const { msgHash, boc, paymentLink, msgHashNormalized } = await sendExternal(
        client, wallet, transaction, gaslessType,
      );

      if (!isGasless) {
        finalizeInBackground(() => retrySendBoc(network, fromAddress, boc, seqno));
      } else {
        // TODO: Wait for gasless transfer
      }

      const clearedMessages = messages.map((message) => {
        if (typeof message.payload !== 'string' && typeof message.payload !== 'undefined') {
          return omit(message, ['payload']);
        }
        return message;
      });

      return {
        seqno,
        amount: totalAmount.toString(),
        messages: clearedMessages,
        boc,
        msgHash,
        msgHashNormalized,
        paymentLink,
        withW5Gasless,
      };
    });
  } catch (err) {
    logDebugError('submitMultiTransfer', err);
    return { error: resolveTransactionError(err) };
  }
}

export async function signTransfers(
  accountId: string,
  messages: TonTransferParams[],
  password?: string,
  expireAt?: number,
  /** Used for specific transactions on vesting.ton.org */
  ledgerVestingAddress?: string,
): Promise<ApiSignedTransfer[] | { error: ApiAnyDisplayError }> {
  const account = await fetchStoredChainAccount(accountId, 'ton');

  // If there is an outgoing transfer in progress, this expression waits for it to finish. This helps to avoid seqno
  // mismatches. This is not fully reliable, because the signed transactions are sent by a separate API method, but it
  // works in most cases.
  await withoutTransferConcurrency(parseAccountId(accountId).network, account.byChain.ton.address, () => {});

  const seqno = await getWalletSeqno(
    parseAccountId(accountId).network,
    ledgerVestingAddress ?? account.byChain.ton.address,
  );
  const signer = getSigner(
    accountId,
    account,
    password,
    false,
    ledgerVestingAddress ? LEDGER_VESTING_SUBWALLET_ID : undefined,
  );
  const signedTransactions = await signTransactions({ account, expireAt, messages, seqno, signer });
  if ('error' in signedTransactions) return signedTransactions;

  return signedTransactions.map(({ seqno, transaction }) => ({
    seqno,
    base64: transaction.toBoc().toString('base64'),
  }));
}

interface SignTransactionOptions {
  account: ApiAccountWithChain<'ton'>;
  doPayFeeFromAmount?: boolean;
  messages: TonTransferParams[];
  seqno: number;
  signer: Signer;
  /** Unix seconds */
  expireAt?: number;
  /** If true, will sign the transaction as an internal message instead of external. Not supported by Ledger. */
  shouldBeInternal?: boolean;
}

async function signTransaction(options: SignTransactionOptions) {
  const result = await signTransactions({ ...options, allowOnlyOneTransaction: true });
  if ('error' in result) return result;
  return result[0];
}

/**
 * A universal function for signing any number of transactions in any account type.
 *
 * If the account doesn't support signing all the given messages in a single transaction, will produce multiple signed
 * transactions. If you need exactly 1 signed transaction, use `allowOnlyOneTransaction` or `signTransaction` (the
 * function will throw an error in case of multiple transactions).
 *
 * The reason for signing multiple transactions (not messages) in a single function call is improving the UX. Each
 * transaction requires a manual user action to sign with Ledger. So, all the transactions should be checked before
 * actually signing any of them.
 */
async function signTransactions({
  account,
  messages,
  doPayFeeFromAmount,
  seqno,
  signer,
  expireAt = Math.round(Date.now() / 1000) + TRANSFER_TIMEOUT_SEC,
  shouldBeInternal,
  allowOnlyOneTransaction,
}: SignTransactionOptions & { allowOnlyOneTransaction?: boolean }) {
  const messagesPerTransaction = getMaxMessagesInTransaction(account);
  const messagesByTransaction = split(messages, messagesPerTransaction);

  if (allowOnlyOneTransaction && messagesByTransaction.length !== 1) {
    throw new Error(
      messagesByTransaction.length === 0
        ? 'No messages to sign'
        : `Too many messages for 1 transaction (${messages.length} messages given)`,
    );
  }

  const transactionsToSign = messagesByTransaction.map((transactionMessages, index) => {
    if (!signer.isMock) {
      logDebug('Signing transaction', {
        seqno,
        messages: transactionMessages.map((msg) => pick(msg, ['toAddress', 'amount'])),
      });
    }

    return makePreparedTransactionToSign({
      messages: transactionMessages,
      seqno: seqno + index,
      doPayFeeFromAmount,
      expireAt,
      shouldBeInternal,
    });
  });

  // All the transactions are passed to a single `signer.signTransactions` call, because it checks the transactions
  // before signing. See the `signTransactions` description for more details.
  const signedTransactions = await signer.signTransactions(transactionsToSign);
  if ('error' in signedTransactions) return signedTransactions;

  return signedTransactions.map((transaction, index) => ({
    seqno: transactionsToSign[index].seqno,
    transaction,
  }));
}

async function retrySendBoc(
  network: ApiNetwork,
  address: string,
  boc: string,
  seqno: number,
) {
  const tonClient = getTonClient(network);
  const waitUntil = Date.now() + WAIT_TRANSFER_TIMEOUT;

  while (Date.now() < waitUntil) {
    const [error, walletInfo] = await Promise.all([
      tonClient.sendFile(boc).catch((err) => String(err)),
      getWalletInfo(network, address).catch(() => undefined),
    ]);

    // Errors mean that `seqno` was changed or not enough of balance
    if (error?.match(/(exitcode=33|exitcode=133|inbound external message rejected by account)/)) {
      break;
    }

    // seqno here may change before exit code appears
    if (walletInfo && walletInfo.seqno > seqno) {
      break;
    }

    await pause(WAIT_PAUSE);
  }
}

async function emulateTransactionWithFallback(
  network: ApiNetwork,
  wallet: TonWallet,
  transaction: Cell,
  isInitialized?: boolean,
): Promise<ApiEmulationWithFallbackResult> {
  try {
    const emulation = await emulateTransaction(network, wallet, transaction, isInitialized);
    return { isFallback: false, ...emulation };
  } catch (err) {
    logDebugError('Failed to emulate a transaction', err);
  }

  // Falling back to the legacy fee estimation method just in case.
  // It doesn't support estimating more than 20 messages (inside the transaction) at once.
  // eslint-disable-next-line no-null/no-null
  const { code = null, data = null } = !isInitialized ? wallet.init : {};
  const { source_fees: fees } = await getTonClient(network).estimateExternalMessageFee(wallet.address, {
    body: transaction,
    initCode: code,
    initData: data,
    ignoreSignature: true,
  });
  const networkFee = BigInt(fees.in_fwd_fee + fees.storage_fee + fees.gas_fee + fees.fwd_fee);
  return { isFallback: true, networkFee };
}

export async function sendSignedTransactions(accountId: string, transactions: ApiSignedTransfer[]) {
  const { network } = parseAccountId(accountId);
  const storedWallet = await fetchStoredWallet(accountId, 'ton');
  const { address: fromAddress } = storedWallet;
  const client = getTonClient(network);
  const wallet = getTonWallet(storedWallet);

  const attempts = ATTEMPTS + transactions.length;
  let index = 0;
  let attempt = 0;

  const sentTransactions: { boc: string; msgHashNormalized: string }[] = [];

  return withoutTransferConcurrency(network, fromAddress, async (finalizeInBackground) => {
    while (index < transactions.length && attempt < attempts) {
      const { base64, seqno } = transactions[index];
      try {
        const { boc, msgHashNormalized } = await sendExternal(client, wallet, Cell.fromBase64(base64));
        sentTransactions.push({ boc, msgHashNormalized });

        const ensureSent = () => retrySendBoc(network, fromAddress, boc, seqno);
        if (index === transactions.length - 1) {
          finalizeInBackground(ensureSent);
        } else {
          await ensureSent();
        }

        index++;
      } catch (err) {
        if (err instanceof ApiServerError && isSeqnoMismatchError(err.message)) {
          return { error: ApiTransactionError.ConcurrentTransaction };
        }
        logDebugError('sendSignedMessages', err);
      }
      attempt++;
    }

    return sentTransactions;
  });
}

/**
 * The goal of the function is acting like `checkTransactionDraft` but return only the diesel information
 */
export function fetchEstimateDiesel(
  accountId: string, tokenAddress: string,
): Promise<ApiFetchEstimateDieselResult> {
  return getDiesel({
    accountId,
    tokenAddress,
    // We pass `false` because `fetchEstimateDiesel` assumes that the transfer is gasless anyway
    canTransferGasfully: false,
  });
}

/**
 * Decides whether the transfer must be gasless and fetches the diesel estimate from the backend.
 */
async function getDiesel({
  accountId,
  tokenAddress,
  canTransferGasfully,
  toncoinBalance,
  tokenBalance,
}: {
  accountId: string;
  tokenAddress: string;
  canTransferGasfully: boolean;
  // The below fields allow to avoid network requests if you already have these data
  toncoinBalance?: bigint;
  tokenBalance?: bigint;
}): Promise<ApiFetchEstimateDieselResult> {
  const { network } = parseAccountId(accountId);
  if (network !== 'mainnet') return DIESEL_NOT_AVAILABLE;

  const storedTonWallet = await fetchStoredWallet(accountId, 'ton');
  const wallet = getTonWallet(storedTonWallet);

  const token = getTokenByAddress(tokenAddress)!;
  if (!token.isGaslessEnabled && !token.isStarsEnabled) return DIESEL_NOT_AVAILABLE;

  const { address, version } = storedTonWallet;
  toncoinBalance ??= await getWalletBalance(network, wallet);
  const fee = getDieselToncoinFee(token);
  const toncoinNeeded = fee.amount - toncoinBalance;

  if (toncoinBalance >= MAX_BALANCE_WITH_CHECK_DIESEL || toncoinNeeded <= 0n) return DIESEL_NOT_AVAILABLE;

  const rawDiesel = await estimateDiesel(
    address,
    tokenAddress,
    toDecimal(toncoinNeeded),
    version === 'W5',
    fee.isStars,
  );
  const diesel: ApiFetchEstimateDieselResult = {
    status: rawDiesel.status,
    amount: rawDiesel.amount === undefined
      ? undefined
      : fromDecimal(rawDiesel.amount, rawDiesel.status === 'stars-fee' ? 0 : token.decimals),
    nativeAmount: toncoinNeeded,
    remainingFee: toncoinBalance,
    realFee: fee.realFee,
  };

  const tokenAmount = getDieselTokenAmount(diesel);
  if (tokenAmount === 0n) {
    return diesel;
  }

  tokenBalance ??= await getTokenBalanceWithMintless(network, address, tokenAddress);
  const canPayDiesel = tokenBalance >= tokenAmount;
  const isAwaitingNotExpiredPrevious = Boolean(
    rawDiesel.pendingCreatedAt
    && Date.now() - new Date(rawDiesel.pendingCreatedAt).getTime() < PENDING_DIESEL_TIMEOUT_SEC * SEC,
  );

  // When both TON and diesel are insufficient, we want to show the TON fee
  const shouldBeGasless = (!canTransferGasfully && canPayDiesel) || isAwaitingNotExpiredPrevious;
  return shouldBeGasless ? diesel : DIESEL_NOT_AVAILABLE;
}

/**
 * Guesses the total TON fee (including the gas attached to the transaction) that will be spent on a diesel transfer.
 *
 * `amount` is what will be taken from the wallet;
 * `realFee` is approximately what will be actually spent (the rest will return in the excess);
 * `isStars` tells whether the fee is estimated considering that the diesel will be paid in stars.
 */
function getDieselToncoinFee(token: ApiToken) {
  const isStars = !token.isGaslessEnabled && token.isStarsEnabled;
  let { amount, realAmount: realFee } = getToncoinAmountForTransfer(token, false);

  // Multiplying by 2 because the diesel transfer has 2 transactions:
  // - for the transfer itself,
  // - for sending the diesel to the MTW wallet.
  if (!isStars) {
    amount *= 2n;
    realFee *= 2n;
  }

  amount += DEFAULT_FEE;
  realFee += DEFAULT_FEE;

  return { amount, realFee, isStars };
}

function applyFeeFactorToEmulationResult(estimation: ApiEmulationWithFallbackResult): ApiEmulationWithFallbackResult {
  estimation = {
    ...estimation,
    networkFee: bigintMultiplyToNumber(estimation.networkFee, FEE_FACTOR),
  };

  if ('byTransactionIndex' in estimation) {
    estimation.byTransactionIndex = estimation.byTransactionIndex.map((transaction) => ({
      ...transaction,
      networkFee: bigintMultiplyToNumber(transaction.networkFee, FEE_FACTOR),
    }));
  }

  return estimation;
}

function makePreparedTransactionToSign(
  options: Pick<SignTransactionOptions, 'messages' | 'doPayFeeFromAmount' | 'expireAt' | 'shouldBeInternal' | 'seqno'>,
): PreparedTransactionToSign {
  const { messages, seqno, doPayFeeFromAmount, expireAt, shouldBeInternal } = options;

  return {
    authType: shouldBeInternal ? 'internal' : undefined,
    seqno,
    messages: messages.map((message) => {
      const { amount, toAddress, stateInit } = message;
      return internal({
        value: amount,
        to: toAddress,
        body: getPayloadFromTransfer(message),
        bounce: parseAddress(toAddress).isBounceable,
        init: parseStateInitCell(stateInit),
      });
    }),
    sendMode: (doPayFeeFromAmount ? SendMode.CARRY_ALL_REMAINING_BALANCE : SendMode.PAY_GAS_SEPARATELY)
      // It's important to add IGNORE_ERRORS to every transaction. Otherwise, failed transactions may repeat and drain
      // the wallet balance: https://docs.ton.org/v3/documentation/smart-contracts/message-management/sending-messages#behavior-without-2-flag
      + SendMode.IGNORE_ERRORS,
    timeout: expireAt,
    hints: messages[0].hints, // Currently hints are used only by Ledger, which has only 1 message per transaction
  };
}

function getPayloadFromTransfer(
  { payload, isBase64Payload }: Pick<TonTransferParams, 'payload' | 'isBase64Payload'>,
): Cell | undefined {
  if (payload === undefined) {
    return undefined;
  }

  if (payload instanceof Cell) {
    return payload;
  }

  if (typeof payload === 'string') {
    if (isBase64Payload) {
      return Cell.fromBase64(payload);
    }

    // This is what @ton/core does under the hood when a string payload is passed to `internal()`
    return packBytesAsSnakeCell(commentToBytes(payload));
  }

  if (payload instanceof Uint8Array) {
    return payload.length ? packBytesAsSnakeCell(payload) : undefined;
  }

  throw new TypeError(`Unexpected payload type ${typeof payload}`);
}
