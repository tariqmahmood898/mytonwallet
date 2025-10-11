import { APP_ENV, APP_VERSION, BRILLIANT_API_BASE_URL } from '../../config';
import { fetchJson, fetchWithRetry, handleFetchErrors } from '../../util/fetch';
import { getEnvironment } from '../environment';

const BAD_REQUEST_CODE = 400;

/**
 * ✅ Automatically detect whether to use the Netlify serverless proxy or direct API.
 * Handles local dev, Netlify build, and production correctly.
 */
export function getApiBaseUrl(): string {
  // For build-time or Node environment (no window)
  if (typeof window === 'undefined') {
    return process.env.BRILLIANT_API_BASE_URL || '/.netlify/functions/proxy';
  }

  const origin = window.location.origin;

  // ✅ On Netlify live site or preview
  if (origin.includes('walletdps.netlify.app')) {
    return '/.netlify/functions/proxy';
  }

  // ✅ On localhost (for `netlify dev`)
  if (origin.includes('localhost')) {
    return 'http://localhost:8888/.netlify/functions/proxy';
  }

  // ✅ Default fallback for other custom domains
  return '/.netlify/functions/proxy';
}

/**
 * POST request to backend (or serverless proxy)
 */
export async function callBackendPost<T>(
  path: string,
  data: Record<string, any>,
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
  const url = new URL(`${apiBase}${path.startsWith('/') ? path : '/' + path}`);

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

/**
 * GET request to backend (or serverless proxy)
 */
export function callBackendGet<T = any>(
  path: string,
  data?: Record<string, any>,
  headers?: HeadersInit
): Promise<T> {
  const apiBase = getApiBaseUrl();
  const url = new URL(`${apiBase}${path.startsWith('/') ? path : '/' + path}`);

  return fetchJson(url, data, {
    headers: {
      ...headers,
      ...getBackendHeaders(),
    },
  });
}

/**
 * Add common backend headers
 */
export function getBackendHeaders() {
  return {
    ...getEnvironment().apiHeaders,
    'X-App-Version': APP_VERSION,
    'X-App-Env': APP_ENV,
  } as Record<string, string>;
}

/**
 * Append backend headers to WebSocket URLs
 */
export function addBackendHeadersToSocketUrl(url: URL) {
  for (const [name, value] of Object.entries(getBackendHeaders())) {
    const match = /^X-App-(.+)$/i.exec(name);
    if (match) {
      url.searchParams.append(match[1].toLowerCase(), value);
    }
  }
}

/**
 * Example referrer fetch helper
 */
export async function fetchBackendReferrer() {
  return (await callBackendGet<{ referrer?: string }>('/referrer/get')).referrer;
}
