<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';
import { getCouponValue } from '@/helpers/coupon';
import { getCurrencySymbol } from '@/utils/format';
const props = defineProps<{
  coupon: CouponResponse | CustomerCouponResponse;
  large?: boolean;
  muted?: boolean;
}>();
const { t, locale } = useI18n();
const value = computed(() => getCouponValue(props.coupon, locale.value));
const percentage = computed(() => props.coupon.calculationType === 'PERCENTAGE');
const yuan = computed(
  () => locale.value.startsWith('zh') && ['¥', '￥'].includes(getCurrencySymbol()),
);
const prefix = computed(() =>
  !percentage.value && (props.large || !yuan.value) ? getCurrencySymbol() : '',
);
const unit = computed(() =>
  percentage.value
    ? locale.value.startsWith('zh')
      ? t('coupon.fold')
      : t('coupon.percentUnit')
    : !props.large && yuan.value
      ? t('coupon.yuan')
      : '',
);
</script>
<template>
  <view
    class="flex items-baseline justify-center gap-0.5"
    :class="muted ? 'text-slate-500' : 'text-brand'"
  >
    <text v-if="prefix" class="text-xs font-medium">{{ prefix }}</text>
    <text class="font-bold leading-none" :class="large ? 'text-[80rpx]' : 'text-[56rpx]'">{{
      value
    }}</text>
    <text class="text-xs font-medium">{{ unit }}</text>
  </view>
</template>
