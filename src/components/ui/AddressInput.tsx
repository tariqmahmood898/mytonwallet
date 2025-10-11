import React, {
  type ElementRef,
  memo,
  useMemo,
  useRef,
  useState,
} from '../../lib/teact/teact';
import { getActions } from '../../global';

import type { ApiChain } from '../../api/types';
import type { Account, SavedAddress } from '../../global/types';

import buildClassName from '../../util/buildClassName';
import { readClipboardContent } from '../../util/clipboard';
import { isDnsDomain } from '../../util/dns';
import { getLocalAddressName } from '../../util/getLocalAddressName';
import { isValidAddressOrDomain } from '../../util/isValidAddressOrDomain';
import { shortenAddress } from '../../util/shortenAddress';
import {
  getIsMobileTelegramApp,
  IS_ANDROID,
  IS_CLIPBOARDS_SUPPORTED,
  IS_IOS,
} from '../../util/windowEnvironment';

import useEffectOnce from '../../hooks/useEffectOnce';
import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useQrScannerSupport from '../../hooks/useQrScannerSupport';
import useUniqueId from '../../hooks/useUniqueId';

import DeleteSavedAddressModal from '../main/modals/DeleteSavedAddressModal';
import AddressBook from './AddressBook';
import Button from './Button';
import Input from './Input';
import Transition from './Transition';

import styles from './AddressInput.module.scss';

export const INPUT_CLEAR_BUTTON_ID = 'input-clear-button';

interface OwnProps {
  ref?: ElementRef<HTMLInputElement | HTMLTextAreaElement>;
  label: string;
  value: string;
  chain?: ApiChain;
  isStatic?: boolean;
  withQrScan?: boolean;
  address: string;
  addressName: string;
  addressBookChain?: ApiChain;
  accounts?: Record<string, Account>;
  currentAccountId: string;
  savedAddresses?: SavedAddress[];
  validateAddress?: ({ address }: { address?: string }) => void;
  error?: string;
  onInput: (value: string, isValueReplaced?: boolean) => void;
  onClose: NoneToVoidFunction;
}

const SHORT_ADDRESS_SHIFT = 4;
const SHORT_SINGLE_ADDRESS_SHIFT = 11;
const MIN_ADDRESS_LENGTH_TO_SHORTEN = SHORT_SINGLE_ADDRESS_SHIFT * 2;
const SAVED_ADDRESS_OPEN_DELAY = 300;

function AddressInput({
  ref,
  label,
  value,
  chain,
  isStatic,
  withQrScan,
  address,
  addressName,
  addressBookChain,
  accounts,
  currentAccountId,
  savedAddresses,
  validateAddress,
  error,
  onInput,
  onClose,
}: OwnProps) {
  const {
    showNotification,
    requestOpenQrScanner,
  } = getActions();

  const lang = useLang();

  const addressBookTimeoutRef = useRef<number>();

  const [addressForDeletion, setAddressForDeletion] = useState<string | undefined>();
  const [chainForDeletion, setChainForDeletion] = useState<ApiChain | undefined>();
  const [isAddressBookOpen, openAddressBook, closeAddressBook] = useFlag();
  const [isFocused, markFocused, unmarkFocused] = useFlag();
  const [shouldRenderPasteButton, setShouldRenderPasteButton] = useState(IS_CLIPBOARDS_SUPPORTED);
  const isQrScannerSupported = useQrScannerSupport();
  const inputId = useUniqueId('address-');

  const isAddressValid = chain ? isValidAddressOrDomain(value, chain) : undefined;
  const hasAddressError = value.length > 0 && !isAddressValid;
  const localError = hasAddressError ? lang('Incorrect address') : undefined;

  const addressBookAccountIds = useMemo(() => {
    return accounts ? Object.keys(accounts).filter((accountId) => accountId !== currentAccountId) : [];
  }, [currentAccountId, accounts]);
  const shouldUseAddressBook = useMemo(() => {
    return addressBookAccountIds.length > 0 || (savedAddresses && savedAddresses.length > 0);
  }, [addressBookAccountIds.length, savedAddresses]);

  const localAddressName = useMemo(() => {
    return chain && value ? getLocalAddressName({
      address: value,
      chain,
      currentAccountId,
      savedAddresses,
      accounts: accounts!,
    }) : undefined;
  }, [accounts, chain, currentAccountId, savedAddresses, value]);

  const withPasteButton = shouldRenderPasteButton && !value;
  const withQrButton = withQrScan && isQrScannerSupported;
  const withButton = withQrButton || withPasteButton || !!value.length;

  useEffectOnce(() => {
    return () => {
      if (addressBookTimeoutRef.current) {
        window.clearTimeout(addressBookTimeoutRef.current);
      }
    };
  });

  const addressOverlay = useMemo(() => {
    if (!address) return undefined;
    const renderedAddressName = localAddressName || addressName;

    const addressShort = !renderedAddressName && address.length > MIN_ADDRESS_LENGTH_TO_SHORTEN
      ? shortenAddress(address, SHORT_SINGLE_ADDRESS_SHIFT) || ''
      : address;

    return (
      <>
        {renderedAddressName && <span className={styles.addressName}>{renderedAddressName}</span>}
        <span className={buildClassName(styles.addressValue, !renderedAddressName && styles.addressValueSingle)}>
          {renderedAddressName ? shortenAddress(address, SHORT_ADDRESS_SHIFT) : addressShort}
        </span>
      </>
    );
  }, [address, localAddressName, addressName]);

  const handlePasteClick = useLastCallback(async () => {
    try {
      const { type, text } = await readClipboardContent();

      if (type === 'text/plain') {
        const newValue = text.trim();
        onInput(newValue, true);

        handleAddressCheck(newValue);
      }
    } catch (err: any) {
      showNotification({ message: lang('Error reading clipboard') });
      setShouldRenderPasteButton(false);
    }
  });

  const handleQrScanClick = useLastCallback(() => {
    if (IS_IOS && getIsMobileTelegramApp()) {
      alert('Scanning is temporarily not available');
      return;
    }

    requestOpenQrScanner();
    onClose();
  });

  const handleAddressCheck = useLastCallback((address?: string) => {
    if (!validateAddress) return;

    if ((address && chain && isValidAddressOrDomain(address, chain)) || !address) {
      validateAddress({ address });
    }
  });

  const handleAddressFocus = useLastCallback(() => {
    markFocused();

    if (shouldUseAddressBook) {
      // Simultaneous opening of the virtual keyboard and display of Saved Addresses causes animation degradation
      if (IS_ANDROID) {
        addressBookTimeoutRef.current = window.setTimeout(openAddressBook, SAVED_ADDRESS_OPEN_DELAY);
      } else {
        openAddressBook();
      }
    }
  });

  const handleAddressBlur = useLastCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    unmarkFocused();

    if (e.relatedTarget?.id === INPUT_CLEAR_BUTTON_ID) {
      handleAddressBookClose();
      handleAddressCheck(value);

      return;
    }

    let addressToCheck = value;
    if (isDnsDomain(value) && value !== value.toLowerCase()) {
      addressToCheck = value.toLowerCase().trim();
      onInput(addressToCheck);
    } else if (value !== value.trim()) {
      addressToCheck = value.trim();
      onInput(addressToCheck);
    }

    requestAnimationFrame(() => {
      handleAddressBookClose();
      handleAddressCheck(addressToCheck);
    });
  });

  const handleAddressClear = useLastCallback(() => {
    onInput('');
    handleAddressCheck();
  });

  const handleAddressBookClose = useLastCallback(() => {
    if (!shouldUseAddressBook || !isAddressBookOpen) return;

    closeAddressBook();

    if (addressBookTimeoutRef.current) {
      window.clearTimeout(addressBookTimeoutRef.current);
    }
  });

  const handleDeleteSavedAddressClick = useLastCallback((address: string) => {
    setAddressForDeletion(address);
    setChainForDeletion(chain);
    closeAddressBook();
  });

  const handleDeleteSavedAddressModalClose = useLastCallback(() => {
    setAddressForDeletion(undefined);
    setChainForDeletion(undefined);
  });

  const handleAddressBookItemSelect = useLastCallback((address: string) => {
    onInput(address, true);
    closeAddressBook();
  });

  function renderInputActions() {
    const wrapperClassName = buildClassName(
      styles.inputButtonWrapper,
      isFocused && styles.inputButtonWrapperWithFocus,
    );

    return (
      <Transition className={styles.inputButtonTransition} activeKey={value.length ? 0 : 1} name="fade">
        {value.length ? (
          <div className={wrapperClassName}>
            <Button
              isSimple
              id={INPUT_CLEAR_BUTTON_ID}
              className={buildClassName(styles.inputButton, styles.inputButtonClear)}
              onClick={handleAddressClear}
              ariaLabel={lang('Clear')}
            >
              <i className="icon-close-filled" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className={wrapperClassName}>
            {withQrButton && (
              <Button
                isSimple
                className={styles.inputButton}
                onClick={handleQrScanClick}
                ariaLabel={lang('Scan QR Code')}
              >
                <i className="icon-qr-scanner-alt" aria-hidden />
              </Button>
            )}
            {withPasteButton && (
              <Button isSimple className={styles.inputButton} onClick={handlePasteClick} ariaLabel={lang('Paste')}>
                <i className="icon-paste" aria-hidden />
              </Button>
            )}
          </div>
        )}
      </Transition>
    );
  }

  return (
    <>
      <Input
        id={inputId}
        ref={ref}
        className={buildClassName(isStatic && styles.inputStatic, withButton && styles.inputWithIcon)}
        isRequired
        isStatic={isStatic}
        label={label}
        placeholder={lang('Wallet address or domain')}
        value={value}
        error={localError || error}
        autoCorrect={false}
        valueOverlay={!localError ? addressOverlay : undefined}
        onInput={onInput}
        onFocus={handleAddressFocus}
        onBlur={handleAddressBlur}
      >
        {renderInputActions()}
      </Input>
      {shouldUseAddressBook && (
        <>
          <AddressBook
            isOpen={isAddressBookOpen}
            currentChain={addressBookChain}
            currentAddress={value}
            otherAccountIds={addressBookAccountIds}
            onAddressSelect={handleAddressBookItemSelect}
            onSavedAddressDelete={handleDeleteSavedAddressClick}
            onClose={closeAddressBook}
          />
          <DeleteSavedAddressModal
            isOpen={Boolean(addressForDeletion)}
            address={addressForDeletion}
            chain={chainForDeletion}
            onClose={handleDeleteSavedAddressModalClose}
          />
        </>
      )}
    </>
  );
}

export default memo(AddressInput);
