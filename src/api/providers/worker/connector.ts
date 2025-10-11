import type { Connector } from '../../../util/PostMessageConnector';
import type { ApiInitArgs, OnApiUpdate } from '../../types';
import type { AllMethodArgs, AllMethodResponse, AllMethods } from '../../types/methods';

import { logDebugApi, logDebugError } from '../../../util/logs';
import { createConnector, createExtensionConnector } from '../../../util/PostMessageConnector';
import { pause } from '../../../util/schedulers';
import { IS_IOS } from '../../../util/windowEnvironment';
import { createWindowProvider, createWindowProviderForExtension } from '../../../util/windowProvider';
import { POPUP_PORT } from '../extension/config';

const HEALTH_CHECK_TIMEOUT = 150;
const HEALTH_CHECK_MIN_DELAY = 5000; // 5 sec

let updateCallback: OnApiUpdate;
let worker: Worker | undefined;
let connector: Connector | undefined;
let isInitialized = false;

export function initApi(onUpdate: OnApiUpdate, initArgs: ApiInitArgs | (() => ApiInitArgs)) {
  updateCallback = onUpdate;

  if (!connector) {
    // We use process.env.IS_EXTENSION instead of IS_EXTENSION in order to remove the irrelevant code during bundling
    if (process.env.IS_EXTENSION) {
      const getInitArgs = typeof initArgs === 'function' ? initArgs : () => initArgs;
      connector = createExtensionConnector(POPUP_PORT, onUpdate, getInitArgs as () => ApiInitArgs);

      createWindowProviderForExtension();
    } else {
      worker = new Worker(
        /* webpackChunkName: "worker" */ new URL('./provider.ts', import.meta.url),
      );
      connector = createConnector(worker, onUpdate);

      createWindowProvider(worker);
    }
  }

  if (!isInitialized) {
    if (!process.env.IS_EXTENSION && IS_IOS) {
      setupIosHealthCheck();
    }
    isInitialized = true;
  }

  const args = typeof initArgs === 'function' ? initArgs() : initArgs;
  return connector.init(args);
}

export async function callApi<T extends keyof AllMethods>(fnName: T, ...args: AllMethodArgs<T>) {
  if (!connector) {
    logDebugError('API is not initialized when calling', fnName);
    return undefined;
  }

  try {
    const result = await (connector.request({
      name: fnName,
      args,
    }) as Promise<AllMethodResponse<T>>);

    logDebugApi(`callApi: ${fnName}`, args, result);

    return result;
  } catch (err) {
    return undefined;
  }
}

export function callApiWithThrow<T extends keyof AllMethods>(fnName: T, ...args: AllMethodArgs<T>) {
  return (connector!.request({
    name: fnName,
    args,
  }) as AllMethodResponse<T>);
}

const startedAt = Date.now();

// Workaround for iOS sometimes stops interacting with worker
function setupIosHealthCheck() {
  window.addEventListener('focus', () => {
    void ensureWorkerPing();
    // Sometimes a single check is not enough
    setTimeout(() => ensureWorkerPing(), 1000);
  });
}

async function ensureWorkerPing() {
  let isResolved = false;

  try {
    await Promise.race([
      callApiWithThrow('ping'),
      pause(HEALTH_CHECK_TIMEOUT)
        .then(() => (isResolved ? undefined : Promise.reject(new Error('HEALTH_CHECK_TIMEOUT')))),
    ]);
  } catch (err) {
    logDebugError('ensureWorkerPing', err);

    if (Date.now() - startedAt >= HEALTH_CHECK_MIN_DELAY) {
      worker?.terminate();
      worker = undefined;
      connector = undefined;
      updateCallback({ type: 'requestReconnectApi' });
    }
  } finally {
    isResolved = true;
  }
}
