import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { useSmoothLoading } from '@/hooks/useSmoothLoading';

interface UseInitialLoadingOptions {
  delay?: number;
  minDuration?: number;
}

export function useInitialLoading(loading: Ref<boolean>, options: UseInitialLoadingOptions = {}) {
  const hasLoadedOnce = ref(false);
  const smoothLoading = useSmoothLoading(loading, options);

  const isInitialLoading = computed(() => loading.value && !hasLoadedOnce.value);
  const showInitialLoading = computed(() => smoothLoading.value && !hasLoadedOnce.value);

  function markLoaded() {
    hasLoadedOnce.value = true;
  }

  function reset() {
    hasLoadedOnce.value = false;
  }

  return {
    hasLoadedOnce,
    isInitialLoading,
    showInitialLoading,
    markLoaded,
    reset,
  };
}
