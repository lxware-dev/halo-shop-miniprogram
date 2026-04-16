<script setup lang="ts">
withDefaults(
  defineProps<{
    loading?: boolean;
    variant?: 'spinner' | 'list' | 'card' | 'product';
    rows?: number;
  }>(),
  {
    loading: true,
    variant: 'list',
    rows: 3,
  },
);
</script>

<template>
  <template v-if="loading">
    <view v-if="variant === 'spinner'" class="flex items-center justify-center gap-1.5 py-6">
      <view
        v-for="i in 3"
        :key="i"
        class="w-2 h-2 rounded-full bg-slate-300"
        :style="`animation: skeleton-pulse 1.2s ease-in-out ${(i - 1) * 0.2}s infinite`"
      />
    </view>

    <view v-else-if="variant === 'list'" class="flex flex-col">
      <view
        v-for="i in rows"
        :key="i"
        class="flex items-start gap-3.5 px-4 py-4"
        :class="i > 1 ? 'border-t border-slate-50' : ''"
      >
        <view class="w-20 h-20 rounded-1.5 skeleton-shimmer shrink-0" />
        <view class="flex-1 flex flex-col gap-2.5 pt-1">
          <view class="h-3.5 rounded-full skeleton-shimmer w-4/5" />
          <view class="h-3 rounded-full skeleton-shimmer w-3/5" />
          <view class="h-3 rounded-full skeleton-shimmer w-2/5 mt-1" />
        </view>
      </view>
    </view>

    <view v-else-if="variant === 'card'" class="px-4 py-4 flex flex-col gap-4">
      <view class="w-full aspect-square rounded-2 skeleton-shimmer" />
      <view class="flex flex-col gap-2.5">
        <view class="h-4 rounded-full skeleton-shimmer w-full" />
        <view class="h-4 rounded-full skeleton-shimmer w-4/5" />
        <view class="h-3.5 rounded-full skeleton-shimmer w-1/3 mt-1" />
      </view>
    </view>

    <view v-else-if="variant === 'product'" class="grid grid-cols-2 gap-3 px-3 py-3">
      <view v-for="i in rows * 2" :key="i" class="rounded-2 overflow-hidden bg-white">
        <view class="w-full aspect-square skeleton-shimmer" />
        <view class="p-2.5 flex flex-col gap-2">
          <view class="h-3 rounded-full skeleton-shimmer w-full" />
          <view class="h-3 rounded-full skeleton-shimmer w-2/3" />
          <view class="h-4 rounded-full skeleton-shimmer w-1/2 mt-0.5" />
        </view>
      </view>
    </view>
  </template>

  <slot v-else />
</template>

<style scoped>
.skeleton-shimmer {
  background: linear-gradient(90deg, #f1f5f9 25%, #e8edf3 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.6s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
