import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@halo-dev/api-client';

const ANONYMOUS_USER_NAME = 'anonymousUser';

export function isAnonymousUser(user: User | null | undefined) {
  return user?.metadata?.name === ANONYMOUS_USER_NAME;
}

export const useUserStore = defineStore(
  'user',
  () => {
    const credential = ref<string>('');
    const profile = ref<User | null>(null);
    const expiresAt = ref<string | null>(null);
    const hasLogin = ref(false);

    const hasCredential = computed(() => !!credential.value);
    const isAnonymous = computed(() => isAnonymousUser(profile.value));
    const isLoggedIn = computed(() => hasLogin.value && !!profile.value && !isAnonymous.value);

    function setCredential(value: string) {
      credential.value = value;
    }

    function clearCredential() {
      credential.value = '';
      profile.value = null;
      hasLogin.value = false;
      expiresAt.value = null;
    }

    function clearLoginState() {
      profile.value = null;
      hasLogin.value = false;
    }

    function setProfile(value: User | null) {
      profile.value = value;
    }

    function setHasLogin(value: boolean) {
      hasLogin.value = value;
    }

    function setExpiresAt(value: string | null) {
      expiresAt.value = value;
    }

    return {
      credential,
      profile,
      hasCredential,
      hasLogin,
      isAnonymous,
      isLoggedIn,
      expiresAt,
      setCredential,
      clearCredential,
      clearLoginState,
      setProfile,
      setHasLogin,
      setExpiresAt,
    };
  },
  {
    persist: {
      key: 'halo-mall-user',
      storage: {
        getItem: (key: string) => uni.getStorageSync(key),
        setItem: (key: string, value: string) => uni.setStorageSync(key, value),
      },
      pick: ['credential', 'profile', 'expiresAt', 'hasLogin'],
    },
  },
);
