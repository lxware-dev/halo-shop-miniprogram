<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import type {
  CouponResponse,
  CustomerCouponResponse,
  CheckoutContextResponse,
  PrepareCheckoutRequest,
} from '@halo-dev/api-client';
import { guardCurrentPageAccess, navigateToPage } from '@/helpers/auth';
import { getCouponStatus, isCouponExpiring, normalizeCouponIds } from '@/helpers/coupon';
import { useCoupons } from '@/composables/useCoupons';
import type { PromotionSelection } from '@/composables/useCheckoutPromotions';
import CouponCollection from '@/components/business/coupon/CouponCollection.vue';
import CouponPicker from '@/components/business/coupon/CouponPicker.vue';
import CouponEmpty from '@/components/business/coupon/CouponEmpty.vue';
import AppEmpty from '@/components/common/AppEmpty.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
const { t } = useI18n();
const { mine, claimable, loading, failed, unsupported, claimingId, refresh, claim } = useCoupons();
const mode = ref('wallet');
const active = ref('ALL');
const now = ref(Date.now());
const checkout = ref<{
  payload: PrepareCheckoutRequest;
  context: CheckoutContextResponse;
  selection: PromotionSelection;
} | null>(null);
const available = computed(() =>
  mine.value.filter((coupon) => getCouponStatus(coupon, now.value) === 'AVAILABLE'),
);
const history = computed(() =>
  mine.value.filter((coupon) => ['USED', 'EXPIRED'].includes(getCouponStatus(coupon, now.value))),
);
const expiringCount = computed(
  () => available.value.filter((coupon) => isCouponExpiring(coupon, now.value)).length,
);
const tabs = computed(() =>
  mode.value === 'claim'
    ? [
        { key: 'ALL', label: t('coupon.all') },
        { key: 'AMOUNT', label: t('coupon.amountType') },
        { key: 'PERCENTAGE', label: t('coupon.percentType') },
      ]
    : mode.value === 'history'
      ? ['ALL', 'USED', 'EXPIRED'].map((key) => ({
          key,
          label: `${t(key === 'ALL' ? 'coupon.all' : key === 'USED' ? 'coupon.used' : 'coupon.expired')} (${key === 'ALL' ? history.value.length : history.value.filter((coupon) => getCouponStatus(coupon, now.value) === key).length})`,
        }))
      : [
          { key: 'ALL', label: t('coupon.availableCount', { count: available.value.length }) },
          { key: 'HISTORY', label: t('coupon.history') },
        ],
);
const filtered = computed(() =>
  mode.value === 'claim'
    ? claimable.value.filter(
        (coupon) => active.value === 'ALL' || coupon.calculationType === active.value,
      )
    : mode.value === 'history'
      ? history.value.filter(
          (coupon) => active.value === 'ALL' || getCouponStatus(coupon, now.value) === active.value,
        )
      : available.value,
);
onLoad((options) => {
  mode.value = ['select', 'claim', 'history'].includes(options?.mode ?? '')
    ? options!.mode!
    : 'wallet';
  if (mode.value === 'select') {
    const pages = getCurrentPages();
    checkout.value = (pages[pages.length - 2] as any)?.couponCheckout ?? null;
  }
  uni.setNavigationBarTitle({
    title: t(
      mode.value === 'select'
        ? 'coupon.selectTitle'
        : mode.value === 'claim'
          ? 'coupon.claimable'
          : mode.value === 'history'
            ? 'coupon.history'
            : 'coupon.walletTitle',
    ),
  });
});
async function reload() {
  if (!guardCurrentPageAccess()) {
    return;
  }
  now.value = Date.now();
  await refresh();
}
onShow(() => {
  void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
function openMode(next: string) {
  const pages = getCurrentPages();
  const previous = pages[pages.length - 2] as any;
  if (
    previous?.route === 'subpkg-mine/coupons/index' &&
    (previous.options?.mode ?? 'wallet') === next
  ) {
    uni.navigateBack();
    return;
  }
  navigateToPage(`/subpkg-mine/coupons/index?mode=${next}`);
}
function selectTab(key: string) {
  if (key === 'HISTORY') {
    openMode('history');
  } else {
    active.value = key;
  }
}
function openRules(coupon: CouponResponse | CustomerCouponResponse) {
  if (!coupon.id) {
    return;
  }
  navigateToPage(
    `/subpkg-mine/coupons/detail?id=${coupon.id}&source=${mode.value === 'claim' ? 'offer' : 'wallet'}`,
  );
}
function goUse() {
  uni.switchTab({ url: '/pages/home/index' });
}
async function claimCoupon(id?: number) {
  if (!id || loading.value || claimingId.value !== null) {
    return;
  }
  const success = await claim(id);
  uni.showToast({ title: t(success ? 'coupon.claimSuccess' : 'coupon.claimFailed'), icon: 'none' });
}
function confirm(ids: number[]) {
  if (loading.value || failed.value || unsupported.value) {
    return;
  }
  const pages = getCurrentPages();
  const previous = pages[pages.length - 2] as any;
  previous?.onCouponsSelected?.(normalizeCouponIds(ids));
  uni.navigateBack();
}
</script>
<template>
  <view class="min-h-screen bg-bg-page pb-safe-sm">
    <template v-if="mode !== 'select'">
      <view
        v-if="mode === 'claim'"
        class="bg-[#fff0f0] px-5 py-6 flex items-center justify-between gap-4"
      >
        <view class="flex-1 min-w-0 flex flex-col gap-2"
          ><text class="text-xl font-semibold text-slate-950">{{ t('coupon.heroTitle') }}</text
          ><text class="text-xs text-slate-500">{{ t('coupon.heroHint') }}</text></view
        >
        <image src="/static/coupons/ticket.png" class="w-14 h-12 shrink-0" mode="aspectFit" />
      </view>
      <view class="sticky top-0 z-10 bg-white flex">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="flex-1 text-center pt-4 active:opacity-70"
          @tap="selectTab(tab.key)"
          ><text
            class="text-sm"
            :class="active === tab.key ? 'text-brand font-semibold' : 'text-slate-500'"
            >{{ tab.label }}</text
          ><view
            class="h-0.5 w-6 rounded-full mx-auto mt-3"
            :class="active === tab.key ? 'bg-brand' : 'bg-transparent'"
        /></view>
      </view>
    </template>
    <view
      v-if="loading && !mine.length && !claimable.length"
      class="py-16 text-center text-sm text-slate-400"
      >{{ t('common.loading') }}</view
    >
    <AppLoadError v-else-if="failed" @retry="reload" />
    <AppEmpty v-else-if="unsupported" :text="t('coupon.unsupported')" />
    <template v-else-if="mode !== 'select'">
      <view class="px-4 pt-5 pb-4 flex items-center justify-between gap-3">
        <text class="text-xs text-slate-500 leading-relaxed">{{
          t(
            mode === 'claim'
              ? 'coupon.claimHint'
              : mode === 'history'
                ? 'coupon.historyHint'
                : 'coupon.moreOffers',
          )
        }}</text>
        <view
          v-if="mode !== 'history'"
          class="py-1 shrink-0 active:opacity-70"
          @tap="openMode(mode === 'claim' ? 'wallet' : 'claim')"
          ><text class="text-xs text-brand"
            >{{ t(mode === 'claim' ? 'coupon.walletTitle' : 'coupon.goClaim') }} ›</text
          ></view
        >
      </view>
      <view
        v-if="mode === 'wallet' && expiringCount"
        class="mx-4 mb-3 rounded-1.5 bg-[#fff0f0] px-3 py-3"
        ><text class="text-xs text-brand">{{
          t('coupon.expiringNotice', { count: expiringCount })
        }}</text></view
      >
      <CouponCollection
        :coupons="filtered"
        :offers="mode === 'claim'"
        :history="mode === 'history'"
        :claiming-id="claimingId"
        :now="now"
        @claim="claimCoupon"
        @use="goUse"
        @rules="openRules"
      />
      <CouponEmpty
        v-if="!filtered.length"
        :offers="mode === 'claim'"
        :history="mode === 'history'"
        :status="active"
        @claim="openMode('claim')"
        @history="openMode('history')"
      />
      <view v-if="mode === 'wallet'" class="px-6 pt-10 pb-4 text-center"
        ><text class="text-xs text-slate-400 leading-relaxed">{{
          t('coupon.usageHint')
        }}</text></view
      >
    </template>
    <CouponPicker
      v-if="mode === 'select' && checkout"
      :coupons="mine"
      :checkout="checkout"
      :loading="loading"
      :failed="failed"
      :unsupported="unsupported"
      :now="now"
      @confirm="confirm"
      @rules="openRules"
      @claim="openMode('claim')"
    />
    <AppEmpty v-else-if="mode === 'select'" :text="t('coupon.checkoutMissing')" />
  </view>
</template>
