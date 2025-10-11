import type { BottomSheetKeys } from '@mytonwallet/native-bottom-sheet';
import { BottomSheet } from '@mytonwallet/native-bottom-sheet';
import type { ElementRef, RefObject, TeactNode } from '../../lib/teact/teact';
import React, {
  beginHeavyAnimation,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import { ANIMATION_END_DELAY, IS_EXTENSION, IS_TELEGRAM_APP } from '../../config';
import buildClassName from '../../util/buildClassName';
import { captureEvents, SwipeDirection } from '../../util/captureEvents';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { getIsSwipeToCloseDisabled } from '../../util/modalSwipeManager';
import { createSignal } from '../../util/signals';
import {
  disableTelegramMiniAppSwipeToClose,
  enableTelegramMiniAppSwipeToClose,
} from '../../util/telegram';
import trapFocus from '../../util/trapFocus';
import { IS_ANDROID, IS_DELEGATED_BOTTOM_SHEET, IS_TOUCH_ENV } from '../../util/windowEnvironment';
import windowSize from '../../util/windowSize';

import freezeWhenClosed from '../../hooks/freezeWhenClosed';
import { getIsForcedFullSize, useDelegatedBottomSheet } from '../../hooks/useDelegatedBottomSheet';
import { useDelegatingBottomSheet } from '../../hooks/useDelegatingBottomSheet';
import { useDeviceScreen } from '../../hooks/useDeviceScreen';
import useEffectWithPrevDeps from '../../hooks/useEffectWithPrevDeps';
import useHideBrowser from '../../hooks/useHideBrowser';
import useHistoryBack from '../../hooks/useHistoryBack';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useShowTransition from '../../hooks/useShowTransition';
import useToggleClass from '../../hooks/useToggleClass';

import Button from './Button';
import { getInAppBrowser } from './InAppBrowser';
import Portal from './Portal';

import styles from './Modal.module.scss';

type OwnProps = {
  title?: string | TeactNode;
  className?: string;
  dialogClassName?: string;
  titleClassName?: string;
  contentClassName?: string;
  isOpen?: boolean;
  isCompact?: boolean;
  nativeBottomSheetKey?: BottomSheetKeys;
  forceFullNative?: boolean; // Always open in "full" size
  noResetFullNativeOnBlur?: boolean; // Don't reset "full" size on blur
  isInAppLock?: boolean;
  forceBottomSheet?: boolean;
  noBackdrop?: boolean;
  noBackdropClose?: boolean;
  header?: any;
  hasCloseButton?: boolean;
  children: TeactNode;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
  onEnter?: NoneToVoidFunction;
  dialogRef?: ElementRef<HTMLDivElement>;
};

type StateProps = {
  isTemporarilyClosed: boolean;
};

export const CLOSE_DURATION = 350;
export const CLOSE_DURATION_PORTRAIT = IS_ANDROID ? 200 : 500;
const SCROLL_CONTENT_CHECK_THRESHOLD_MS = 500;

const [getModalCloseSignal, setModalCloseSignal] = createSignal<number>(Date.now());

export function closeModal() {
  setModalCloseSignal(Date.now());
}

// Track open modals with nativeBottomSheetKey
const openNativeBottomSheetModals = new Set<BottomSheetKeys>();

export function getIsAnyNativeBottomSheetModalOpen(): boolean {
  return openNativeBottomSheetModals.size > 0;
}

function Modal({
  dialogRef,
  title,
  className,
  dialogClassName,
  titleClassName,
  contentClassName,
  isOpen: doesWantToBeOpened,
  isTemporarilyClosed,
  isCompact,
  nativeBottomSheetKey,
  forceFullNative,
  forceBottomSheet,
  isInAppLock,
  noResetFullNativeOnBlur,
  noBackdrop,
  noBackdropClose,
  header,
  hasCloseButton,
  children,
  onClose: onCloseProp,
  onCloseAnimationEnd,
  onEnter,
}: OwnProps & StateProps): TeactJsx {
  const isOpen = doesWantToBeOpened && !isTemporarilyClosed;
  const onClose = useLastCallback(() => {
    if (isTemporarilyClosed && doesWantToBeOpened) {
      return undefined;
    }

    return onCloseProp();
  });

  const lang = useLang();

  const modalRef = useRef<HTMLDivElement>();
  const localDialogRef = useRef<HTMLDivElement>();
  const swipeDownDateRef = useRef<number>();
  dialogRef ||= localDialogRef;

  const { isPortrait } = useDeviceScreen();

  useHideBrowser(isOpen, isCompact);

  const animationDuration = (isPortrait ? CLOSE_DURATION_PORTRAIT : CLOSE_DURATION) + ANIMATION_END_DELAY;

  const isSlideUp = !isCompact && isPortrait;

  useHistoryBack({ isActive: isOpen, onBack: onClose, shouldIgnoreForTelegram: isCompact });

  useEffect(() => {
    if (!IS_TELEGRAM_APP || !isOpen || isCompact) return undefined;

    disableTelegramMiniAppSwipeToClose();

    return enableTelegramMiniAppSwipeToClose;
  }, [isCompact, isOpen]);

  useEffectWithPrevDeps(([prevIsOpen]) => {
    // Expand NBS to full size for a compact modal inside NBS
    if (IS_DELEGATED_BOTTOM_SHEET && isCompact && (prevIsOpen || isOpen) && !getIsForcedFullSize()) {
      void BottomSheet.toggleSelfFullSize({ isFullSize: !!isOpen });
    }
  }, [isOpen, isCompact]);

  useEffect(() => {
    if (IS_DELEGATED_BOTTOM_SHEET || !isOpen) return undefined;

    return getModalCloseSignal.subscribe(onClose);
  }, [isOpen, onClose]);

  useEffect(
    () => (isOpen ? captureKeyboardListeners({
      onEsc: { handler: onClose, shouldPreventDefault: IS_EXTENSION },
      ...(onEnter && { onEnter }),
    }) : undefined),
    [isOpen, onClose, onEnter],
  );
  useEffect(() => (isOpen && modalRef.current ? trapFocus(modalRef.current) : undefined), [isOpen]);
  useToggleClass({ className: 'is-modal-open', isActive: !isCompact && isOpen });

  useLayoutEffect(() => (
    isOpen ? beginHeavyAnimation(animationDuration) : undefined
  ), [animationDuration, isOpen]);

  // Track modal state for modals with nativeBottomSheetKey
  useEffect(() => {
    if (!nativeBottomSheetKey) return;

    if (isOpen) {
      openNativeBottomSheetModals.add(nativeBottomSheetKey);
    } else {
      openNativeBottomSheetModals.delete(nativeBottomSheetKey);
    }

    return () => {
      openNativeBottomSheetModals.delete(nativeBottomSheetKey);
    };
  }, [isOpen, nativeBottomSheetKey]);

  // Make sure to hide browser before presenting modals
  const [isBrowserHidden, setIsBrowserHidden] = useState(false);
  useEffect(() => {
    const browser = getInAppBrowser();
    if (!isOpen) {
      setIsBrowserHidden(false); // Reset to re-hide it next time
      // Before showing browser, make sure that closed modals are updated state properly
      requestAnimationFrame(() => {
        browser?.show();
      });
      return;
    }

    void browser?.hide().then(() => {
      setIsBrowserHidden(true);
    });
  }, [isOpen]);

  const isDelegatingToNative = useDelegatingBottomSheet(
    nativeBottomSheetKey,
    isPortrait,
    isOpen && (!getInAppBrowser() || isBrowserHidden),
    onClose,
  );

  useDelegatedBottomSheet(
    nativeBottomSheetKey,
    isOpen && (!getInAppBrowser() || isBrowserHidden),
    onClose,
    dialogRef,
    forceFullNative,
    noResetFullNativeOnBlur,
  );

  useEffect(() => {
    if (!IS_TOUCH_ENV || !isOpen || !isPortrait || !isSlideUp || IS_DELEGATED_BOTTOM_SHEET || isDelegatingToNative) {
      return undefined;
    }

    return captureEvents(modalRef.current!, {
      excludedClosestSelector: '.capture-scroll',
      onSwipe: (e: Event, direction: SwipeDirection) => {
        if (direction === SwipeDirection.Down && getCanCloseModal(swipeDownDateRef, e.target as HTMLElement)) {
          onClose();
          return true;
        }

        return false;
      },
    });
  }, [isOpen, isPortrait, isSlideUp, isDelegatingToNative, onClose]);

  const { shouldRender } = useShowTransition({
    ref: modalRef,
    isOpen: isOpen && !isDelegatingToNative,
    onCloseAnimationEnd,
    className: false,
    closeDuration: animationDuration,
    withShouldRender: true,
  });

  if (!shouldRender) {
    return undefined;
  }

  function renderHeader() {
    if (header) {
      return header;
    }

    if (!title) {
      return undefined;
    }

    return (
      <div
        className={buildClassName(styles.header, styles.header_wideContent, !hasCloseButton && styles.header_noClose)}
      >
        <div className={buildClassName(styles.title, styles.singleTitle, titleClassName)}>{title}</div>
        {hasCloseButton && (
          <Button isRound className={styles.closeButton} ariaLabel={lang('Close')} onClick={onClose}>
            <i className={buildClassName(styles.closeIcon, 'icon-close')} aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  const fullClassName = buildClassName(
    styles.modal,
    className,
    isSlideUp && styles.slideUpAnimation,
    isCompact && styles.compact,
    isCompact && 'is-compact-modal',
    forceBottomSheet && styles.forceBottomSheet,
    isInAppLock && styles.inAppLock,
  );

  const backdropFullClass = buildClassName(styles.backdrop, noBackdrop && styles.noBackdrop);

  const contentFullClassName = buildClassName(
    styles.content,
    isCompact && styles.contentCompact,
    'custom-scroll',
    contentClassName,
  );

  return (
    <Portal>
      <div ref={modalRef} className={fullClassName} tabIndex={-1} role="dialog">
        <div className={styles.container}>
          <div className={backdropFullClass} onClick={!noBackdropClose ? onClose : undefined} />
          <div
            className={buildClassName(styles.dialog, dialogClassName)}
            ref={dialogRef}
          >
            {renderHeader()}
            <div className={contentFullClassName}>{children}</div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

const FreezeWhenClosedModal = freezeWhenClosed(Modal);

export default withGlobal((global, { isInAppLock }: OwnProps): StateProps => {
  return {
    // This behavior is intended to prevent NBS from rendering above the app lock screen,
    // which is an iOS-only issue. We retain this fix on all platforms to unify behavior.
    isTemporarilyClosed: !(isInAppLock || !global.isAppLockActive),
  };
})(FreezeWhenClosedModal);

function getCanCloseModal(lastScrollRef: RefObject<number | undefined>, el?: HTMLElement) {
  if (windowSize.getIsKeyboardVisible() || getIsSwipeToCloseDisabled()) {
    return false;
  }

  const now = Date.now();
  if (lastScrollRef.current && now - lastScrollRef.current < SCROLL_CONTENT_CHECK_THRESHOLD_MS) {
    return false;
  }

  lastScrollRef.current = now;
  const scrollEl = el?.closest('.custom-scroll');

  return !scrollEl || scrollEl.scrollTop === 0;
}
