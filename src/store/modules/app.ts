import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppLocale } from '@/locales';
import { resolveInitialLocale, setLocale as applyLocale } from '@/locales';

/**
 * Dynamic runtime configuration fetched from the Halo admin
 */
export interface RemoteConfig {
  announcement?: string;
  maintenanceMode?: boolean;
  activityBannerEnabled?: boolean;
}

export const useAppStore = defineStore(
  'app',
  () => {
    const remoteConfig = ref<RemoteConfig>({});
    const networkConnected = ref(true);
    const locale = ref<AppLocale>(resolveInitialLocale());

    function setRemoteConfig(config: RemoteConfig) {
      remoteConfig.value = config;
    }

    function setNetworkConnected(connected: boolean) {
      networkConnected.value = connected;
    }

    function setLocale(value: AppLocale) {
      locale.value = applyLocale(value);
    }

    return {
      remoteConfig,
      networkConnected,
      locale,
      setRemoteConfig,
      setNetworkConnected,
      setLocale,
    };
  },
  {
    persist: {
      key: 'halo-mall-app',
      storage: {
        getItem: (key: string) => uni.getStorageSync(key),
        setItem: (key: string, value: string) => uni.setStorageSync(key, value),
      },
      pick: ['locale'],
    },
  },
);
