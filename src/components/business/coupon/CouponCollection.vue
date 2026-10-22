<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';
import CouponCard from './CouponCard.vue';
import { getCouponStatus } from '@/helpers/coupon';
const props = defineProps<{
  coupons: (CouponResponse | CustomerCouponResponse)[];
  offers?: boolean;
  history?: boolean;
  claimingId?: number | null;
  now: number;
}>();
const emit = defineEmits<{
  claim: [id?: number];
  use: [];
  rules: [coupon: CouponResponse | CustomerCouponResponse];
}>();
const { t } = useI18n();
const groups = computed(() =>
  props.history
    ? ['USED', 'EXPIRED']
        .map((status) => ({
          label: t(status === 'USED' ? 'coupon.used' : 'coupon.expired'),
          coupons: props.coupons.filter(
            (coupon) => getCouponStatus(coupon as CustomerCouponResponse, props.now) === status,
          ),
        }))
        .filter((group) => group.coupons.length)
    : [{ label: '', coupons: props.coupons }],
);
</script>
<template>
  <view class="px-4 flex flex-col gap-5">
    <view v-for="group in groups" :key="group.label" class="flex flex-col gap-3">
      <view v-if="group.label" class="flex items-center justify-between"
        ><text class="text-sm font-semibold text-slate-950">{{ group.label }}</text
        ><text class="text-xs text-slate-400">{{
          t('coupon.count', { count: group.coupons.length })
        }}</text></view
      >
      <view v-for="coupon in group.coupons" :key="coupon.id">
        <CouponCard :coupon="coupon" :muted="history" :now="now" @rules="emit('rules', coupon)">
          <template #action>
            <view
              v-if="offers"
              class="min-h-11 flex items-center justify-center active:opacity-75"
              :class="claimingId !== null ? 'opacity-50' : ''"
              @tap="emit('claim', coupon.id)"
              ><view class="flex items-center justify-center rounded-full bg-brand px-3 py-1.5"
                ><text class="text-xs font-medium text-white leading-4 whitespace-nowrap">{{
                  t(claimingId === coupon.id ? 'coupon.claiming' : 'coupon.claim')
                }}</text></view
              ></view
            >
            <text
              v-else-if="history"
              class="bg-slate-100 rounded px-1.5 py-1 text-[20rpx] text-slate-500"
              >{{
                t(
                  getCouponStatus(coupon as CustomerCouponResponse, now) === 'USED'
                    ? 'coupon.used'
                    : 'coupon.expired',
                )
              }}</text
            >
            <view
              v-else
              class="min-h-11 flex items-center justify-center active:opacity-70"
              @tap="emit('use')"
              ><view
                class="flex items-center justify-center rounded-full border border-solid border-brand px-3 py-1.5"
                ><text class="text-xs text-brand leading-4 whitespace-nowrap">{{
                  t('coupon.goUse')
                }}</text></view
              ></view
            >
          </template>
        </CouponCard>
        <text
          v-if="history && (coupon as CustomerCouponResponse).usedAt"
          class="block mt-2 px-3 text-[20rpx] text-slate-400"
          >{{
            t('coupon.usedOn', {
              date: dayjs((coupon as CustomerCouponResponse).usedAt).format('YYYY.MM.DD HH:mm'),
            })
          }}</text
        >
      </view>
    </view>
    <text v-if="coupons.length" class="py-3 text-center text-xs text-slate-400">{{
      t('coupon.noMore')
    }}</text>
  </view>
</template>
