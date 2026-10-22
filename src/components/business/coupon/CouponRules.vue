<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';
import { formatCurrency } from '@/utils/format';
import { getCouponScopeMessage } from '@/helpers/coupon';
const props = defineProps<{ coupon: CouponResponse | CustomerCouponResponse }>();
const { t } = useI18n();
const rules = computed(() => [
  {
    title: t('coupon.minimumRule'),
    text:
      (props.coupon.minOrderAmount ?? 0) > 0
        ? t('coupon.minimum', { amount: formatCurrency(props.coupon.minOrderAmount) })
        : t('coupon.noMinimum'),
  },
  {
    title: t('coupon.scopeRule'),
    text: t(getCouponScopeMessage(props.coupon)),
  },
  {
    title: t('coupon.combineRule'),
    text: `${t(props.coupon.combineWithCoupons ? 'coupon.combinable' : 'coupon.notCombinable')}；${t(props.coupon.combineWithOrderDiscount ? 'coupon.orderCombinable' : 'coupon.noOrderDiscount')}`,
  },
]);
</script>
<template>
  <view class="bg-white rounded-1.5 p-4">
    <text class="text-sm font-semibold text-slate-950">{{ t('coupon.usageRules') }}</text>
    <view v-for="rule in rules" :key="rule.title" class="mt-4 flex flex-col gap-1.5">
      <text class="text-xs font-medium text-slate-950">{{ rule.title }}</text>
      <text class="text-xs text-slate-500 leading-relaxed">{{ rule.text }}</text>
    </view>
    <view v-if="(coupon.maxDiscountAmount ?? 0) > 0" class="mt-4 text-xs text-slate-500">{{
      t('coupon.maximum', { amount: formatCurrency(coupon.maxDiscountAmount) })
    }}</view>
    <text
      v-if="coupon.description"
      class="block mt-4 text-xs text-slate-500 break-words leading-relaxed"
      >{{ coupon.description }}</text
    >
  </view>
</template>
