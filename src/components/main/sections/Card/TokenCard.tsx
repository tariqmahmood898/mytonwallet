import type { ElementRef } from '../../../../lib/teact/teact';
import { useRef } from '../../../../lib/teact/teact';
import React, { memo, useMemo, useState } from '../../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../../global';

import type { ApiBaseCurrency, ApiStakingState } from '../../../../api/types';
import type { IAnchorPosition, PriceHistoryPeriods, TokenPeriod, UserToken } from '../../../../global/types';

import { DEFAULT_PRICE_CURRENCY, HISTORY_PERIODS, IS_CORE_WALLET } from '../../../../config';
import { selectAccountStakingStates, selectCurrentAccountState } from '../../../../global/selectors';
import buildClassName from '../../../../util/buildClassName';
import { calcBigChangeValue } from '../../../../util/calcChangeValue';
import { formatShortDay, SECOND } from '../../../../util/dateFormat';
import { toBig, toDecimal } from '../../../../util/decimals';
import { formatCurrency, getShortCurrencySymbol } from '../../../../util/formatNumber';
import { vibrate } from '../../../../util/haptics';
import { handleUrlClick } from '../../../../util/openUrl';
import { round } from '../../../../util/round';
import { getExplorerName, getExplorerTokenUrl } from '../../../../util/url';
import { IS_IOS } from '../../../../util/windowEnvironment';
import { calculateTokenCardColor } from '../../helpers/cardColors';

import useFlag from '../../../../hooks/useFlag';
import useForceUpdate from '../../../../hooks/useForceUpdate';
import useInterval from '../../../../hooks/useInterval';
import useLang from '../../../../hooks/useLang';
import useLastCallback from '../../../../hooks/useLastCallback';
import useSyncEffect from '../../../../hooks/useSyncEffect';
import useTimeout from '../../../../hooks/useTimeout';

import TokenIcon from '../../../common/TokenIcon';
import TokenPriceChart from '../../../common/TokenPriceChart';
import Button from '../../../ui/Button';
import SensitiveData from '../../../ui/SensitiveData';
import Spinner from '../../../ui/Spinner';
import Transition from '../../../ui/Transition';
import ChartHistorySwitcher from './ChartHistorySwitcher';
import CurrencySwitcherMenu from './CurrencySwitcherMenu';

import styles from './Card.module.scss';

interface OwnProps {
  ref?: ElementRef<HTMLDivElement>;
  token: UserToken;
  classNames?: string;
  isUpdating?: boolean;
  onYieldClick?: (stakingId?: string) => void;
  onClose: NoneToVoidFunction;
}

interface StateProps {
  period?: TokenPeriod;
  baseCurrency: ApiBaseCurrency;
  historyPeriods?: PriceHistoryPeriods;
  tokenAddress?: string;
  isTestnet?: boolean;
  stakingStates?: ApiStakingState[];
  isSensitiveDataHidden?: true;
}

const OFFLINE_TIMEOUT = 120000; // 2 minutes

const CHART_DIMENSIONS = { width: 300, height: 64 };
const INTERVAL = 5 * SECOND;

const DEFAULT_PERIOD = HISTORY_PERIODS[0];

function TokenCard({
  ref,
  isTestnet,
  token,
  classNames,
  period = DEFAULT_PERIOD,
  isUpdating,
  baseCurrency,
  historyPeriods,
  tokenAddress,
  stakingStates,
  isSensitiveDataHidden,
  onYieldClick,
  onClose,
}: OwnProps & StateProps) {
  const { loadPriceHistory } = getActions();

  const lang = useLang();
  const forceUpdate = useForceUpdate();
  const amountRef = useRef<HTMLDivElement>();
  const [currencyMenuAnchor, setCurrencyMenuAnchor] = useState<IAnchorPosition>();
  const [isHistoryMenuOpen, openHistoryMenu, closeHistoryMenu] = useFlag(false);

  const shouldUseDefaultCurrency = baseCurrency === undefined || baseCurrency === token.symbol;
  const chartCurrency = shouldUseDefaultCurrency ? DEFAULT_PRICE_CURRENCY : baseCurrency;

  const currencySymbol = getShortCurrencySymbol(chartCurrency);

  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);

  useSyncEffect(([prevHistoryIndex]) => {
    if (!IS_IOS) return;

    if (prevHistoryIndex !== undefined) {
      void vibrate();
    }
  }, [selectedHistoryIndex]);

  const {
    slug, symbol, amount, name, price: lastPrice, decimals,
  } = token;

  const { annualYield, yieldType, id: stakingId } = useMemo(() => {
    if (IS_CORE_WALLET) return undefined;

    return stakingStates?.reduce((bestState, state) => {
      if (state.tokenSlug === slug && (!bestState || state.balance > bestState.balance)) {
        return state;
      }
      return bestState;
    }, undefined as ApiStakingState | undefined);
  }, [stakingStates, slug]) ?? {};

  const refreshHistory = useLastCallback((newPeriod?: TokenPeriod) => {
    loadPriceHistory({ slug, period: newPeriod ?? period });
  });

  const handleCurrencyChange = useLastCallback((currency: ApiBaseCurrency) => {
    loadPriceHistory({ slug, period, currency });
  });

  const openCurrencyMenu = () => {
    const { left, width, bottom: y } = amountRef.current!.getBoundingClientRect();
    setCurrencyMenuAnchor({ x: left + width, y });
  };

  const closeCurrencyMenu = useLastCallback(() => {
    setCurrencyMenuAnchor(undefined);
  });

  useInterval(refreshHistory, INTERVAL);

  const history = historyPeriods?.[period];

  const tokenLastUpdatedAt = history?.length ? history[history.length - 1][0] * 1000 : undefined;
  const tokenLastHistoryPrice = history?.length ? history[history.length - 1][1] : lastPrice;
  const selectedHistoryPoint = history?.[selectedHistoryIndex];
  const price = selectedHistoryPoint?.[1]
    ?? (shouldUseDefaultCurrency ? tokenLastHistoryPrice : undefined)
    ?? lastPrice;
  // To prevent flickering with spoiler
  const tokenChangePrice = isSensitiveDataHidden ? lastPrice : price;
  const isLoading = !tokenLastUpdatedAt || (Date.now() - tokenLastUpdatedAt > OFFLINE_TIMEOUT);
  const dateStr = selectedHistoryPoint
    ? formatShortDay(lang.code!, selectedHistoryPoint[0] * 1000, true, true)
    : (isLoading && tokenLastUpdatedAt ? formatShortDay(lang.code!, tokenLastUpdatedAt, true, false) : lang('Now'));

  useTimeout(forceUpdate, isLoading ? undefined : OFFLINE_TIMEOUT, [tokenLastUpdatedAt]);

  const initialPrice = useMemo(() => {
    return history?.find(([, value]) => Boolean(value))?.[1];
  }, [history]);

  const valueBig = toBig(amount, decimals).mul(price);
  const value = valueBig.toString();
  const change = initialPrice && price ? price - initialPrice : 0;
  const changeFactor = initialPrice && tokenChangePrice ? tokenChangePrice / initialPrice - 1 : 0;
  const amountChange = initialPrice && tokenChangePrice ? calcBigChangeValue(valueBig, changeFactor).toNumber() : 0;
  const changePrefix = change === undefined ? change : change > 0 ? '↑' : change < 0 ? '↓' : 0;

  const changeValue = amountChange ? Math.abs(round(amountChange, 4)) : 0;
  const changePercent = change ? Math.abs(round((change / initialPrice!) * 100, 2)) : 0;

  const withChange = Boolean(change !== undefined);
  const historyStartDay = history?.length ? new Date(history[0][0] * 1000) : undefined;
  const withExplorerButton = Boolean(token.cmcSlug || tokenAddress);
  const shouldHideChartPeriodSwitcher = !history?.length && token.priceUsd === 0;

  const color = useMemo(() => calculateTokenCardColor(token), [token]);

  function renderExplorerLink() {
    const url = getExplorerTokenUrl(token.chain, token.cmcSlug, tokenAddress, isTestnet);
    if (!url) return undefined;

    const title = (lang(
      'Open on %ton_explorer_name%',
      { ton_explorer_name: getExplorerName(token.chain) },
    ) as string[]).join('');

    return (
      <>
        {' · '}
        <a
          href={url}
          title={title}
          aria-label={title}
          target="_blank"
          rel="noreferrer"
          className={styles.tokenExplorerButton}
          onClick={handleUrlClick}
        >
          <i className="icon-tonexplorer-small" aria-hidden />
        </a>
      </>
    );
  }

  return (
    <div ref={ref} className={buildClassName(styles.container, styles.tokenCard, classNames, color, 'token-card')}>
      <div className={styles.tokenInfo}>
        <Button className={styles.backButton} isSimple onClick={onClose} ariaLabel={lang('Back')}>
          <i className="icon-chevron-left" aria-hidden />
        </Button>
        <TokenIcon
          token={token}
          size="x-large"
          className={styles.tokenLogo}
        />
        <div className={styles.tokenInfoHeader} ref={amountRef}>
          <b className={styles.tokenAmount}>
            <SensitiveData
              isActive={isSensitiveDataHidden}
              maskSkin="cardLightText"
              cols={10}
              rows={2}
              cellSize={8}
            >
              {formatCurrency(toDecimal(amount, token.decimals), symbol)}
            </SensitiveData>
          </b>
          {withChange && (
            <div className={styles.tokenValue}>
              <SensitiveData
                isActive={isSensitiveDataHidden}
                maskSkin="cardLightText"
                align="right"
                cols={10}
                rows={2}
                cellSize={8}
              >
                <div className={styles.currencySwitcher} role="button" tabIndex={0} onClick={openCurrencyMenu}>
                  ≈&thinsp;{formatCurrency(value, currencySymbol, undefined, true)}
                  <i className={buildClassName('icon', 'icon-caret-down', styles.iconCaretSmall)} aria-hidden />
                </div>
                <CurrencySwitcherMenu
                  isOpen={Boolean(currencyMenuAnchor)}
                  triggerRef={amountRef}
                  anchor={currencyMenuAnchor}
                  menuPositionX="right"
                  excludedCurrency={token.symbol}
                  onClose={closeCurrencyMenu}
                  onChange={handleCurrencyChange}
                />
              </SensitiveData>
            </div>
          )}
        </div>
        <div className={styles.tokenInfoSubheader}>
          <span className={styles.tokenTitle}>
            <span className={styles.tokenName}>{name}</span>
            {yieldType && (
              <span
                className={buildClassName(styles.apy, onYieldClick && styles.interactive)}
                onClick={onYieldClick ? () => onYieldClick(stakingId) : undefined}
              >
                {yieldType} {round(annualYield ?? 0, 2)}%
              </span>
            )}
          </span>
          {withChange && Boolean(changeValue) && (
            <div className={styles.tokenChange}>
              {changePrefix}&thinsp;
              {Math.abs(changePercent)}% ·
              <SensitiveData
                isActive={isSensitiveDataHidden}
                align="right"
                maskSkin="cardLightText"
                cols={6}
                rows={2}
                cellSize={8}
                className={styles.tokenChangeSensitiveData}
                maskClassName={styles.tokenChangeSpoiler}
              >
                {formatCurrency(Math.abs(changeValue), currencySymbol)}
              </SensitiveData>
            </div>
          )}
        </div>
      </div>

      <Transition activeKey={!history ? 0 : history.length ? HISTORY_PERIODS.indexOf(period) + 1 : -1} name="fade">
        {!history ? (
          <div className={buildClassName(styles.isLoading)}>
            <Spinner color="white" className={styles.center} />
          </div>
        ) : history?.length ? (
          <>
            <TokenPriceChart
              className={styles.chart}
              imgClassName={styles.chartImg}
              width={CHART_DIMENSIONS.width}
              height={CHART_DIMENSIONS.height}
              prices={history}
              selectedIndex={selectedHistoryIndex}
              onSelectIndex={setSelectedHistoryIndex}
              isUpdating={isUpdating}
            />

            <div className={styles.tokenHistoryPrice}>
              {formatCurrency(history[0][1], currencySymbol, 2, true)}
              <div className={styles.tokenPriceDate}>{formatShortDay(lang.code!, historyStartDay!)}</div>
            </div>
          </>
        ) : undefined}
      </Transition>

      <span
        className={buildClassName(styles.periodChooser, shouldHideChartPeriodSwitcher && styles.periodChooserHidden)}
        role="button"
        tabIndex={0}
        onClick={openHistoryMenu}
      >
        {period === 'ALL' ? 'All' : period}
        <i className={buildClassName('icon', 'icon-caret-down', styles.iconCaretSmall)} aria-hidden />
        <ChartHistorySwitcher
          isOpen={isHistoryMenuOpen}
          onChange={refreshHistory}
          onClose={closeHistoryMenu}
        />
      </span>

      <div className={styles.tokenCurrentPrice}>
        {formatCurrency(price, currencySymbol, selectedHistoryIndex === -1 ? 2 : 4, true)}
        <div className={styles.tokenPriceDate}>
          {dateStr}
          {withExplorerButton && renderExplorerLink()}
        </div>
      </div>
    </div>
  );
}

export default memo(
  withGlobal<OwnProps>((global, ownProps): StateProps => {
    const slug = ownProps.token.slug;
    const accountState = selectCurrentAccountState(global);
    const tokenAddress = global.tokenInfo.bySlug[slug]?.tokenAddress;
    const stakingStates = selectAccountStakingStates(global, global.currentAccountId!);

    return {
      isTestnet: global.settings.isTestnet,
      period: accountState?.currentTokenPeriod,
      baseCurrency: global.settings.baseCurrency,
      historyPeriods: global.tokenPriceHistory.bySlug[ownProps.token.slug],
      tokenAddress,
      stakingStates,
      isSensitiveDataHidden: global.settings.isSensitiveDataHidden,
    };
  })(TokenCard),
);
