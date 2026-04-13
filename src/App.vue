<script setup lang="ts">
import { onLaunch, onShow, onHide, onError, onUnhandledRejection } from '@dcloudio/uni-app';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/store';
import { showErrorToast, isHaloProblem } from '@/utils/error';

const { init } = useAuth();
const appStore = useAppStore();

onLaunch(async () => {
  await init();

  uni.onNetworkStatusChange(({ isConnected }) => {
    appStore.setNetworkConnected(isConnected);
    if (!isConnected) {
      uni.showToast({ title: '网络已断开，请检查网络连接', icon: 'none' });
    }
  });
});

onShow(() => {});

onHide(() => {});

onError((error: string) => {
  console.error('[GlobalError]', error);
  showErrorToast('页面发生异常，请重试');
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
