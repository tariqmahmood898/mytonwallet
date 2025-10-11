import type { GlobalState } from '../types';

import { explainApiTransferFee, getMaxTransferAmount } from '../../util/fee/transferFee';
import { isValidAddressOrDomain } from '../../util/isValidAddressOrDomain';
import { getChainBySlug } from '../../util/tokens';
import { selectCurrentAccount } from './accounts';
import { selectChainTokenWithMaxBalanceSlow, selectCurrentAccountTokenBalance } from './tokens';

export function selectCurrentTransferMaxAmount(global: GlobalState) {
  const { currentTransfer } = global;
  const tokenBalance = selectCurrentAccountTokenBalance(global, currentTransfer.tokenSlug);
  const { fullFee, canTransferFullBalance } = explainApiTransferFee(currentTransfer);
  return getMaxTransferAmount({
    tokenBalance,
    tokenSlug: currentTransfer.tokenSlug,
    fullFee: fullFee?.terms,
    canTransferFullBalance,
  });
}

/**
 * Returns the token slug that should be set to current transfer form to keep the token in sync with the "to" address
 */
export function selectTokenMatchingCurrentTransferAddressSlow(global: GlobalState): string {
  const { tokenSlug: currentTokenSlug, toAddress } = global.currentTransfer;
  const currentChain = getChainBySlug(currentTokenSlug);

  if (!toAddress) {
    return currentTokenSlug;
  }

  // First try to match a chain by the full address, then by the prefix.
  // Because a valid TRON address is a prefix of a valid TON address, and we want to match TRON in this case.
  for (const isCheckingPrefix of [false, true]) {
    // If the current token already matches the address, no need to change it
    if (!toAddress || isValidAddressOrDomain(toAddress, currentChain, isCheckingPrefix)) {
      return currentTokenSlug;
    }

    // Otherwise, find the best token of the address's chain
    const availableChains = selectCurrentAccount(global)?.byChain;
    if (availableChains) {
      for (const chain of Object.keys(availableChains) as Array<keyof typeof availableChains>) {
        if (!isValidAddressOrDomain(toAddress, chain, isCheckingPrefix)) {
          continue;
        }

        const token = selectChainTokenWithMaxBalanceSlow(global, chain);
        if (token) return token.slug;
      }
    }
  }

  // If the address matches no available chain, don't change the selected token
  return currentTokenSlug;
}
