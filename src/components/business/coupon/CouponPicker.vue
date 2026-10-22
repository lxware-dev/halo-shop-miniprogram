<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  CheckoutContextResponse,
  CustomerCouponResponse,
  PrepareCheckoutRequest,
} from '@halo-dev/api-client';
import { useCheckoutPromotions } from '@/composables/useCheckoutPromotions';
import type { PromotionSelection } from '@/composables/useCheckoutPromotions';
import { getCouponStatus } from '@/helpers/coupon';
import { formatCurrency } from '@/utils/format';
import CouponCard from './CouponCard.vue';
import CouponEmpty from './CouponEmpty.vue';
const props = defineProps<{
  coupons: CustomerCouponResponse[];
  loading: boolean;
  failed: boolean;
  unsupported: boolean;
  now: number;
  checkout: {
    payload: PrepareCheckoutRequest;
    context: CheckoutContextResponse;
    selection: PromotionSelection;
  };
}>();
const emit = defineEmits<{
  confirm: [ids: number[]];
  rules: [coupon: CustomerCouponResponse];
  claim: [];
}>();
const { t } = useI18n();
const payload = ref<PrepareCheckoutRequest | null>(props.checkout.payload);
const {
  context,
  selection,
  syncing,
  failed: pricingFailed,
  verified,
  apply,
  refresh,
} = useCheckoutPromotions(payload, () => {}, props.checkout);
watch(
  () => props.now,
  () => {
    void refresh(payload.value?.selectedAddressId);
  },
  { immediate: true },
);
const available = computed(() =>
  props.coupons.filter((coupon) => getCouponStatus(coupon, props.now) === 'AVAILABLE'),
);
const result = computed(() => context.value?.calculateResult);
const selectedIds = computed(() => selection.value.customerCouponIds);
const rejected = computed(
  () =>
    new Map(
      (result.value?.rejectedCoupons ?? []).map((coupon) => [
        coupon.customerCouponId,
        coupon.reasonCode,
      ]),
    ),
);
const busy = computed(() => props.loading || syncing.value);
const canConfirm = computed(
  () =>
    !busy.value && !props.failed && !props.unsupported && !pricingFailed.value && verified.value,
);
async function select(id?: number) {
  if (!id || busy.value) {
    return;
  }
  if (!selectedIds.value.includes(id) && selectedIds.value.length >= 50) {
    uni.showToast({ title: t('coupon.selectionLimit'), icon: 'none' });
    return;
  }
  await apply({
    ...selection.value,
    customerCouponIds: selectedIds.value.includes(id)
      ? selectedIds.value.filter((value) => value !== id)
      : [...selectedIds.value, id],
  });
}
async function clear() {
  if (!busy.value) {
    await apply({ ...selection.value, customerCouponIds: [] });
  }
}
</script>
<template>
  <view class="pb-[calc(180rpx+env(safe-area-inset-bottom))]">
    <view class="bg-white px-4 py-4 flex flex-col gap-2">
      <view class="flex justify-between gap-3"
        ><text class="text-sm text-slate-950">{{ t('coupon.productAmount') }}</text
        ><text class="text-sm font-semibold text-slate-950">{{
          formatCurrency(result?.saleTotalAmount ?? 0)
        }}</text></view
      >
      <text class="text-xs text-slate-400 leading-relaxed">{{ t('coupon.selectionHint') }}</text>
    </view>
    <view class="flex items-center justify-between gap-3 px-4 pt-5 pb-3"
      ><text class="text-sm font-semibold text-slate-950">{{
        t('coupon.availableCount', { count: available.length })
      }}</text
      ><text class="text-xs text-slate-400">{{
        t('coupon.selectedCount', { count: selectedIds.length })
      }}</text></view
    >
    <view class="px-4 flex flex-col gap-3">
      <view v-for="coupon in available" :key="coupon.id">
        <CouponCard
          :coupon="coupon"
          :selected="selectedIds.includes(coupon.id ?? 0)"
          :muted="rejected.has(coupon.id)"
          :now="now"
          @tap="select(coupon.id)"
          @rules="emit('rules', coupon)"
        >
          <template #action>
            <view class="p-2 -m-2" @tap="select(coupon.id)"
              ><view
                class="w-4 h-4 rounded-full border border-solid flex items-center justify-center"
                :class="
                  selectedIds.includes(coupon.id ?? 0)
                    ? 'bg-brand border-brand'
                    : 'border-slate-300'
                "
                ><text
                  v-if="selectedIds.includes(coupon.id ?? 0)"
                  class="text-white text-[20rpx] leading-none"
                  >✓</text
                ></view
              ></view
            >
          </template>
        </CouponCard>
        <text v-if="rejected.has(coupon.id)" class="block px-3 mt-2 text-[20rpx] text-slate-500">{{
          t(`coupon.reason.${rejected.get(coupon.id)}`, t('coupon.reason.unavailable'))
        }}</text>
      </view>
      <view
        class="bg-white rounded-1.5 px-3 py-4 flex items-center justify-between active:opacity-75"
        @tap="clear"
        ><text class="text-xs text-slate-950">{{ t('coupon.clearSelection') }}</text
        ><view
          class="w-4 h-4 rounded-full border border-solid flex items-center justify-center"
          :class="selectedIds.length ? 'border-slate-300' : 'bg-brand border-brand'"
          ><text v-if="!selectedIds.length" class="text-white text-[20rpx] leading-none"
            >✓</text
          ></view
        ></view
      >
      <view class="py-3 text-center" @tap="emit('claim')"
        ><text class="text-xs text-brand">{{ t('coupon.moreOffers') }} ›</text></view
      >
    </view>
    <CouponEmpty v-if="!loading && !available.length" @claim="emit('claim')" />
    <view
      v-if="pricingFailed"
      class="mx-4 mt-2 rounded-1.5 bg-red-50 p-3"
      @tap="refresh(payload?.selectedAddressId)"
      ><text class="text-xs text-brand"
        >{{ t('coupon.updateFailed') }} · {{ t('common.retry') }}</text
      ></view
    >
    <view
      class="fixed bottom-0 left-0 right-0 z-10 bg-white px-4 pt-3 pb-safe-sm border-0 border-t border-solid border-slate-100 flex items-center justify-between gap-4"
    >
      <view class="min-w-0 flex flex-col gap-1">
        <view class="flex items-baseline gap-1"
          ><text class="text-xs text-slate-950">{{ t('coupon.payable') }}</text
          ><text class="text-lg font-bold text-brand">{{
            syncing
              ? t('common.loading')
              : pricingFailed
                ? '—'
                : formatCurrency(result?.payableAmount ?? 0)
          }}</text></view
        >
        <text class="text-[20rpx] text-slate-400">{{
          t('coupon.saved', {
            amount: formatCurrency(
              (result?.discountAmount ?? 0) + (result?.couponDiscountAmount ?? 0),
            ),
          })
        }}</text>
      </view>
      <view
        class="rounded-1.5 bg-brand px-5 py-3 shrink-0 active:opacity-75"
        :class="!canConfirm ? 'opacity-50' : ''"
        @tap="canConfirm && emit('confirm', selectedIds)"
        ><text class="text-sm font-medium text-white">{{ t('coupon.confirm') }}</text></view
      >
    </view>
  </view>
</template>
