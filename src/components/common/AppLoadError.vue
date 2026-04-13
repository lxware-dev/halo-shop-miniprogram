<script setup lang="ts">
withDefaults(
  defineProps<{
    text?: string;
    retryText?: string;
  }>(),
  {
    text: '加载失败，请稍后重试',
    retryText: '重新加载',
  },
);

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <view class="flex flex-col items-center py-10 gap-3">
    <text class="text-slate-400 text-sm">{{ text }}</text>
    <view
      class="flex items-center justify-center px-5 py-2 rounded-full border border-solid border-slate-300 active:opacity-70"
      @tap="emit('retry')"
    >
      <text class="text-slate-600 text-sm">{{ retryText }}</text>
    </view>
  </view>
</template>
