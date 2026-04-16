import { useUserStore } from '@/store';
import { isAnonymousUser } from '@/store/modules/user';
import { userApi } from '@/api';
import { openLoginEntry } from '@/helpers/auth';
import {
  applyBasicAuthCredentialIfConfigured,
  applyLoginSession,
  ensureSessionInitialized,
  refreshSession as refreshSessionCredential,
} from '@/services/session';
import type { LoginResult } from '@/types/auth';

export function useAuth() {
  const userStore = useUserStore();

  async function syncProfile(options?: { skipAuthInit?: boolean }) {
    const profile = await userApi
      .getProfile({
        skipAuthInit: options?.skipAuthInit ?? false,
      })
      .send();

    userStore.setProfile(profile.user);
    return profile.user;
  }

  /**
   * Initialize the token when the app starts.
   * - If basicAuth debug mode is configured, write the credential directly
   * - If the local token has not expired, reuse it directly
   * - Otherwise call uni.login to exchange for a new token
   *
   * Note: init does not infer login state or update hasLogin automatically.
   */
  async function init() {
    if (applyBasicAuthCredentialIfConfigured()) {
      return;
    }

    try {
      await ensureSessionInitialized();
    } catch {
      userStore.clearCredential();
    }
  }

  /**
   * Silently refresh the token after it expires.
   * Only the token itself is updated here; the user's explicit login state is not inferred or modified.
   */
  async function refreshSession() {
    await refreshSessionCredential();
  }

  /**
   * Unified handling after the user actively logs in: persist the token, mark the login state, and refresh user info
   */
  async function onLoginSuccess(result: LoginResult) {
    applyLoginSession(result);
    try {
      const user = await syncProfile();
      const hasLogin = !isAnonymousUser(user);
      userStore.setHasLogin(hasLogin);
      if (!hasLogin) {
        throw new Error('Current user is still anonymous after login');
      }
    } catch (error) {
      userStore.setProfile(null);
      userStore.setHasLogin(false);
      throw error;
    }
  }

  /**
   * Pages that require login can call this method as a route guard
   * If not logged in, redirect to the login page; if already on the Mine page, open the login drawer
   */
  function requireAuth(options?: { redirectUrl?: string; forceMethods?: boolean }): boolean {
    if (!userStore.isLoggedIn) {
      openLoginEntry({
        redirectUrl: options?.redirectUrl,
        forceMethods: options?.forceMethods,
      });
      return false;
    }
    return true;
  }

  /**
   * On Mini Program, logout only clears display state and user info, and keeps the current token.
   */
  async function logout() {
    userStore.clearLoginState();
    uni.reLaunch({ url: '/pages/user/index' });
  }

  return {
    hasCredential: userStore.hasCredential,
    isLoggedIn: userStore.isLoggedIn,
    init,
    syncProfile,
    refreshSession,
    onLoginSuccess,
    requireAuth,
    logout,
  };
}
