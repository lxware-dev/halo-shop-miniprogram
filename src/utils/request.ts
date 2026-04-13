import { createAlova } from 'alova';
import AdapterUniapp, { uniappMockResponse } from '@alova/adapter-uniapp';
import { createAlovaMockAdapter } from '@alova/mock';
import { useAppConfig } from '@/config';
import { useUserStore } from '@/store';
import { isTimeExpired } from '@/utils/date';
import { showErrorToast } from '@/utils/error';
import { ensureSessionInitialized, refreshSession } from '@/services/session';
import type { HaloProblemDetail } from '@/types/api';
import mockGroups from '@/mock/index';

const BEARER_AUTHENTICATE_PATTERN = /bearer/i;
const INVALID_TOKEN_PATTERN = /error="?invalid_token"?/i;
const INSUFFICIENT_SCOPE_PATTERN = /error="?insufficient_scope"?/i;
const SERVER_ERROR_MESSAGE = '服务器内部错误，请稍后重试';
const REQUEST_ERROR_MESSAGE = '请求失败，请稍后重试';
const NETWORK_ERROR_MESSAGE = '网络连接失败，请检查网络后重试';

interface ResponseLike {
  statusCode?: number;
  data?: unknown;
  header?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

interface RequestMethodLike {
  config: {
    headers?: Record<string, string>;
  };
  meta?: {
    skipAuthInit?: boolean;
  };
  __retriedAfterAuthRefresh?: boolean;
  send: () => Promise<unknown>;
}

function getResponseHeader(
  response: { header?: Record<string, unknown>; headers?: Record<string, unknown> },
  name: string,
) {
  const headers = response.header ?? response.headers;
  if (!headers) {
    return '';
  }

  const targetName = name.toLowerCase();
  const matchedKey = Object.keys(headers).find((key) => key.toLowerCase() === targetName);
  const headerValue = matchedKey ? headers[matchedKey] : '';
  return typeof headerValue === 'string' ? headerValue : '';
}

function isInsufficientScopeResponse(response: {
  statusCode?: number;
  header?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}) {
  if (response.statusCode !== 403) {
    return false;
  }

  const authenticateHeader = getResponseHeader(response, 'WWW-Authenticate');
  if (!authenticateHeader) {
    return false;
  }

  return (
    BEARER_AUTHENTICATE_PATTERN.test(authenticateHeader) &&
    INSUFFICIENT_SCOPE_PATTERN.test(authenticateHeader)
  );
}

function isInvalidTokenResponse(response: {
  statusCode?: number;
  header?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}) {
  if (response.statusCode !== 401) {
    return false;
  }

  const authenticateHeader = getResponseHeader(response, 'WWW-Authenticate');
  if (!authenticateHeader) {
    return false;
  }

  return (
    BEARER_AUTHENTICATE_PATTERN.test(authenticateHeader) &&
    INVALID_TOKEN_PATTERN.test(authenticateHeader)
  );
}

function shouldSkipAuthInit(method: RequestMethodLike) {
  return !!method.meta?.skipAuthInit;
}

function updateAuthorizationHeader(method: RequestMethodLike, credential: string) {
  method.config.headers = {
    ...method.config.headers,
    Authorization: credential,
  };
}

async function ensureRequestCredential(method: RequestMethodLike) {
  if (shouldSkipAuthInit(method)) {
    return;
  }

  const userStore = useUserStore();
  const shouldInitSession =
    !userStore.credential || (!!userStore.expiresAt && isTimeExpired(userStore.expiresAt));

  if (!shouldInitSession) {
    return;
  }

  try {
    await ensureSessionInitialized();
  } catch {
    // If session initialization fails, keep the current state and let later request results handle it
  }
}

function rejectProblem(problem: HaloProblemDetail) {
  return Promise.reject(problem);
}

async function handleUnauthorizedResponse(
  response: ResponseLike,
  method: RequestMethodLike,
  problem: HaloProblemDetail,
) {
  const userStore = useUserStore();
  const isInvalidToken = isInvalidTokenResponse(response);

  if (!isInvalidToken) {
    return rejectProblem(problem);
  }

  if (shouldSkipAuthInit(method) || method.__retriedAfterAuthRefresh) {
    userStore.clearCredential();
    return rejectProblem(problem);
  }

  try {
    await refreshSession();
    method.__retriedAfterAuthRefresh = true;
    return method.send();
  } catch {
    userStore.clearCredential();
    return rejectProblem(problem);
  }
}

function handleForbiddenResponse(response: ResponseLike, problem: HaloProblemDetail) {
  if (isInsufficientScopeResponse(response)) {
    const userStore = useUserStore();
    userStore.clearLoginState();
  }

  return rejectProblem(problem);
}

function handleUnexpectedStatus(problem: HaloProblemDetail, statusCode: number) {
  if (statusCode === 404) {
    return;
  }

  if (statusCode >= 500) {
    showErrorToast(problem?.detail ?? SERVER_ERROR_MESSAGE);
  } else {
    showErrorToast(REQUEST_ERROR_MESSAGE);
  }

  return rejectProblem(problem);
}

async function resolveResponse(response: ResponseLike, method: RequestMethodLike) {
  const statusCode = response.statusCode ?? 0;
  if (statusCode >= 200 && statusCode < 300) {
    return response.data;
  }

  const problem = response.data as HaloProblemDetail;

  if (statusCode === 401) {
    return handleUnauthorizedResponse(response, method, problem);
  }

  if (statusCode === 403) {
    return handleForbiddenResponse(response, problem);
  }

  return handleUnexpectedStatus(problem, statusCode);
}

const appConfig = useAppConfig();
const { requestAdapter, statesHook } = AdapterUniapp();

const requestAdapterFinal =
  import.meta.env.VITE_MOCK_ENABLED === 'true'
    ? createAlovaMockAdapter(mockGroups, {
        enable: true,
        delay: import.meta.env.VITE_MOCK_DELAY ?? 400,
        mockRequestLogger: import.meta.env.DEV,
        httpAdapter: requestAdapter,
        onMockResponse: uniappMockResponse,
      })
    : requestAdapter;

export const alovaInst = createAlova({
  baseURL: appConfig.halo.baseURL,
  timeout: appConfig.halo.timeout,
  cacheFor: {
    GET: 0,
  },
  statesHook,
  requestAdapter: requestAdapterFinal,
  async beforeRequest(method) {
    await ensureRequestCredential(method);

    const userStore = useUserStore();
    if (!shouldSkipAuthInit(method) && userStore.credential) {
      updateAuthorizationHeader(method, userStore.credential);
    }
    method.config.headers = {
      ...method.config.headers,
      'X-Sales-Channel': 'MINI_PROGRAM',
    };
  },
  responded: {
    onSuccess: async (response, method) => {
      return resolveResponse(response, method);
    },
    onError: async (error: unknown) => {
      showErrorToast(NETWORK_ERROR_MESSAGE);
      return Promise.reject(error);
    },
  },
});
