import React, { memo, useState } from '../../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../../global';

import { ContentTab } from '../../../../global/types';

import { IS_CORE_WALLET } from '../../../../config';
import { selectCurrentAccountState } from '../../../../global/selectors';
import buildClassName from '../../../../util/buildClassName';

import useEffectOnce from '../../../../hooks/useEffectOnce';
import { getIsBottomBarHidden, subscribeToBottomBarVisibility } from '../../../../hooks/useHideBottomBar';
import useHistoryBack from '../../../../hooks/useHistoryBack';
import useLang from '../../../../hooks/useLang';

import Button from '../../../ui/Button';

import styles from './BottomBar.module.scss';

interface StateProps {
  areSettingsOpen?: boolean;
  areAssetsActive?: boolean;
  isExploreOpen?: boolean;
}

function BottomBar({ areSettingsOpen, areAssetsActive, isExploreOpen }: StateProps) {
  const { switchToWallet, switchToExplore, switchToSettings } = getActions();

  const lang = useLang();
  const [isHidden, setIsHidden] = useState(getIsBottomBarHidden());
  const isWalletTabActive = !isExploreOpen && !areSettingsOpen;

  useEffectOnce(() => {
    return subscribeToBottomBarVisibility(() => {
      setIsHidden(getIsBottomBarHidden());
    });
  });

  useHistoryBack({
    isActive: isExploreOpen,
    onBack: switchToWallet,
  });

  return (
    <div className={buildClassName(styles.root, isHidden && styles.hidden)}>
      <Button
        isSimple
        className={buildClassName(styles.button, isWalletTabActive && styles.active)}
        onClick={switchToWallet}
      >
        <i className={buildClassName(styles.icon, 'icon-wallet')} />
        <span className={styles.label}>{lang('Wallet')}</span>
      </Button>
      {!IS_CORE_WALLET && (
        <Button
          isSimple
          className={buildClassName(styles.button, isExploreOpen && styles.active)}
          onClick={switchToExplore}
        >
          <i className={buildClassName(styles.icon, 'icon-explore')} />
          <span className={styles.label}>{lang('Explore')}</span>
        </Button>
      )}
      <Button
        isSimple
        className={buildClassName(styles.button, areSettingsOpen && styles.active)}
        onClick={switchToSettings}
      >
        <i className={buildClassName(styles.icon, 'icon-settings')} />
        <span className={styles.label}>{lang('Settings')}</span>
      </Button>
    </div>
  );
}

export default memo(withGlobal((global): StateProps => {
  const { areSettingsOpen, isExploreOpen } = global;
  const { activeContentTab } = selectCurrentAccountState(global) ?? {};

  return {
    areSettingsOpen,
    areAssetsActive: activeContentTab === ContentTab.Assets,
    isExploreOpen,
  };
})(BottomBar));
