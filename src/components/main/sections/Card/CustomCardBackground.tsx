import React, { memo } from '../../../../lib/teact/teact';

import type { ApiNft } from '../../../../api/types';

import buildClassName from '../../../../util/buildClassName';
import { getCardNftImageUrl } from '../../../../util/url';

import { useCachedImage } from '../../../../hooks/useCachedImage';
import useCardCustomization from '../../../../hooks/useCardCustomization';
import useFlag from '../../../../hooks/useFlag';
import useMediaTransition from '../../../../hooks/useMediaTransition';

import styles from './CustomCardBackground.module.scss';

interface OwnProps {
  isSticky?: boolean;
  nft: ApiNft;
  noShowAnimation?: boolean;
  shouldHide?: boolean;
  onLoad?: (hasGradient: boolean, className?: string) => void;
  onTransitionEnd: NoneToVoidFunction;
}

function CustomCardBackground({
  isSticky,
  nft,
  noShowAnimation,
  shouldHide,
  onLoad,
  onTransitionEnd,
}: OwnProps) {
  const { imageUrl } = useCachedImage(nft ? getCardNftImageUrl(nft) : undefined);
  const [isLoaded, markLoaded] = useFlag();
  const ref = useMediaTransition(noShowAnimation || (isLoaded && !shouldHide));

  const {
    borderShineType,
    withTextGradient,
    classNames: cardClassName,
  } = useCardCustomization(nft);

  function handleLoad() {
    markLoaded();

    onLoad?.(withTextGradient, cardClassName);
  }

  const rootClassName = buildClassName(
    styles.root,
    isSticky && styles.sticky,
    cardClassName,
    borderShineType && styles[`borderShine_${borderShineType}`],
    isLoaded && !shouldHide && styles.loaded,
    shouldHide && styles.hide,
  );

  const withShadow = nft.metadata?.mtwCardType === 'standard';

  return (
    <div ref={ref} className={rootClassName} onTransitionEnd={onTransitionEnd}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={nft.name}
          className={styles.image}
          onLoad={handleLoad}
        />
      )}
      {withShadow && <div className={styles.shadow} />}
    </div>
  );
}

export default memo(CustomCardBackground);
