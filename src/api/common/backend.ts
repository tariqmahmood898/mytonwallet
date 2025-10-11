import { APP_ENV, APP_VERSION, BRILLIANT_API_BASE_URL } from '../../config';
import { fetchJson, fetchWithRetry, handleFetchErrors } from '../../util/fetch';
import { getEnvironment } from '../environment';

const BAD_REQUEST_CODE = 400;

// ✅ Automatically detect whether to use direct API or Netlify proxy
function getApiBaseUrl() {
  if (typeof window === 'undefined') return BRILLIANT_API_BASE_URL;

  const origin = window.location.origin;
  
  // Detect Netlify domain or your hosted app
  if (origin.includes('walletdps.netlify.app')) {
    // On Netlify: route through serverless proxy
    return '/.netlify/functions/proxy';
  }

  // On localhost or elsewhere: call direct API
  return BRILLIANT_API_BASE_URL;
}

export async function callBackendPost<T>(
  path: string,
  data: AnyLiteral,
  options?: {
    authToken?: string;
    isAllowBadRequest?: boolean;
    method?: string;
    shouldRetry?: boolean;
    retries?: number;
    timeouts?: number | number[];
  }
): Promise<T> {
  const {
    authToken, isAllowBadRequest, method, shouldRetry, retries, timeouts,
  } = options ?? {};

  const apiBase = getApiBaseUrl();
  const url = new URL(`${apiBase}${path}`);

  const init: RequestInit = {
    method: method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getBackendHeaders(),
      ...(authToken && { 'X-Auth-Token': authToken }),
    },
    body: JSON.stringify(data),
  };

  const response = shouldRetry
    ? await fetchWithRetry(url, init, {
        retries,
        timeouts,
        shouldSkipRetryFn: (message) => !message?.includes('signal is aborted'),
      })
    : await fetch(url.toString(), init);

  await handleFetchErrors(response, isAllowBadRequest ? [BAD_REQUEST_CODE] : undefined);

  return response.json();
}

export function callBackendGet<T = any>(
  path: string,
  data?: AnyLiteral,
  headers?: HeadersInit
): Promise<T> {
  const apiBase = getApiBaseUrl();
  const url = new URL(`${apiBase}${path}`);
  return fetchJson(url, data, {
    headers: {
      ...headers,
      ...getBackendHeaders(),
    },
  });
}

export function getBackendHeaders() {
  return {
    ...getEnvironment().apiHeaders,
    'X-App-Version': APP_VERSION,
    'X-App-Env': APP_ENV,
  } as Record<string, string>;
}

export function addBackendHeadersToSocketUrl(url: URL) {
  for (const [name, value] of Object.entries(getBackendHeaders())) {
    const match = /^X-App-(.+)$/i.exec(name);
    if (match) {
      url.searchParams.append(match[1].toLowerCase(), value);
    }
  }
}

export async function fetchBackendReferrer() {
  return (await callBackendGet<{ referrer?: string }>('/referrer/get')).referrer;
}
