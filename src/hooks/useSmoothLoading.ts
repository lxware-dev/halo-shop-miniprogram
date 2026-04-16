import { ref, watch, onBeforeUnmount } from 'vue';
import type { Ref } from 'vue';

interface UseSmoothLoadingOptions {
  delay?: number;
  minDuration?: number;
}

export function useSmoothLoading(loading: Ref<boolean>, options: UseSmoothLoadingOptions = {}) {
  const { delay = 120, minDuration = 180 } = options;
  const visible = ref(false);

  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shownAt = 0;

  function clearShowTimer() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  watch(
    loading,
    (nextLoading) => {
      if (nextLoading) {
        clearHideTimer();

        if (visible.value || showTimer) {
          return;
        }

        showTimer = setTimeout(() => {
          visible.value = true;
          shownAt = Date.now();
          showTimer = null;
        }, delay);
        return;
      }

      clearShowTimer();

      if (!visible.value) {
        return;
      }

      const elapsed = Date.now() - shownAt;
      const remaining = Math.max(minDuration - elapsed, 0);

      hideTimer = setTimeout(() => {
        visible.value = false;
        hideTimer = null;
      }, remaining);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    clearShowTimer();
    clearHideTimer();
  });

  return visible;
}
