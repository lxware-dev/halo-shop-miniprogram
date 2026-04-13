import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Dynamic runtime configuration fetched from the Halo admin
 */
export interface RemoteConfig {
  announcement?: string;
  maintenanceMode?: boolean;
  activityBannerEnabled?: boolean;
}

export const useAppStore = defineStore('app', () => {
  const remoteConfig = ref<RemoteConfig>({});
  const networkConnected = ref(true);

  function setRemoteConfig(config: RemoteConfig) {
    remoteConfig.value = config;
  }

  function setNetworkConnected(connected: boolean) {
    networkConnected.value = connected;
  }

  return {
    remoteConfig,
    networkConnected,
    setRemoteConfig,
    setNetworkConnected,
  };
});
