import { useAppConfig } from '@/config';
import { getPlatform } from '@/helpers/platform';
import { useUserStore } from '@/store';
import type { LoginResult } from '@/types/auth';
import { isTimeExpired } from '@/utils/date';
import { buildQuery } from '@/utils/encode';

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const TRAILING_SLASH_PATTERN = /\/$/;
const platform = getPlatform();

let authInitPromise: Promise<void> | null = null;

function hasValidLocalToken() {
  const userStore = useUserStore();
  if (!userStore.credential) {
    return false;
  }

  return !userStore.expiresAt || !isTimeExpired(userStore.expiresAt);
}

function buildRequestUrl(path: string) {
  const { baseURL } = useAppConfig().halo;
  return `${baseURL.replace(TRAILING_SLASH_PATTERN, '')}${path}`;
}

function requestMiniProgramToken(loginCode: string) {
  const { timeout } = useAppConfig().halo;

  return new Promise<LoginResult>((resolve, reject) => {
    uni.request({
      url: buildRequestUrl(`/login/mp/${platform}`),
      method: 'POST',
      timeout,
      data: buildQuery({ code: loginCode }),
      header: {
        'Content-Type': FORM_CONTENT_TYPE,
        'X-Sales-Channel': 'MINI_PROGRAM',
      },
      success: (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve(response.data as LoginResult);
          return;
        }

        reject(response.data ?? new Error('Token exchange failed'));
      },
      fail: reject,
    });
  });
}

export function applyLoginSession(result: LoginResult) {
  const userStore = useUserStore();
  if (!result.tokenValue) {
    throw new Error('Token exchange failed: missing tokenValue');
  }

  userStore.setCredential(`Bearer ${result.tokenValue}`);
  userStore.setExpiresAt(result.expiresAt ?? null);
}

export async function ensureSessionInitialized(forceRefresh = false) {
  if (!forceRefresh && hasValidLocalToken()) {
    return;
  }

  if (!forceRefresh && authInitPromise) {
    await authInitPromise;
    return;
  }

  const initTask = (async () => {
    const { code } = await uni.login({});
    const result = await requestMiniProgramToken(code);
    applyLoginSession(result);
  })();

  authInitPromise = initTask;

  try {
    await initTask;
  } finally {
    if (authInitPromise === initTask) {
      authInitPromise = null;
    }
  }
}

export async function refreshSession() {
  await ensureSessionInitialized(true);
}
