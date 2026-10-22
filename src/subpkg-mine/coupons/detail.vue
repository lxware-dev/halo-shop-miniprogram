<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { getCouponScopeMessage, getCouponStatus, isCouponExpiring } from '@/helpers/coupon';
import { useCoupons } from '@/composables/useCoupons';
import { formatCurrency } from '@/utils/format';
import CouponValue from '@/components/business/coupon/CouponValue.vue';
import CouponRules from '@/components/business/coupon/CouponRules.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import AppEmpty from '@/components/common/AppEmpty.vue';
const { t } = useI18n();
const { mine, claimable, loading, failed, refresh, claim, claimingId } = useCoupons();
const id = ref(0);
const offer = ref(false);
const now = ref(Date.now());
const coupon = computed(() =>
  offer.value
    ? claimable.value.find((item) => item.id === id.value)
    : mine.value.find((item) => item.id === id.value),
);
const status = computed(() =>
  offer.value
    ? 'AVAILABLE'
    : getCouponStatus((coupon.value ?? {}) as CustomerCouponResponse, now.value),
);
const expiry = computed(() =>
  offer.value
    ? (coupon.value as CouponResponse)?.endsAt
    : (coupon.value as CustomerCouponResponse)?.expiresAt,
);
const validDays = computed(() => (coupon.value as CouponResponse)?.validDays);
const canUse = computed(() => status.value === 'AVAILABLE');
const name = computed(() =>
  offer.value
    ? claimable.value.find((item) => item.id === id.value)?.name
    : (coupon.value as CustomerCouponResponse)?.couponName,
);
onLoad((options) => {
  id.value = Number(options?.id);
  offer.value = options?.source === 'offer';
  uni.setNavigationBarTitle({ title: t('coupon.detailTitle') });
});
async function reload() {
  if (guardCurrentPageAccess()) {
    now.value = Date.now();
    await refresh();
  }
}
onShow(() => {
  void reload();
});
async function action() {
  if (loading.value || !canUse.value || claimingId.value !== null) {
    return;
  }
  if (offer.value) {
    const success = await claim(id.value);
    uni.showToast({
      title: t(success ? 'coupon.claimSuccess' : 'coupon.claimFailed'),
      icon: 'none',
    });
    if (success) {
      uni.navigateBack();
    }
    return;
  }
  const pages = getCurrentPages();
  const previous = pages[pages.length - 2] as any;
  if (previous?.options?.mode === 'select') {
    uni.navigateBack();
  } else {
    uni.switchTab({ url: '/pages/home/index' });
  }
}
</script>
<template>
  <view class="min-h-screen bg-bg-page p-4 pb-[calc(180rpx+env(safe-area-inset-bottom))]">
    <view v-if="loading && !coupon" class="py-16 text-center text-sm text-slate-400">{{
      t('common.loading')
    }}</view>
    <AppLoadError v-else-if="failed" @retry="reload" />
    <AppEmpty v-else-if="!coupon" :text="t('coupon.reason.templateNotFound')" />
    <template v-else>
      <view class="bg-white rounded-1.5 px-4 pt-5 pb-4 flex flex-col items-center text-center">
        <text class="text-xs mb-4" :class="canUse ? 'text-brand' : 'text-slate-400'">{{
          t(
            offer
              ? 'coupon.claimable'
              : status === 'USED'
                ? 'coupon.used'
                : status === 'EXPIRED'
                  ? 'coupon.expired'
                  : 'coupon.available',
          )
        }}</text>
        <CouponValue :coupon="coupon" large :muted="!canUse" />
        <text class="mt-4 text-base font-semibold text-slate-950 break-words">{{ name }}</text>
        <text class="mt-2 text-xs text-slate-500"
          >{{
            (coupon.minOrderAmount ?? 0) > 0
              ? t('coupon.minimum', { amount: formatCurrency(coupon.minOrderAmount) })
              : t('coupon.noMinimum')
          }}
          · {{ t(getCouponScopeMessage(coupon)) }}</text
        >
        <view class="border-0 border-t border-solid border-slate-50 w-full mt-5 pt-3">
          <text class="text-[20rpx] text-slate-400">{{
            expiry
              ? t('coupon.expires', { date: dayjs(expiry).format('YYYY.MM.DD HH:mm') })
              : offer && validDays
                ? t('coupon.validDays', { count: validDays })
                : t('coupon.noExpiry')
          }}</text>
          <text
            v-if="!offer && isCouponExpiring(coupon as CustomerCouponResponse, now)"
            class="block mt-1 text-[20rpx] text-brand"
            >{{ t('coupon.expiringSoon') }}</text
          >
        </view>
      </view>
      <view class="mt-3"><CouponRules :coupon="coupon" /></view>
      <view class="bg-white rounded-1.5 p-4 mt-3"
        ><text class="text-sm font-semibold text-slate-950">{{ t('coupon.howToUse') }}</text
        ><text class="block mt-2 text-xs text-slate-500 leading-relaxed">{{
          t('coupon.useSteps')
        }}</text></view
      >
      <text class="block mt-5 px-3 text-center text-xs text-slate-400 leading-relaxed">{{
        t('coupon.usageHint')
      }}</text>
      <view class="fixed bottom-0 left-0 right-0 bg-bg-page px-4 pt-3 pb-safe-sm"
        ><view
          class="rounded-2 py-3 text-center active:opacity-75"
          :class="canUse ? 'bg-brand' : 'bg-slate-300'"
          @tap="action"
          ><text class="text-sm font-medium text-white">{{
            t(
              offer
                ? claimingId !== null
                  ? 'coupon.claiming'
                  : 'coupon.claim'
                : canUse
                  ? 'coupon.goUse'
                  : status === 'USED'
                    ? 'coupon.used'
                    : 'coupon.expired',
            )
          }}</text></view
        ></view
      >
    </template>
  </view>
</template>
