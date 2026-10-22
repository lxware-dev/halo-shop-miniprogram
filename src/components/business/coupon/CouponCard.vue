<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';
import CouponValue from './CouponValue.vue';
import { getCouponScopeMessage, isCouponExpiring } from '@/helpers/coupon';
import { formatCurrency } from '@/utils/format';
const props = defineProps<{
  coupon: CouponResponse | CustomerCouponResponse;
  muted?: boolean;
  selected?: boolean;
  now?: number;
}>();
const emit = defineEmits<{ rules: [] }>();
const { t } = useI18n();
const owned = computed(() => 'couponName' in props.coupon);
const name = computed(() =>
  owned.value
    ? (props.coupon as CustomerCouponResponse).couponName
    : (props.coupon as CouponResponse).name,
);
const expiring = computed(
  () => owned.value && isCouponExpiring(props.coupon as CustomerCouponResponse, props.now),
);
const validity = computed(() => {
  const coupon = props.coupon;
  if (owned.value) {
    const wallet = coupon as CustomerCouponResponse;
    return wallet.expiresAt
      ? t('coupon.expires', { date: dayjs(wallet.expiresAt).format('YYYY.MM.DD') })
      : t('coupon.noExpiry');
  }
  const offer = coupon as CouponResponse;
  if (offer.validDays) {
    return t('coupon.validDays', { count: offer.validDays });
  }
  return offer.endsAt
    ? t('coupon.expires', { date: dayjs(offer.endsAt).format('YYYY.MM.DD') })
    : t('coupon.noExpiry');
});
</script>
<template>
  <view
    class="relative bg-white rounded-1.5 border border-solid overflow-hidden"
    :class="selected ? 'border-brand' : 'border-transparent'"
  >
    <view class="min-h-16 flex items-center gap-3 px-3 py-3">
      <view
        class="w-23 shrink-0 flex flex-col items-center gap-2 border-0 border-r border-solid border-slate-100 pr-3"
      >
        <CouponValue :coupon="coupon" :muted="muted" />
        <text
          class="text-[20rpx] text-center leading-snug"
          :class="muted ? 'text-slate-400' : 'text-brand'"
          >{{
            (coupon.minOrderAmount ?? 0) > 0
              ? t('coupon.minimum', { amount: formatCurrency(coupon.minOrderAmount) })
              : t('coupon.noMinimum')
          }}</text
        >
      </view>
      <view class="min-w-0 flex-1 flex flex-col gap-1">
        <text
          class="text-sm font-semibold break-words leading-snug"
          :class="muted ? 'text-slate-500' : 'text-slate-950'"
          >{{ name }}</text
        >
        <text class="text-[20rpx] text-slate-500 leading-relaxed"
          >{{ t(getCouponScopeMessage(coupon))
          }}<template v-if="(coupon.maxDiscountAmount ?? 0) > 0">
            ·
            {{
              t('coupon.maximum', { amount: formatCurrency(coupon.maxDiscountAmount) })
            }}</template
          ></text
        >
        <text class="text-[20rpx] leading-snug" :class="muted ? 'text-slate-400' : 'text-brand'">{{
          expiring
            ? t('coupon.expiringTag')
            : t(
                coupon.calculationType === 'PERCENTAGE'
                  ? 'coupon.percentType'
                  : 'coupon.amountType',
              )
        }}</text>
      </view>
      <view class="shrink-0" @tap.stop><slot name="action" /></view>
    </view>
    <view
      class="relative flex items-center justify-between gap-2 border-0 border-t border-solid border-slate-100 px-3 min-h-8"
    >
      <text class="min-w-0 flex-1 text-[20rpx] text-slate-400 leading-snug py-1.5">{{
        validity
      }}</text>
      <view class="shrink-0 px-1 py-2 active:opacity-60" @tap.stop="emit('rules')"
        ><text class="text-[20rpx] text-slate-500">{{ t('coupon.rules') }} ›</text></view
      >
      <view class="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-bg-page" />
      <view class="absolute -right-1.5 -top-1.5 w-3 h-3 rounded-full bg-bg-page" />
    </view>
  </view>
</template>
