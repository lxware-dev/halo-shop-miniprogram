<script setup lang="ts">
import { onLaunch, onShow, onHide, onError, onUnhandledRejection } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/store';
import { getLocale } from '@/locales';
import { showErrorToast, isHaloProblem } from '@/utils/error';

const { init } = useAuth();
const appStore = useAppStore();
const { t } = useI18n();

onLaunch(async () => {
  appStore.setLocale(getLocale());
  await init();

  uni.onNetworkStatusChange(({ isConnected }) => {
    appStore.setNetworkConnected(isConnected);
    if (!isConnected) {
      uni.showToast({ title: t('common.networkDisconnected'), icon: 'none' });
    }
  });
});

onShow(() => {});

onHide(() => {});

onError((error: string) => {
  console.error('[GlobalError]', error);
  showErrorToast(t('common.pageError'));
});

// #ifdef MP-WEIXIN
onUnhandledRejection(({ reason }: { reason: unknown }) => {
  console.error('[UnhandledRejection]', reason);
  if (isHaloProblem(reason)) {
    showErrorToast(reason);
  }
});
// #endif
</script>

<style>
page {
  background-color: #f5f5f5;
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif;
}
</style>
