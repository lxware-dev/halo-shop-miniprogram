<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
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
  },
);
const { t } = useI18n();
const resolvedNoMoreText = computed(() => props.noMoreText ?? t('home.noMore'));
</script>

<template>
  <view class="flex items-center justify-center py-5">
    <text v-if="props.loading" class="text-slate-400 text-xs">{{ $t('common.loading') }}</text>
    <text v-else-if="!props.hasMore && props.total > 0" class="text-slate-300 text-xs">
      {{ resolvedNoMoreText }}
    </text>
  </view>
</template>
