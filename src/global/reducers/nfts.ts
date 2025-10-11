import type { ApiNft } from '../../api/types';
import type { GlobalState } from '../types';

import isEmptyObject from '../../util/isEmptyObject';
import { selectAccountState } from '../selectors';
import { updateAccountSettings, updateAccountState } from './misc';

export function addNft(global: GlobalState, accountId: string, nft: ApiNft, shouldAppendToEnd?: boolean) {
  const nftAddress = nft.address;
  const nfts = selectAccountState(global, accountId)!.nfts;
  const orderedAddresses = (nfts?.orderedAddresses ?? []).filter((address) => address !== nftAddress);

  return updateAccountState(global, accountId, {
    nfts: {
      ...nfts,
      byAddress: { ...nfts?.byAddress, [nftAddress]: nft },
      orderedAddresses: shouldAppendToEnd
        ? orderedAddresses.concat(nftAddress)
        : [nftAddress, ...orderedAddresses],
    },
  });
}

export function removeNft(global: GlobalState, accountId: string, nftAddress: string) {
  const nfts = selectAccountState(global, accountId)!.nfts;
  const orderedAddresses = (nfts?.orderedAddresses ?? []).filter((address) => address !== nftAddress);
  const selectedAddresses = (nfts?.selectedAddresses ?? []).filter((address) => address !== nftAddress);
  const { [nftAddress]: removedNft, ...byAddress } = nfts?.byAddress ?? {};

  return updateAccountState(global, accountId, {
    nfts: {
      ...nfts,
      byAddress,
      orderedAddresses,
      selectedAddresses,
    },
  });
}

export function updateNft(global: GlobalState, accountId: string, nftAddress: string, partial: Partial<ApiNft>) {
  const nfts = selectAccountState(global, accountId)!.nfts;
  const nft = nfts?.byAddress?.[nftAddress];
  if (!nfts || !nft) return global;

  return updateAccountState(global, accountId, {
    nfts: {
      ...nfts,
      byAddress: {
        ...nfts.byAddress,
        [nftAddress]: { ...nft, ...partial },
      },
    },
  });
}

export function addToSelectedAddresses(global: GlobalState, accountId: string, nftAddresses: string[]) {
  const nfts = selectAccountState(global, accountId)!.nfts;
  const selectedAddresses = [...(nfts?.selectedAddresses ?? []), ...nftAddresses];

  return updateAccountState(global, accountId, {
    nfts: {
      ...nfts!,
      selectedAddresses,
    },
  });
}

export function removeFromSelectedAddresses(global: GlobalState, accountId: string, nftAddress: string) {
  const nfts = selectAccountState(global, accountId)!.nfts;
  const selectedAddresses = (nfts?.selectedAddresses ?? []).filter((address) => address !== nftAddress);

  return updateAccountState(global, accountId, {
    nfts: {
      ...nfts!,
      selectedAddresses: selectedAddresses.length ? selectedAddresses : undefined,
    },
  });
}

// Updates the account settings to ensure the specified NFT is up-to-date.
export function updateAccountSettingsBackgroundNft(global: GlobalState, nft: ApiNft) {
  Object.entries(global.settings.byAccountId).forEach(([accountId, settings]) => {
    if (settings.cardBackgroundNft?.address === nft.address) {
      global = updateAccountSettings(global, accountId, {
        ...settings,
        cardBackgroundNft: nft,
      });
    }
  });

  return global;
}

export function addUnorderedNfts(
  global: GlobalState,
  accountId: string,
  updatedNfts?: Record<string, ApiNft>,
): GlobalState {
  if (!updatedNfts || isEmptyObject(updatedNfts)) {
    return global;
  }

  const { byAddress } = selectAccountState(global, accountId)?.nfts || { byAddress: {} };

  Object.values(updatedNfts).forEach((nft) => {
    const existingNft = byAddress?.[nft.address];
    if (existingNft) {
      global = updateNft(global, accountId, nft.address, nft);
    } else {
      global = addNft(global, accountId, nft, true);
    }
  });

  return global;
}
