import React, {
  memo, useEffect, useRef, useState,
} from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiCardInfo, ApiCardsInfo, ApiMtwCardType } from '../../api/types';
import type { LangFn } from '../../hooks/useLang';

import { MTW_CARDS_MINT_BASE_URL } from '../../config';
import { selectCurrentToncoinBalance } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { captureEvents, SwipeDirection } from '../../util/captureEvents';
import { formatNumber } from '../../util/formatNumber';
import { round } from '../../util/round';
import { IS_TOUCH_ENV } from '../../util/windowEnvironment';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Button from '../ui/Button';
import Transition from '../ui/Transition';
import CardPros from './CardPros';

import modalStyles from '../ui/Modal.module.scss';
import styles from './MintCardModal.module.scss';

export const MAP_CARD_TYPE_TO_NAME = {
  standard: 'Standard Card',
  silver: 'Silver Card',
  gold: 'Gold Card',
  platinum: 'Platinum Card',
  black: 'Black Card',
} as const;

interface OwnProps {
  cardsInfo: ApiCardsInfo;
}

interface StateProps {
  tonBalance: bigint;
}

enum CardSlides {
  Standard = 0,
  Silver,
  Gold,
  Platinum,
  Black,
}

const TOTAL_SLIDES = Object.values(CardSlides).length / 2;

function CardRoster({ cardsInfo, tonBalance }: OwnProps & StateProps) {
  const { closeMintCardModal } = getActions();

  const lang = useLang();

  const transitionRef = useRef<HTMLDivElement>();
  const [currentSlide, setCurrentSlide] = useState<CardSlides>(CardSlides.Standard);
  const [nextKey, setNextKey] = useState<CardSlides>(CardSlides.Silver);

  const showNextSlide = useLastCallback(() => {
    setCurrentSlide((current) => (current === CardSlides.Black ? CardSlides.Standard : current + 1));
    setNextKey((current) => (current === CardSlides.Black ? CardSlides.Standard : current + 1));
  });

  const showPrevSlide = useLastCallback(() => {
    setCurrentSlide((current) => (current === CardSlides.Standard ? CardSlides.Black : current - 1));
    setNextKey((current) => (current === CardSlides.Standard ? CardSlides.Black : current - 1));
  });

  useEffect(() => {
    if (!IS_TOUCH_ENV) {
      return undefined;
    }

    return captureEvents(transitionRef.current!, {
      onSwipe: (e, direction) => {
        if (direction === SwipeDirection.Left) {
          showNextSlide();
          return true;
        } else if (direction === SwipeDirection.Right) {
          showPrevSlide();
          return true;
        }

        return false;
      },
      selectorToPreventScroll: '.custom-scroll',
    });
  }, []);

  function renderControls() {
    return (
      <>
        <Button
          isRound
          className={buildClassName(styles.close, modalStyles.closeButton)}
          ariaLabel={lang('Close')}
          onClick={closeMintCardModal}
        >
          <i className={buildClassName(modalStyles.closeIcon, 'icon-close')} aria-hidden />
        </Button>
        <button
          className={buildClassName(styles.navigation, styles.navigationLeft)}
          type="button"
          aria-label={lang('Prev')}
          onClick={() => showPrevSlide()}
        >
          <i className={buildClassName(styles.navigationIcon, 'icon-chevron-left')} aria-hidden />
        </button>
        <button
          className={buildClassName(styles.navigation, styles.navigationRight)}
          type="button"
          onClick={() => showNextSlide()}
          aria-label={lang('Next')}
        >
          <i className={buildClassName(styles.navigationIcon, 'icon-chevron-right')} aria-hidden />
        </button>
      </>
    );
  }

  function renderContent(isActive: boolean, isFrom: boolean, currentKey: CardSlides) {
    const defaultProps = {
      lang,
      tonBalance,
      currentKey,
    };

    switch (currentKey) {
      case CardSlides.Standard:
        return renderMediaCard({
          ...defaultProps,
          title: MAP_CARD_TYPE_TO_NAME.standard,
          type: 'standard',
          cardInfo: cardsInfo?.standard,
        });

      case CardSlides.Silver:
        return renderMediaCard({
          ...defaultProps,
          title: MAP_CARD_TYPE_TO_NAME.silver,
          type: 'silver',
          cardInfo: cardsInfo?.silver,
        });

      case CardSlides.Gold:
        return renderMediaCard({
          ...defaultProps,
          title: MAP_CARD_TYPE_TO_NAME.gold,
          type: 'gold',
          cardInfo: cardsInfo?.gold,
        });

      case CardSlides.Platinum:
        return renderMediaCard({
          ...defaultProps,
          title: MAP_CARD_TYPE_TO_NAME.platinum,
          type: 'platinum',
          cardInfo: cardsInfo?.platinum,
        });

      case CardSlides.Black:
        return renderMediaCard({
          ...defaultProps,
          title: MAP_CARD_TYPE_TO_NAME.black,
          type: 'black',
          cardInfo: cardsInfo?.black,
        });
    }
  }

  return (
    <>
      {renderControls()}
      <Transition
        ref={transitionRef}
        name="semiFade"
        className={buildClassName(styles.transition, 'custom-scroll')}
        activeKey={currentSlide}
        nextKey={nextKey}
      >
        {renderContent}
      </Transition>
    </>
  );
}

export default memo(withGlobal<OwnProps>((global): StateProps => {
  return {
    tonBalance: selectCurrentToncoinBalance(global),
  };
})(CardRoster));

function renderMediaCard({
  lang,
  title,
  type,
  cardInfo,
  tonBalance,
  currentKey,
}: {
  lang: LangFn;
  title: string;
  type: ApiMtwCardType;
  cardInfo?: ApiCardInfo;
  tonBalance?: bigint;
  currentKey: number;
}) {
  return (
    (
      <div className={styles.content}>
        <div className={buildClassName(styles.slide, styles[type])}>
          <video
            autoPlay
            muted
            loop
            playsInline
            poster={`${MTW_CARDS_MINT_BASE_URL}mtw_card_${type}.avif`}
            className={styles.video}
          >
            <source
              src={`${MTW_CARDS_MINT_BASE_URL}mtw_card_${type}.h264.mp4`}
              type="video/mp4; codecs=avc1.4D401E,mp4a.40.2"
            />
          </video>
          <div className={styles.slideInner}>
            {renderDots(currentKey)}
            <div className={styles.cardType}>{title}</div>
            {renderAvailability(lang, cardInfo)}
          </div>
        </div>
        <CardPros type={type} price={cardInfo?.price} balance={tonBalance} isAvailable={Boolean(cardInfo?.notMinted)} />
      </div>
    )
  );
}

function renderDots(currentKey: number) {
  return (
    <div className={styles.dots}>
      {Array.from({ length: TOTAL_SLIDES }).map((_, index) => {
        return (
          <div key={index} className={buildClassName(styles.dot, index === currentKey && styles.dotActive)} />
        );
      })}
    </div>
  );
}

function renderAvailability(lang: LangFn, cardInfo?: ApiCardInfo) {
  const { all, notMinted } = cardInfo || {};
  if (!all || !notMinted) {
    return (
      <div className={styles.avaliability}>
        <div className={styles.soldOut}>{lang('This card has been sold out')}</div>
      </div>
    );
  }

  const sold = all - notMinted;
  const leftAmount = lang('%amount% left', { amount: formatNumber(notMinted) });
  const soldAmount = lang('%amount% sold', { amount: formatNumber(sold) });

  return (
    <div className={styles.avaliability}>
      <div
        className={styles.progress}
        style={`--progress: ${round(notMinted / all, 2)};}`}
      >
        <div className={buildClassName(styles.amount, styles.amountInner, styles.amountLeft)}>{leftAmount}</div>
        <div className={buildClassName(styles.amount, styles.amountInner, styles.amountSold)}>{soldAmount}</div>
      </div>
      <div className={buildClassName(styles.amount, styles.amountLeft)}>{leftAmount}</div>
      <div className={buildClassName(styles.amount, styles.amountSold)}>{soldAmount}</div>
    </div>
  );
}
