import { useUserStore } from '@/store';

const TAB_PAGE_PATHS = new Set([
  '/pages/home/index',
  '/pages/category/index',
  '/pages/cart/index',
  '/pages/user/index',
]);

const USER_PAGE_PATH = '/pages/user/index';
const CART_PAGE_PATH = '/pages/cart/index';
const LOGIN_PAGE_PATH = '/subpkg-auth/login/index';
const DEFAULT_AFTER_LOGIN_PATH = USER_PAGE_PATH;
const AUTH_REQUIRED_PAGE_PATHS = new Set([
  '/subpkg-trade/confirm/index',
  '/subpkg-trade/payment/index',
  '/subpkg-trade/payment-result/index',
  '/subpkg-trade/order-list/index',
  '/subpkg-trade/order-detail/index',
  '/subpkg-trade/logistics/index',
  '/subpkg-mine/notification/index',
  '/subpkg-mine/address-list/index',
  '/subpkg-mine/address-edit/index',
  '/subpkg-mine/settings/index',
  '/subpkg-mine/profile-name/index',
  '/subpkg-mine/after-sale/index',
]);

function normalizePath(path: string) {
  if (!path) {
    return '';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function buildQueryString(query: Record<string, unknown>) {
  return Object.entries(query)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export function buildPageUrl(path: string, query?: Record<string, unknown>) {
  const normalizedPath = normalizePath(path);
  const queryString = buildQueryString(query ?? {});
  return queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
}

export function getPagePath(url: string) {
  return normalizePath(url).split('?')[0];
}

export function isAuthRequiredPage(url: string) {
  return AUTH_REQUIRED_PAGE_PATHS.has(getPagePath(url));
}

export function getCurrentPageUrl() {
  const currentPage = getCurrentPages().at(-1) as
    | {
        route?: string;
        options?: Record<string, unknown>;
      }
    | undefined;

  return buildPageUrl(currentPage?.route ?? DEFAULT_AFTER_LOGIN_PATH, currentPage?.options ?? {});
}

export function isTabPage(path: string) {
  return TAB_PAGE_PATHS.has(path.split('?')[0]);
}

export function openLoginEntry(options?: { redirectUrl?: string; forceMethods?: boolean }) {
  const currentUrl = getCurrentPageUrl();
  const currentPath = currentUrl.split('?')[0];

  if (currentPath === LOGIN_PAGE_PATH) {
    return;
  }

  if (currentPath === USER_PAGE_PATH) {
    uni.$emit('show-login-drawer', { forceMethods: !!options?.forceMethods });
    return;
  }

  if (currentPath === CART_PAGE_PATH) {
    return;
  }

  const redirectUrl = options?.redirectUrl ?? currentUrl;
  const query = buildQueryString({
    redirect: redirectUrl,
    forceMethods: options?.forceMethods ? '1' : '',
  });

  uni.navigateTo({
    url: query ? `${LOGIN_PAGE_PATH}?${query}` : LOGIN_PAGE_PATH,
  });
}

export function guardCurrentPageAccess(options?: { forceMethods?: boolean }) {
  const currentUrl = getCurrentPageUrl();
  if (!isAuthRequiredPage(currentUrl)) {
    return true;
  }

  const userStore = useUserStore();
  if (userStore.isLoggedIn) {
    return true;
  }

  openLoginEntry({
    redirectUrl: currentUrl,
    forceMethods: options?.forceMethods,
  });
  return false;
}

export function navigateToPage(
  url: string,
  options?: { replace?: boolean; forceMethods?: boolean },
) {
  const normalizedUrl = normalizePath(url);
  if (!normalizedUrl) {
    return false;
  }

  const userStore = useUserStore();
  if (isAuthRequiredPage(normalizedUrl) && !userStore.isLoggedIn) {
    openLoginEntry({
      redirectUrl: normalizedUrl,
      forceMethods: options?.forceMethods,
    });
    return false;
  }

  const pagePath = getPagePath(normalizedUrl);
  if (isTabPage(pagePath)) {
    uni.switchTab({ url: pagePath });
    return true;
  }

  if (options?.replace) {
    uni.redirectTo({ url: normalizedUrl });
    return true;
  }

  uni.navigateTo({ url: normalizedUrl });
  return true;
}

export function redirectAfterLogin(redirectUrl?: string) {
  const targetUrl = redirectUrl || DEFAULT_AFTER_LOGIN_PATH;
  const targetPath = targetUrl.split('?')[0];

  if (isTabPage(targetPath)) {
    uni.switchTab({ url: targetPath });
    return;
  }

  uni.redirectTo({ url: targetUrl });
}
