import { ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';

type RefreshHandler = () => Promise<unknown> | unknown;

export function usePagePullRefresh(handler: RefreshHandler) {
  const refreshing = ref(false);

  async function triggerRefresh() {
    if (refreshing.value) {
      return;
    }
    refreshing.value = true;
    try {
      await handler();
    } finally {
      refreshing.value = false;
      uni.stopPullDownRefresh();
    }
  }

  onPullDownRefresh(() => {
    void triggerRefresh();
  });

  return {
    refreshing,
    triggerRefresh,
  };
}

export function useScrollViewPullRefresh(handler: RefreshHandler) {
  const refreshing = ref(false);
  const refresherTriggered = ref(false);

  async function onRefresherRefresh() {
    if (refreshing.value) {
      return;
    }
    refreshing.value = true;
    refresherTriggered.value = true;
    try {
      await handler();
    } finally {
      refreshing.value = false;
      refresherTriggered.value = false;
    }
  }

  function resetRefresher() {
    refresherTriggered.value = false;
  }

  return {
    refreshing,
    refresherTriggered,
    onRefresherRefresh,
    resetRefresher,
  };
}
