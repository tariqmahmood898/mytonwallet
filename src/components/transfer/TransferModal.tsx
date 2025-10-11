import React, {
  memo, useEffect, useMemo,
} from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { GlobalState, SavedAddress, UserToken } from '../../global/types';
import { TransferState } from '../../global/types';

import { BURN_ADDRESS, NFT_BATCH_SIZE } from '../../config';
import {
  selectCurrentAccountState,
  selectCurrentAccountTokens,
  selectIsMultichainAccount,
} from '../../global/selectors';
import { getDoesUsePinPad } from '../../util/biometrics';
import buildClassName from '../../util/buildClassName';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { toDecimal } from '../../util/decimals';
import { formatCurrency } from '../../util/formatNumber';
import resolveSlideTransitionName from '../../util/resolveSlideTransitionName';
import { shortenAddress } from '../../util/shortenAddress';

import { useDeviceScreen } from '../../hooks/useDeviceScreen';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useModalTransitionKeys from '../../hooks/useModalTransitionKeys';
import usePrevious from '../../hooks/usePrevious';
import useWindowSize from '../../hooks/useWindowSize';

import TransactionBanner from '../common/TransactionBanner';
import LedgerConfirmOperation from '../ledger/LedgerConfirmOperation';
import LedgerConnect from '../ledger/LedgerConnect';
import Modal from '../ui/Modal';
import ModalHeader from '../ui/ModalHeader';
import Transition from '../ui/Transition';
import TransferComplete from './TransferComplete';
import TransferConfirm from './TransferConfirm';
import TransferInitial from './TransferInitial';
import TransferMultiNftProcess from './TransferMultiNftProcess';
import TransferPassword from './TransferPassword';

import modalStyles from '../ui/Modal.module.scss';
import styles from './Transfer.module.scss';

interface StateProps {
  currentTransfer: GlobalState['currentTransfer'];
  tokens?: UserToken[];
  savedAddresses?: SavedAddress[];
  isMediaViewerOpen?: boolean;
  isMultichainAccount: boolean;
}

const SCREEN_HEIGHT_FOR_FORCE_FULLSIZE_NBS = 762; // Computed empirically

function TransferModal({
  currentTransfer: {
    state,
    amount,
    toAddress,
    comment,
    error,
    isLoading,
    txId,
    tokenSlug,
    nfts,
    sentNftsCount,
    diesel,
  },
  tokens,
  savedAddresses,
  isMediaViewerOpen,
  isMultichainAccount,
}: StateProps) {
  const {
    submitTransferConfirm,
    submitTransfer,
    setTransferScreen,
    cancelTransfer,
    showActivityInfo,
  } = getActions();

  const lang = useLang();
  const { isPortrait } = useDeviceScreen();
  const isOpen = state !== TransferState.None;

  const { screenHeight } = useWindowSize();
  const selectedToken = useMemo(() => tokens?.find((token) => token.slug === tokenSlug), [tokenSlug, tokens]);
  const decimals = selectedToken?.decimals;
  const renderedTransactionAmount = usePrevious(amount, true);
  const symbol = selectedToken?.symbol || '';
  const isNftTransfer = Boolean(nfts?.length);
  const isBurning = toAddress === BURN_ADDRESS;

  const { renderingKey, nextKey, updateNextKey } = useModalTransitionKeys(state, isOpen);

  useEffect(() => (
    state === TransferState.Confirm
      ? captureKeyboardListeners({ onEnter: () => submitTransferConfirm() })
      : undefined
  ), [state, submitTransferConfirm]);

  const handleTransferSubmit = useLastCallback((password: string) => {
    submitTransfer({ password });
  });

  const handleBackClick = useLastCallback(() => {
    if (state === TransferState.Confirm) {
      setTransferScreen({ state: TransferState.Initial });
    }
    if (state === TransferState.Password) {
      setTransferScreen({ state: TransferState.Confirm });
    }
  });

  const handleTransactionInfoClick = useLastCallback(() => {
    cancelTransfer({ shouldReset: true });
    showActivityInfo({ id: txId! });
  });

  const handleModalClose = useLastCallback(() => {
    cancelTransfer({ shouldReset: isPortrait });
    updateNextKey();
  });

  const handleModalCloseWithReset = useLastCallback(() => {
    cancelTransfer({ shouldReset: true });
  });

  const handleLedgerConnect = useLastCallback(() => {
    submitTransfer();
  });

  function renderContent(isActive: boolean, isFrom: boolean, currentKey: TransferState) {
    switch (currentKey) {
      case TransferState.Initial:
        return (
          <>
            <ModalHeader title={lang(isNftTransfer ? 'Send NFT' : 'Send')} onClose={handleModalCloseWithReset} />
            <TransferInitial />
          </>
        );
      case TransferState.Confirm:
        return (
          <TransferConfirm
            isActive={isActive}
            token={selectedToken}
            savedAddresses={savedAddresses}
            onBack={isPortrait ? handleBackClick : handleModalClose}
            onClose={handleModalCloseWithReset}
          />
        );
      case TransferState.Password:
        return (
          <TransferPassword
            isActive={isActive}
            isLoading={isLoading}
            isBurning={isBurning}
            error={error}
            onSubmit={handleTransferSubmit}
            onCancel={handleModalCloseWithReset}
            isGaslessWithStars={diesel?.status === 'stars-fee'}
          >
            <TransactionBanner
              tokenIn={selectedToken}
              imageUrl={nfts?.[0]?.thumbnail}
              withChainIcon={isMultichainAccount}
              text={isNftTransfer
                ? (nfts.length > 1 ? lang('%amount% NFTs', { amount: nfts.length }) : nfts[0]?.name || 'NFT')
                : formatCurrency(toDecimal(amount!, decimals), symbol)}
              className={!getDoesUsePinPad() ? styles.transactionBanner : undefined}
              secondText={shortenAddress(toAddress!)}
            />
          </TransferPassword>
        );
      case TransferState.ConnectHardware:
        return (
          <LedgerConnect
            isActive={isActive}
            onConnected={handleLedgerConnect}
            onClose={handleModalCloseWithReset}
          />
        );
      case TransferState.ConfirmHardware:
        return (
          <LedgerConfirmOperation
            text={lang('Please confirm transaction on your Ledger')}
            error={error}
            onClose={handleModalCloseWithReset}
            onTryAgain={handleLedgerConnect}
          />
        );
      case TransferState.Complete:
        return (nfts?.length || 0) <= NFT_BATCH_SIZE ? (
          <TransferComplete
            isActive={isActive}
            nfts={nfts}
            amount={renderedTransactionAmount}
            symbol={symbol}
            txId={txId}
            tokenSlug={tokenSlug}
            toAddress={toAddress}
            comment={comment}
            onInfoClick={handleTransactionInfoClick}
            onClose={handleModalCloseWithReset}
            decimals={decimals}
          />
        ) : (
          <TransferMultiNftProcess
            nfts={nfts!}
            sentNftsCount={sentNftsCount}
            toAddress={toAddress}
            onClose={handleModalCloseWithReset}
          />
        );
    }
  }

  return (
    <Modal
      isOpen={isOpen && !isMediaViewerOpen}
      noBackdropClose
      dialogClassName={styles.modalDialog}
      nativeBottomSheetKey="transfer"
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      forceFullNative={screenHeight <= SCREEN_HEIGHT_FOR_FORCE_FULLSIZE_NBS || renderingKey === TransferState.Password}
      onClose={handleModalCloseWithReset}
      onCloseAnimationEnd={handleModalClose}
    >
      <Transition
        name={resolveSlideTransitionName()}
        className={buildClassName(modalStyles.transition, 'custom-scroll')}
        slideClassName={modalStyles.transitionSlide}
        activeKey={renderingKey}
        nextKey={nextKey}
        onStop={updateNextKey}
      >
        {renderContent}
      </Transition>
    </Modal>
  );
}

export default memo(withGlobal((global): StateProps => {
  const accountState = selectCurrentAccountState(global);

  return {
    currentTransfer: global.currentTransfer,
    tokens: selectCurrentAccountTokens(global),
    savedAddresses: accountState?.savedAddresses,
    isMediaViewerOpen: Boolean(global.mediaViewer.mediaId),
    isMultichainAccount: selectIsMultichainAccount(global, global.currentAccountId!),
  };
})(TransferModal));
