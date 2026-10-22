<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed } from 'vue';
const props = defineProps<{ history?: boolean; offers?: boolean; status?: string }>();
const emit = defineEmits<{ claim: []; history: [] }>();
const { t } = useI18n();
const title = computed(() => {
  if (props.history) {
    return props.status === 'USED'
      ? 'coupon.emptyUsed'
      : props.status === 'EXPIRED'
        ? 'coupon.emptyExpired'
        : 'coupon.emptyHistory';
  }
  return props.offers ? 'coupon.noOffers' : 'coupon.emptyAvailable';
});
</script>
<template>
  <view class="flex flex-col items-center px-8 pt-18 pb-10 text-center">
    <image src="/static/coupons/empty.png" class="w-40 h-36" mode="aspectFit" />
    <text class="mt-4 text-base text-slate-950 font-semibold">{{ t(title) }}</text>
    <text v-if="!offers" class="mt-2 text-xs text-slate-500 leading-relaxed whitespace-pre-line">{{
      t(props.history ? 'coupon.emptyHistoryHint' : 'coupon.emptyHint')
    }}</text>
    <template v-if="!history && !offers">
      <view class="mt-5 rounded-2 bg-brand px-6 py-3 active:opacity-75" @tap="emit('claim')"
        ><text class="text-sm font-medium text-white">{{ t('coupon.goClaim') }}</text></view
      >
      <view class="mt-2 py-3" @tap="emit('history')"
        ><text class="text-xs text-slate-500">{{ t('coupon.viewHistory') }} ›</text></view
      >
    </template>
  </view>
</template>
