import type { ApiCheckTransactionDraftResult } from '../../../api/chains/ton/types';
import type { ApiSubmitTransferOptions, ApiSubmitTransferResult } from '../../../api/methods/types';
import type {
  ApiChain,
  ApiSwapActivity,
  ApiSwapBuildRequest,
  ApiSwapCexCreateTransactionRequest,
  ApiSwapDexLabel,
  ApiSwapEstimateResponse,
  ApiSwapEstimateVariant,
  ApiSwapHistoryItem,
} from '../../../api/types';
import type {
  AssetPairs,
  GlobalState,
} from '../../types';
import {
  ActiveTab,
  SwapErrorType,
  SwapInputSource,
  SwapState,
  SwapType,
} from '../../types';

import {
  DEFAULT_SWAP_FIRST_TOKEN_SLUG,
  DEFAULT_SWAP_SECOND_TOKEN_SLUG,
  TONCOIN,
  TRX_SWAP_COUNT_FEE_ADDRESS,
} from '../../../config';
import { Big } from '../../../lib/big.js';
import { getIsActivityPendingForUser, parseTxId } from '../../../util/activities';
import { getDoesUsePinPad } from '../../../util/biometrics';
import { fromDecimal, roundDecimal, toDecimal } from '../../../util/decimals';
import { canAffordSwapEstimateVariant, shouldSwapBeGasless } from '../../../util/fee/swapFee';
import generateUniqueId from '../../../util/generateUniqueId';
import { buildCollectionByKey, pick } from '../../../util/iteratees';
import { callActionInMain, callActionInNative } from '../../../util/multitab';
import { pause, waitFor } from '../../../util/schedulers';
import { findNativeToken, getChainBySlug, getIsTonToken, getNativeToken } from '../../../util/tokens';
import { IS_DELEGATED_BOTTOM_SHEET, IS_DELEGATING_BOTTOM_SHEET } from '../../../util/windowEnvironment';
import { callApi } from '../../../api';
import { addActionHandler, getGlobal, setGlobal } from '../..';
import { resolveSwapAssetId } from '../../helpers';
import {
  getSwapEstimateResetParams,
  isSwapEstimateInputEqual,
  isSwapFormFilled,
  shouldAvoidSwapEstimation,
} from '../../helpers/swap';
import {
  handleTransferResult,
  isErrorTransferResult,
  prepareTransfer,
  reportErrorTransferResult,
} from '../../helpers/transfer';
import { clearCurrentSwap, clearIsPinAccepted, updateAccountState, updateCurrentSwap } from '../../reducers';
import {
  selectAccount,
  selectAccountState,
  selectCurrentAccount,
  selectCurrentAccountTokenBalance,
  selectCurrentSwapTokenIn,
  selectCurrentSwapTokenOut,
  selectCurrentToncoinBalance,
  selectIsMultichainAccount,
  selectSwapType,
} from '../../selectors';

import { getIsPortrait } from '../../../hooks/useDeviceScreen';

const pairsCache: Record<string, { timestamp: number }> = {};

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const WAIT_FOR_CHANGELLY = 5 * 1000;
const CLOSING_BOTTOM_SHEET_DURATION = 100; // Like in `useDelegatingBottomSheet`

const SERVER_ERRORS_MAP = {
  'Insufficient liquidity': SwapErrorType.NotEnoughLiquidity,
  'Tokens must be different': SwapErrorType.InvalidPair,
  'Asset not found': SwapErrorType.InvalidPair,
  'Pair not found': SwapErrorType.InvalidPair,
  'Too small amount': SwapErrorType.TooSmallAmount,
};

function buildSwapBuildRequest(global: GlobalState): ApiSwapBuildRequest {
  const {
    currentDexLabel,
    amountIn,
    amountOut,
    amountOutMin,
    slippage,
    networkFee,
    swapFee,
    ourFee,
    dieselFee,
    realNetworkFee,
    estimates,
  } = global.currentSwap;

  const tokenIn = selectCurrentSwapTokenIn(global)!;
  const tokenOut = selectCurrentSwapTokenOut(global)!;
  const from = resolveSwapAssetId(tokenIn);
  const to = resolveSwapAssetId(tokenOut);
  const fromAmount = amountIn!;
  const toAmount = amountOut!;
  const account = selectAccount(global, global.currentAccountId!);
  const nativeTokenIn = findNativeToken(getChainBySlug(tokenIn.slug));
  const nativeTokenInBalance = nativeTokenIn ? selectCurrentAccountTokenBalance(global, nativeTokenIn.slug) : undefined;
  const swapType = selectSwapType(global);

  return {
    from,
    to,
    fromAmount,
    toAmount,
    toMinAmount: amountOutMin!,
    slippage,
    fromAddress: (account?.byChain[tokenIn.chain as ApiChain] || account?.byChain.ton)!.address,
    shouldTryDiesel: shouldSwapBeGasless({ ...global.currentSwap, swapType, nativeTokenInBalance }),
    dexLabel: currentDexLabel!,
    networkFee: realNetworkFee ?? networkFee!,
    swapFee: swapFee!,
    ourFee: ourFee!,
    dieselFee,
    routes: estimates?.[0]?.routes,
  };
}

function buildSwapEstimates(estimate: ApiSwapEstimateResponse): ApiSwapEstimateVariant[] {
  const bestEstimate: ApiSwapEstimateVariant = {
    ...pick(estimate, [
      'fromAmount',
      'toAmount',
      'toMinAmount',
      'impact',
      'dexLabel',
      'networkFee',
      'realNetworkFee',
      'swapFee',
      'swapFeePercent',
      'ourFee',
      'dieselFee',
      'networkFee',
      'routes',
    ]),
  };

  const result: ApiSwapEstimateVariant[] = [
    bestEstimate,
    ...(estimate.other ?? []),
  ];

  return result.sort((a, b) => a.dexLabel.localeCompare(b.dexLabel));
}

function processNativeMaxSwap(global: GlobalState) {
  const tokenIn = selectCurrentSwapTokenIn(global)!;
  let fromAmount = global.currentSwap.amountIn ?? '0';
  let isFromAmountMax = false;

  if (
    global.currentSwap.amountIn
    && selectSwapType(global) === SwapType.OnChain
    && global.currentSwap.inputSource === SwapInputSource.In
    && global.currentSwap.isMaxAmount
  ) {
    const tokenBalance = selectCurrentAccountTokenBalance(global, tokenIn.slug);
    fromAmount = toDecimal(tokenBalance, tokenIn.decimals);
    isFromAmountMax = true;
  }
  return { fromAmount, isFromAmountMax };
}

function getSupportedChains(global: GlobalState) {
  return Object.keys(selectAccount(global, global.currentAccountId!)?.byChain || { ton: true }) as ApiChain[];
}

addActionHandler('startSwap', async (global, actions, payload) => {
  const isOpen = global.currentSwap.state !== SwapState.None;
  if (IS_DELEGATING_BOTTOM_SHEET && isOpen) {
    callActionInNative('cancelSwap');
    await pause(CLOSING_BOTTOM_SHEET_DURATION);
    global = getGlobal();
  }

  if (IS_DELEGATED_BOTTOM_SHEET) {
    callActionInMain('startSwap', payload);
    return;
  }

  const { state } = payload ?? {};
  const isPortrait = getIsPortrait();

  const requiredState = state || (isPortrait ? SwapState.Initial : SwapState.None);

  global = updateCurrentSwap(global, {
    ...payload,
    state: requiredState,
    swapId: generateUniqueId(),
    inputSource: SwapInputSource.In,
  });
  setGlobal(global);

  if (!isPortrait) {
    actions.setLandscapeActionsActiveTabIndex({ index: ActiveTab.Swap });
  }
});

addActionHandler('setDefaultSwapParams', (global, actions, payload) => {
  let { tokenInSlug: requiredTokenInSlug, tokenOutSlug: requiredTokenOutSlug } = payload ?? {};
  const { withResetAmount } = payload ?? {};

  requiredTokenInSlug = requiredTokenInSlug || DEFAULT_SWAP_FIRST_TOKEN_SLUG;
  requiredTokenOutSlug = requiredTokenOutSlug || DEFAULT_SWAP_SECOND_TOKEN_SLUG;
  if (
    global.currentSwap.tokenInSlug === requiredTokenInSlug
    && global.currentSwap.tokenOutSlug === requiredTokenOutSlug
    && !withResetAmount
  ) {
    return;
  }

  global = updateCurrentSwap(global, {
    tokenInSlug: requiredTokenInSlug,
    tokenOutSlug: requiredTokenOutSlug,
    inputSource: SwapInputSource.In,
    ...(withResetAmount ? { amountIn: undefined, amountOut: undefined } : undefined),
  });
  setGlobal(global);
});

addActionHandler('cancelSwap', (global, actions, { shouldReset } = {}) => {
  if (shouldReset) {
    const { tokenInSlug, tokenOutSlug } = global.currentSwap;

    global = clearCurrentSwap(global);
    global = updateCurrentSwap(global, {
      tokenInSlug,
      tokenOutSlug,
      amountIn: undefined,
      amountOut: undefined,
      inputSource: SwapInputSource.In,
    });

    setGlobal(global);
    return;
  }

  if (getDoesUsePinPad()) {
    global = clearIsPinAccepted(global);
  }
  global = updateCurrentSwap(global, {
    state: SwapState.None,
    swapId: undefined,
  });
  setGlobal(global);
});

addActionHandler('submitSwap', async (global, actions, { password }) => {
  if (!await prepareTransfer(
    0 as never, // Swap isn't available for hardware accounts yet, so this argument value doesn't matter
    updateCurrentSwap,
    password,
  )) {
    return;
  }

  setGlobal(updateCurrentSwap(getGlobal(), { shouldResetOnClose: undefined }));

  const swapBuildRequest = buildSwapBuildRequest(global);
  const buildResult = await callApi(
    'swapBuildTransfer', global.currentAccountId!, password, swapBuildRequest,
  );

  if (!handleTransferResult(buildResult, updateCurrentSwap)) {
    setGlobal(updateCurrentSwap(getGlobal(), { shouldResetOnClose: true }));
    return;
  }

  const swapHistoryItem: ApiSwapHistoryItem = {
    id: buildResult.id,
    timestamp: Date.now(),
    status: 'pendingTrusted',
    from: swapBuildRequest.from,
    fromAmount: swapBuildRequest.fromAmount,
    to: swapBuildRequest.to,
    toAmount: swapBuildRequest.toAmount,
    networkFee: global.currentSwap.realNetworkFee ?? global.currentSwap.networkFee!,
    swapFee: global.currentSwap.swapFee!,
    ourFee: global.currentSwap.ourFee,
    hashes: [],
  };

  setGlobal(updateCurrentSwap(getGlobal(), {
    tokenInSlug: undefined,
    tokenOutSlug: undefined,
    amountIn: undefined,
    amountOut: undefined,
    state: SwapState.Complete,
    shouldResetOnClose: true,
  }));

  const result = await callApi(
    'swapSubmit',
    global.currentAccountId!,
    password,
    buildResult.transfers,
    swapHistoryItem,
    swapBuildRequest.shouldTryDiesel,
  );

  if (isErrorTransferResult(result)) {
    reportErrorTransferResult(result, updateCurrentSwap);
    setGlobal(updateCurrentSwap(getGlobal(), { shouldResetOnClose: true }));
    return;
  }

  setGlobal(updateCurrentSwap(getGlobal(), { activityId: result.activityId }));
});

addActionHandler('submitSwapCex', async (global, actions, { password }) => {
  if (!await prepareTransfer(
    0 as never, // Swap isn't available for hardware accounts yet, so this argument value doesn't matter
    updateCurrentSwap,
    password,
  )) {
    return;
  }

  global = getGlobal();
  setGlobal(updateCurrentSwap(global, { shouldResetOnClose: undefined }));

  const isMutlichainAccount = selectIsMultichainAccount(global, global.currentAccountId!);
  const account = selectCurrentAccount(global);
  const supportedChains = getSupportedChains(global);
  const tokenIn = global.swapTokenInfo.bySlug[global.currentSwap.tokenInSlug!];
  const tokenOut = global.swapTokenInfo.bySlug[global.currentSwap.tokenOutSlug!];
  const shouldSendTonTransaction = tokenIn.chain === 'ton';
  const shouldSendTronTransaction = isMutlichainAccount && tokenIn.chain === 'tron';
  const shouldSendTransaction = shouldSendTonTransaction || shouldSendTronTransaction;
  const shouldSendTokenToExternalWallet = isMutlichainAccount
    ? supportedChains.includes(tokenIn.chain as ApiChain)
    : tokenIn.chain === 'ton';

  const tonAddress = account!.byChain.ton!.address;
  const toAddress = account?.byChain[tokenOut.chain as ApiChain]?.address ?? global.currentSwap.toAddress!;

  const swapBuildRequest = buildSwapBuildRequest(global);
  const swapTransactionRequest: ApiSwapCexCreateTransactionRequest = {
    ...pick(swapBuildRequest, ['from', 'fromAmount', 'to', 'swapFee', 'networkFee']),
    fromAddress: tonAddress,
    toAddress,
  };

  const swapItem = await callApi(
    'swapCexCreateTransaction',
    global.currentAccountId!,
    password,
    swapTransactionRequest,
  );

  if (!handleTransferResult(swapItem, updateCurrentSwap)) {
    setGlobal(updateCurrentSwap(getGlobal(), { shouldResetOnClose: true }));
    return;
  }

  global = getGlobal();
  global = updateCurrentSwap(global, {
    state: shouldSendTokenToExternalWallet ? SwapState.Complete : SwapState.WaitTokens,
    activityId: swapItem.activity.id,
    payinAddress: swapItem.swap.cex!.payinAddress,
    payoutAddress: swapItem.swap.cex!.payoutAddress,
    payinExtraId: swapItem.swap.cex!.payinExtraId,
    shouldResetOnClose: true,
  });
  setGlobal(global);

  if (shouldSendTransaction) {
    const transferOptions: ApiSubmitTransferOptions = {
      password,
      accountId: global.currentAccountId!,
      fee: fromDecimal(swapItem.swap.networkFee, tokenIn.decimals),
      amount: fromDecimal(swapItem.swap.fromAmount, tokenIn.decimals),
      toAddress: swapItem.swap.cex!.payinAddress,
      tokenAddress: isMutlichainAccount ? tokenIn.tokenAddress : undefined,
    };

    await pause(WAIT_FOR_CHANGELLY);

    let transferResult: ApiSubmitTransferResult | undefined;

    if (shouldSendTonTransaction) {
      transferResult = await callApi('swapCexSubmit', 'ton', transferOptions, swapItem.swap.id);
    } else if (shouldSendTronTransaction) {
      transferResult = await callApi('swapCexSubmit', 'tron', transferOptions, swapItem.swap.id);
    }

    if (isErrorTransferResult(transferResult)) {
      reportErrorTransferResult(transferResult, updateCurrentSwap);
      setGlobal(updateCurrentSwap(getGlobal(), { shouldResetOnClose: true }));
      return;
    }
  }
});

addActionHandler('switchSwapTokens', (global) => {
  const {
    tokenInSlug, tokenOutSlug, amountIn, amountOut,
  } = global.currentSwap;

  global = updateCurrentSwap(global, {
    isMaxAmount: false,
    amountIn: amountOut,
    amountOut: amountIn,
    tokenInSlug: tokenOutSlug,
    tokenOutSlug: tokenInSlug,
    inputSource: SwapInputSource.In,
  });
  setGlobal(global);
});

addActionHandler('setSwapTokenIn', (global, actions, { tokenSlug: newTokenInSlug }) => {
  const {
    amountIn,
    amountOut,
    tokenInSlug,
    tokenOutSlug,
  } = global.currentSwap;
  const newTokenIn = global.swapTokenInfo.bySlug[newTokenInSlug];
  const adjustedAmountIn = amountIn ? roundDecimal(amountIn, newTokenIn.decimals) : amountIn;

  // Don't set the same token in both inputs
  const newTokenOutSlug = newTokenInSlug === tokenOutSlug ? tokenInSlug : tokenOutSlug;
  const newTokenOut = newTokenOutSlug ? global.swapTokenInfo.bySlug[newTokenOutSlug] : undefined;
  const adjustedAmountOut = amountOut && newTokenOut ? roundDecimal(amountOut, newTokenOut.decimals) : amountOut;

  global = updateCurrentSwap(global, {
    amountIn: adjustedAmountIn === '0' ? undefined : adjustedAmountIn,
    amountOut: adjustedAmountOut === '0' ? undefined : adjustedAmountOut,
    tokenInSlug: newTokenInSlug,
    tokenOutSlug: newTokenOutSlug,
  });
  setGlobal(global);
});

addActionHandler('setSwapTokenOut', (global, actions, { tokenSlug: newTokenOutSlug }) => {
  const {
    amountIn,
    amountOut,
    tokenInSlug,
    tokenOutSlug,
  } = global.currentSwap;
  const newTokenOut = global.swapTokenInfo.bySlug[newTokenOutSlug];
  const adjustedAmountOut = amountOut ? roundDecimal(amountOut, newTokenOut.decimals) : amountOut;

  // Don't set the same token in both inputs
  const newTokenInSlug = newTokenOutSlug === tokenInSlug ? tokenOutSlug : tokenInSlug;
  const newTokenIn = newTokenInSlug ? global.swapTokenInfo.bySlug[newTokenInSlug] : undefined;
  const adjustedAmountIn = amountIn && newTokenIn ? roundDecimal(amountIn, newTokenIn.decimals) : amountIn;

  global = updateCurrentSwap(global, {
    amountOut: adjustedAmountOut === '0' ? undefined : adjustedAmountOut,
    amountIn: adjustedAmountIn === '0' ? undefined : adjustedAmountIn,
    tokenOutSlug: newTokenOutSlug,
    tokenInSlug: newTokenInSlug,
  });
  setGlobal(global);
});

addActionHandler('setSwapAmountIn', (global, actions, { amount, isMaxAmount = false }) => {
  global = updateCurrentSwap(global, {
    amountIn: amount,
    isMaxAmount,
    inputSource: SwapInputSource.In,
  });
  setGlobal(global);
});

addActionHandler('setSwapAmountOut', (global, actions, { amount }) => {
  global = updateCurrentSwap(global, {
    amountOut: amount,
    isMaxAmount: false,
    inputSource: SwapInputSource.Out,
  });
  setGlobal(global);
});

addActionHandler('setSlippage', (global, actions, { slippage }) => {
  return updateCurrentSwap(global, { slippage });
});

addActionHandler('estimateSwap', async () => {
  await estimateSwapConcurrently(async (global, shouldStop) => {
    const { tokenInSlug, tokenOutSlug } = global.currentSwap;

    const isTonOnlySwap = (
      (tokenInSlug ? getIsTonToken(tokenInSlug, true) : true)
      && (tokenOutSlug ? getIsTonToken(tokenOutSlug, true) : true)
      && !!(tokenInSlug || tokenOutSlug)
    );

    const shouldShowAllPairs = global.swapVersion === 3 && isTonOnlySwap;

    // Set shouldShowAllPairs for TON-only swaps
    if (shouldShowAllPairs !== Boolean(global.currentSwap.shouldShowAllPairs)) {
      global = updateCurrentSwap(global, { shouldShowAllPairs: shouldShowAllPairs || undefined });
      setGlobal(global);
    }

    if (tokenInSlug && !shouldShowAllPairs) {
      await loadSwapPairs(tokenInSlug);

      if (shouldStop()) return;
      global = getGlobal();
    }

    if (tokenInSlug && tokenOutSlug) {
      const isPairValid = global.swapPairs?.bySlug?.[tokenInSlug]?.[tokenOutSlug] || shouldShowAllPairs;
      if (!isPairValid) {
        return {
          ...getSwapEstimateResetParams(global),
          errorType: SwapErrorType.InvalidPair,
        };
      }
    }

    if (!isSwapFormFilled(global)) {
      return getSwapEstimateResetParams(global);
    }

    if (selectSwapType(global) === SwapType.OnChain) {
      return estimateDexSwap(global);
    } else {
      return estimateCexSwap(global, shouldStop);
    }
  });
});

async function estimateDexSwap(global: GlobalState): Promise<SwapEstimateResult> {
  const tokenIn = global.swapTokenInfo.bySlug[global.currentSwap.tokenInSlug!];
  const tokenOut = global.swapTokenInfo.bySlug[global.currentSwap.tokenOutSlug!];
  const nativeTokenIn = getNativeToken(getChainBySlug(tokenIn.slug));

  const from = tokenIn.slug === TONCOIN.slug ? tokenIn.symbol : tokenIn.tokenAddress!;
  const to = tokenOut.slug === TONCOIN.slug ? tokenOut.symbol : tokenOut.tokenAddress!;
  const { fromAmount, isFromAmountMax } = processNativeMaxSwap(global);
  const toAmount = global.currentSwap.amountOut ?? '0';
  const fromAddress = selectCurrentAccount(global)!.byChain.ton!.address;

  const estimateAmount = global.currentSwap.inputSource === SwapInputSource.In ? { fromAmount } : { toAmount };

  const toncoinBalance = selectCurrentToncoinBalance(global);
  const shouldTryDiesel = toncoinBalance < fromDecimal(global.currentSwap.networkFee ?? '0', nativeTokenIn.decimals);

  const estimate = await callApi('swapEstimate', global.currentAccountId!, {
    ...estimateAmount,
    from,
    to,
    slippage: global.currentSwap.slippage,
    fromAddress,
    shouldTryDiesel,
    isFromAmountMax,
    toncoinBalance: toDecimal(toncoinBalance ?? 0n, TONCOIN.decimals),
  });

  global = getGlobal();

  if (!estimate || 'error' in estimate) {
    const errorType = SERVER_ERRORS_MAP[estimate?.error as keyof typeof SERVER_ERRORS_MAP]
      ?? SwapErrorType.UnexpectedError;

    return {
      ...getSwapEstimateResetParams(global),
      errorType,
    };
  }

  const errorType = estimate.toAmount === '0' && shouldTryDiesel
    ? SwapErrorType.NotEnoughForFee
    : undefined;

  const estimates = buildSwapEstimates(estimate);
  const currentEstimate = chooseSwapEstimate(global, estimates, estimate.dexLabel);

  return {
    ...getSwapEstimateResetParams(global),
    ...(global.currentSwap.inputSource === SwapInputSource.In
      ? { amountOut: currentEstimate.toAmount }
      : { amountIn: currentEstimate.fromAmount }
    ),
    ...(isFromAmountMax ? { amountIn: currentEstimate.fromAmount } : undefined),
    bestRateDexLabel: estimate.dexLabel,
    amountOutMin: currentEstimate.toMinAmount,
    priceImpact: currentEstimate.impact,
    errorType,
    dieselStatus: estimate.dieselStatus,
    estimates,
    currentDexLabel: currentEstimate.dexLabel,
    // Fees
    networkFee: currentEstimate.networkFee,
    realNetworkFee: currentEstimate.realNetworkFee,
    swapFee: currentEstimate.swapFee,
    swapFeePercent: currentEstimate.swapFeePercent,
    ourFee: currentEstimate.ourFee,
    ourFeePercent: estimate.ourFeePercent,
    dieselFee: currentEstimate.dieselFee,
  };
}

async function estimateCexSwap(global: GlobalState, shouldStop: () => boolean): Promise<SwapEstimateResult> {
  const tokenIn = global.swapTokenInfo.bySlug[global.currentSwap.tokenInSlug!];
  const tokenOut = global.swapTokenInfo.bySlug[global.currentSwap.tokenOutSlug!];

  const from = resolveSwapAssetId(tokenIn);
  const to = resolveSwapAssetId(tokenOut);
  const fromAmount = global.currentSwap.amountIn ?? '0';
  const swapType = selectSwapType(global);

  const estimate = await callApi('swapCexEstimate', {
    fromAmount,
    from,
    to,
  });

  if (shouldStop()) return undefined;

  global = getGlobal();

  if (!estimate) {
    return {
      ...getSwapEstimateResetParams(global),
      errorType: window.navigator.onLine ? SwapErrorType.InvalidPair : SwapErrorType.UnexpectedError,
    };
  }

  if ('error' in estimate) {
    const { error } = estimate as { error: string };
    if (error.includes('requests limit')) {
      return 'rateLimited';
    }

    return {
      ...getSwapEstimateResetParams(global),
      errorType: SwapErrorType.UnexpectedError,
    };
  }

  const account = global.accounts?.byId[global.currentAccountId!];
  let networkFee: string | undefined;
  let realNetworkFee: string | undefined;
  let amountIn = estimate.fromAmount;

  if (swapType === SwapType.CrosschainFromWallet) {
    if (tokenIn.chain !== 'ton' && tokenIn.chain !== 'tron') {
      throw new Error(`Unexpected chain ${tokenIn.chain}`);
    }

    const toAddress = {
      ton: account!.byChain.ton!.address,
      tron: TRX_SWAP_COUNT_FEE_ADDRESS,
    }[tokenIn.chain];

    const txDraft = await callApi('checkTransactionDraft', tokenIn.chain, {
      accountId: global.currentAccountId!,
      toAddress,
      tokenAddress: tokenIn.tokenAddress,
    });
    if (txDraft) {
      ({ networkFee, realNetworkFee } = convertTransferFeesToSwapFees(txDraft, tokenIn.chain));
    }

    const isNativeTokenIn = getNativeToken(getChainBySlug(tokenIn.slug)).slug === tokenIn.slug;

    // Auto-adjust amountIn for crosschain swaps when fee becomes known
    if (global.currentSwap.isMaxAmount && networkFee && isNativeTokenIn) {
      const tokenBalance = selectCurrentAccountTokenBalance(global, tokenIn.slug);
      const amountInBigint = tokenBalance - fromDecimal(networkFee, tokenIn.decimals);
      amountIn = toDecimal(amountInBigint, tokenIn.decimals);
    }
  }

  return {
    ...getSwapEstimateResetParams(global),
    amountOut: estimate.toAmount === '0' ? undefined : estimate.toAmount,
    amountIn,
    limits: {
      fromMin: estimate.fromMin,
      fromMax: estimate.fromMax,
    },
    swapFee: estimate.swapFee,
    networkFee,
    realNetworkFee,
    ourFee: '0',
    ourFeePercent: 0,
    dieselStatus: 'not-available',
    amountOutMin: estimate.toAmount,
    errorType: Big(fromAmount).lt(estimate.fromMin)
      ? SwapErrorType.ChangellyMinSwap
      : Big(fromAmount).gt(estimate.fromMax)
        ? SwapErrorType.ChangellyMaxSwap
        : undefined,
  };
}

addActionHandler('setSwapScreen', (global, actions, { state }) => {
  if (state === SwapState.Initial) {
    global = updateCurrentSwap(global, { swapId: generateUniqueId() });
  }
  global = updateCurrentSwap(global, { state });
  setGlobal(global);
});

addActionHandler('clearSwapError', (global) => {
  global = updateCurrentSwap(global, { error: undefined });
  setGlobal(global);
});

async function loadSwapPairs(tokenSlug: string) {
  await waitFor(() => {
    const { swapTokenInfo: { isLoaded, bySlug } } = getGlobal();
    return !!(isLoaded || bySlug[tokenSlug]);
  }, 500, 100);
  let global = getGlobal();

  const tokenIn = global.swapTokenInfo.bySlug[tokenSlug];
  if (!tokenIn) {
    return;
  }

  const assetId = resolveSwapAssetId(tokenIn);

  const cache = pairsCache[tokenSlug];
  const isCacheValid = cache && (Date.now() - cache.timestamp <= CACHE_DURATION);
  if (isCacheValid) {
    return;
  }

  const pairs = await callApi('swapGetPairs', assetId);
  global = getGlobal();

  let bySlug: AssetPairs;

  if (pairs) {
    const isTonTokenIn = tokenIn.chain === 'ton';

    bySlug = pairs.reduce((acc, pair) => {
      const isTonTokenOut = getIsTonToken(pair.slug, true);
      const countTonTokens = Number(isTonTokenIn) + (isTonTokenOut ? 1 : 0);

      const isMultichain = !(
        (countTonTokens === 2) || (countTonTokens === 1 && [tokenIn.slug, pair.slug].includes(TONCOIN.slug))
      );

      acc[pair.slug] = {
        ...(isMultichain && {
          isMultichain,
        }),
        ...(pair.isReverseProhibited && {
          isReverseProhibited: pair.isReverseProhibited,
        }),
      };
      return acc;
    }, {} as AssetPairs);

    pairsCache[tokenSlug] = { timestamp: Date.now() };
  } else {
    bySlug = {};
  }

  setGlobal({
    ...global,
    swapPairs: {
      bySlug: {
        ...global.swapPairs?.bySlug,
        [tokenSlug]: bySlug,
      },
    },
  });
}

addActionHandler('setSwapCexAddress', (global, actions, { toAddress }) => {
  global = updateCurrentSwap(global, { toAddress });
  setGlobal(global);
});

addActionHandler('updatePendingSwaps', async (global) => {
  const accountId = global.currentAccountId;
  if (!accountId) return;

  let { activities } = selectAccountState(global, accountId) ?? {};
  if (!activities) return;

  const ids = Object.values(activities.byId)
    .filter((activity) => Boolean(
      activity.kind === 'swap'
      && getIsActivityPendingForUser(activity)
      && activity.cex,
    ))
    .map(({ id }) => parseTxId(id).hash);
  if (!ids.length) return;

  const result = await callApi('fetchSwaps', accountId, ids);
  if (!result?.swaps.length) return;

  const { swaps, nonExistentIds } = result;

  global = getGlobal();
  if (global.currentAccountId !== accountId) return;

  ({ activities } = selectAccountState(global, accountId) ?? {});

  for (const swap of result.swaps) {
    if (swap.isCanceled) {
      swap.shouldHide = true;
    }
  }

  const nonExistentSwaps: Record<string, ApiSwapActivity> = {};

  for (const id of nonExistentIds) {
    nonExistentSwaps[id] = {
      ...activities!.byId[id] as ApiSwapActivity,
      status: 'expired',
      shouldHide: true,
    };
  }

  global = updateAccountState(global, accountId, {
    activities: {
      ...activities,
      byId: {
        ...activities!.byId,
        ...nonExistentSwaps,
        ...buildCollectionByKey(swaps, 'id'),
      },
    },
  });

  setGlobal(global);
});

addActionHandler('setSwapDex', (global, actions, { dexLabel }) => {
  const { estimates, bestRateDexLabel } = global.currentSwap;
  const newEstimate = (estimates || []).find((estimate) => estimate.dexLabel === dexLabel);
  if (!newEstimate) return;

  global = updateCurrentSwap(global, {
    amountIn: newEstimate.fromAmount,
    amountOut: newEstimate.toAmount,
    amountOutMin: newEstimate.toMinAmount,
    networkFee: newEstimate.networkFee,
    realNetworkFee: newEstimate.realNetworkFee,
    swapFee: newEstimate.swapFee,
    swapFeePercent: newEstimate.swapFeePercent,
    ourFee: newEstimate.ourFee,
    dieselFee: newEstimate.dieselFee,
    priceImpact: newEstimate.impact,
    currentDexLabel: dexLabel,
    // The "Best Rate" selection should enable automatic best dex selection mode
    isDexLabelChanged: dexLabel !== bestRateDexLabel ? true : undefined,
  }, true);
  setGlobal(global);
});

function convertTransferFeesToSwapFees(
  txDraft: Pick<ApiCheckTransactionDraftResult, 'fee' | 'realFee'>,
  chain: ApiChain,
) {
  const nativeToken = getNativeToken(chain);
  let networkFee: string | undefined;
  let realNetworkFee: string | undefined;

  if (txDraft?.fee !== undefined) {
    networkFee = toDecimal(txDraft.fee, nativeToken.decimals);
  }
  if (txDraft?.realFee !== undefined) {
    realNetworkFee = toDecimal(txDraft.realFee, nativeToken.decimals);
  }

  return { networkFee, realNetworkFee };
}

export type SwapEstimateResult = Partial<GlobalState['currentSwap']> | 'rateLimited' | undefined;

let isEstimatingSwap = false;

/**
 * A boilerplate of swap estimation, ensuring consistent behavior in concurrent usage scenarios.
 * This function is expected to be called periodically, and you may call it as often as you like.
 *
 * You may call the `shouldStop` function to check whether it makes sense to continue estimating (because the result
 * is likely to be ignored). If `shouldStop` returns true, `estimate` may return any value (it will be ignored).
 */
export async function estimateSwapConcurrently(
  estimate: (
    global: GlobalState,
    shouldStop: () => boolean,
  ) => SwapEstimateResult | Promise<SwapEstimateResult>,
) {
  const initialGlobal = getGlobal();

  if (shouldAvoidSwapEstimation(initialGlobal)) return;

  // There should be only 1 swap estimation at a time. A timer in SwapInitial will trigger another estimation attempt.
  if (isEstimatingSwap) {
    return;
  }

  try {
    isEstimatingSwap = true;

    const isEstimateInputIntact = isSwapEstimateInputEqual.bind(undefined, initialGlobal);

    const swapUpdate = await estimate(initialGlobal, () => {
      const currentGlobal = getGlobal();
      return shouldAvoidSwapEstimation(currentGlobal) || !isEstimateInputIntact(currentGlobal);
    });

    const finalGlobal = getGlobal();

    // If the dependencies were changed during the estimation, the estimation result should be ignored and the loading
    // indicator should stay (in order to avoid showing the outdated fee). A timer in SwapInitial will trigger another
    // estimation attempt to get the up-to-date fee.
    if (!isEstimateInputIntact(finalGlobal)) {
      return;
    }

    // If the swap estimation request has been rate-limited, we should keep showing the loading indicator
    if (swapUpdate === 'rateLimited') {
      return;
    }

    setGlobal(updateCurrentSwap(finalGlobal, {
      isEstimating: false,
      ...(shouldAvoidSwapEstimation(finalGlobal) ? undefined : swapUpdate),
    }));
  } finally {
    isEstimatingSwap = false;
  }
}

function chooseSwapEstimate(
  global: GlobalState,
  newEstimates: ApiSwapEstimateVariant[],
  proposedBestDexLabel: ApiSwapDexLabel,
) {
  if (newEstimates.length === 0) {
    throw new Error('Unexpected empty `newEstimates` array');
  }

  const { tokenInSlug, currentDexLabel, isDexLabelChanged } = global.currentSwap;

  // If the user has chosen a Dex manually, respect that choice
  if (currentDexLabel && isDexLabelChanged) {
    const selectedEstimate = newEstimates.find(({ dexLabel }) => dexLabel === currentDexLabel);
    if (selectedEstimate) {
      return selectedEstimate;
    }
  }

  // Otherwise, select automatically
  const tokenIn = tokenInSlug ? global.swapTokenInfo.bySlug[tokenInSlug] : undefined;
  const tokenInBalance = tokenInSlug ? selectCurrentAccountTokenBalance(global, tokenInSlug) : undefined;
  const nativeTokenIn = tokenInSlug ? findNativeToken(getChainBySlug(tokenInSlug)) : undefined;
  const nativeTokenInBalance = nativeTokenIn && selectCurrentAccountTokenBalance(global, nativeTokenIn.slug);
  let availableEstimates = newEstimates.filter((variant) => canAffordSwapEstimateVariant({
    variant,
    tokenIn,
    tokenInBalance,
    nativeTokenInBalance,
  }));

  if (availableEstimates.length === 0) {
    availableEstimates = newEstimates;
  }

  return availableEstimates.find(({ dexLabel }) => dexLabel === proposedBestDexLabel)
    ?? availableEstimates[0];
}
