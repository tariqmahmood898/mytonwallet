import { getActions } from '../../../global';

import { openDeeplinkOrUrl } from '../../deeplink';
import { buildTonConnectBridgeApi } from './tonConnectBridgeApi';

export type BridgeApi = ReturnType<typeof buildBridgeApi>;

export function buildBridgeApi(pageUrl: string) {
  const { closeBrowser } = getActions();

  const tonConnectApi = buildTonConnectBridgeApi(pageUrl);
  const prefixedTonConnectApi = tonConnectApi ? prefixApi(tonConnectApi, 'tonConnect:') : undefined;

  return {
    'window:open'({ url }: { url: string }) {
      void openDeeplinkOrUrl(url, { isExternal: true, isFromInAppBrowser: true });
    },

    'window:close'() {
      closeBrowser();
    },

    ...prefixedTonConnectApi,
  };
}

function prefixApi<Api extends { [K in keyof Api]: AnyFunction }, Prefix extends string>(
  api: Api, prefix: Prefix,
): { [K in keyof Api as `${Prefix}${string & K}`]: Api[K] } {
  const newEntries = Object.entries(api).map(([k, v]) => [`${prefix}${k}`, v]);

  return Object.fromEntries(newEntries);
}
