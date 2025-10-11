import { AuthState } from '../../types';

import { callActionInMain } from '../../../util/multitab';
import { IS_DELEGATED_BOTTOM_SHEET } from '../../../util/windowEnvironment';
import { addActionHandler, setGlobal } from '../../index';
import { resetHardware, updateAuth } from '../../reducers';

addActionHandler('openAbout', (global) => {
  setGlobal(updateAuth(global, { state: AuthState.about, error: undefined }));
});

addActionHandler('closeAbout', (global) => {
  setGlobal(updateAuth(global, { state: AuthState.none, error: undefined }));
});

addActionHandler('openDisclaimer', (global) => {
  setGlobal(updateAuth(global, { state: AuthState.disclaimer, error: undefined }));
});

addActionHandler('closeDisclaimer', (global) => {
  setGlobal(updateAuth(global, { state: AuthState.none, error: undefined }));
});

addActionHandler('startImportViewAccount', (global) => {
  setGlobal(updateAuth(global, { state: AuthState.importViewAccount, error: undefined }));
});

addActionHandler('closeImportViewAccount', (global) => {
  setGlobal(updateAuth(global, { state: AuthState.none, error: undefined }));
});

addActionHandler('openAuthImportWalletModal', (global) => {
  global = updateAuth(global, { isImportModalOpen: true });
  setGlobal(global);
});

addActionHandler('closeAuthImportWalletModal', (global) => {
  if (IS_DELEGATED_BOTTOM_SHEET) {
    callActionInMain('closeAuthImportWalletModal');
  }

  global = updateAuth(global, { isImportModalOpen: undefined });
  setGlobal(global);
});

addActionHandler('cleanAuthError', (global) => {
  setGlobal(updateAuth(global, { error: undefined }));
});

addActionHandler('openHardwareWalletModal', (global, actions, { chain }) => {
  global = resetHardware(global, chain, true);

  return { ...global, isHardwareModalOpen: true };
});

addActionHandler('closeHardwareWalletModal', (global) => {
  return { ...global, isHardwareModalOpen: false };
});
