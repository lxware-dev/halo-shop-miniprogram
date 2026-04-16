<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  text?: string;
  retryText?: string;
}>();
const emit = defineEmits<{
  retry: [];
}>();
const { t } = useI18n();
const resolvedText = computed(() => props.text ?? t('common.loadFailed'));
const resolvedRetryText = computed(() => props.retryText ?? t('common.retry'));
</script>

<template>
  <view class="flex flex-col items-center py-10 gap-3">
    <text class="text-slate-400 text-sm">{{ resolvedText }}</text>
    <view
      class="flex items-center justify-center px-5 py-2 rounded-full border border-solid border-slate-300 active:opacity-70"
      @tap="emit('retry')"
    >
      <text class="text-slate-600 text-sm">{{ resolvedRetryText }}</text>
    </view>
  </view>
</template>
