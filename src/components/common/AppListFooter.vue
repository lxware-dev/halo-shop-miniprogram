<script setup lang="ts">
withDefaults(
  defineProps<{
    loading?: boolean;
    hasMore?: boolean;
    total?: number;
    noMoreText?: string;
  }>(),
  {
    loading: false,
    hasMore: true,
    total: 0,
    noMoreText: '— 没有更多了 —',
  },
);
</script>

<template>
  <view class="flex items-center justify-center py-5">
    <text v-if="loading" class="text-slate-400 text-xs">加载中...</text>
    <text v-else-if="!hasMore && total > 0" class="text-slate-300 text-xs">
      {{ noMoreText }}
    </text>
  </view>
</template>
