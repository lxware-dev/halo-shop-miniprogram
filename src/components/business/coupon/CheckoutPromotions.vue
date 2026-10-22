<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import type { CalculateResult } from '@halo-dev/api-client';
import { formatCurrency } from '@/utils/format';
import { ICON_COLOR } from '@/helpers/icon';
import type { PromotionSelection } from '@/composables/useCheckoutPromotions';

const props = defineProps<{
  result: CalculateResult;
  selection: PromotionSelection;
  busy: boolean;
}>();
const emit = defineEmits<{
  selectCoupons: [];
  apply: [selection: PromotionSelection];
}>();
const { t } = useI18n();
const draftCode = ref('');
watch(
  () => props.selection.discountCode,
  (code) => {
    draftCode.value = code ?? '';
  },
  { immediate: true },
);
const applied = computed(() => props.result.appliedCoupons ?? []);
const rejected = computed(() => props.result.rejectedCoupons ?? []);
const canApplyCode = computed(() => !props.busy && Boolean(draftCode.value.trim()));

function applyCode() {
  if (!canApplyCode.value) {
    return;
  }
  emit('apply', { ...props.selection, discountCode: draftCode.value.trim() });
}
function removeCode() {
  if (!props.busy) {
    emit('apply', { ...props.selection, discountCode: undefined });
  }
}
</script>

<template>
  <view class="bg-white mt-2 px-4">
    <view
      class="flex items-center justify-between py-4 gap-4 active:opacity-75"
      @tap="!busy && emit('selectCoupons')"
    >
      <text class="text-slate-950 text-sm shrink-0">{{ t('coupon.title') }}</text>
      <view class="flex items-center gap-1 min-w-0">
        <text class="text-sm truncate" :class="applied.length ? 'text-brand' : 'text-slate-400'">{{
          applied.length
            ? t('coupon.saved', { amount: formatCurrency(result.couponDiscountAmount ?? 0) })
            : t('coupon.choose')
        }}</text>
        <TIcon name="chevron-right" v-bind="{ size: '32rpx', color: ICON_COLOR.muted }" />
      </view>
    </view>
    <view
      v-for="coupon in applied"
      :key="coupon.customerCouponId"
      class="flex items-start justify-between gap-4 pb-3"
    >
      <text class="text-xs text-slate-500 min-w-0 break-words">{{ coupon.couponName }}</text>
      <text class="text-xs text-brand shrink-0"
        >-{{ formatCurrency(coupon.discountAmount ?? 0) }}</text
      >
    </view>
    <view class="flex items-center gap-3 py-4 border-0 border-t border-solid border-slate-50">
      <text class="text-slate-950 text-sm shrink-0">{{ t('coupon.code') }}</text>
      <input
        v-model="draftCode"
        class="flex-1 min-w-0 text-sm text-slate-950"
        :placeholder="t('coupon.codePlaceholder')"
        :maxlength="255"
        :disabled="busy"
        @confirm="applyCode"
      />
      <view
        class="min-h-11 min-w-11 flex items-center justify-center shrink-0 active:opacity-70"
        :class="canApplyCode ? '' : 'opacity-50'"
        @tap="applyCode"
      >
        <view class="flex items-center justify-center rounded-1.5 bg-brand/10 px-2 py-1">
          <text class="text-xs text-brand leading-4 whitespace-nowrap">{{
            t('coupon.applyCode')
          }}</text>
        </view>
      </view>
    </view>
    <view v-if="result.discountId" class="flex items-start justify-between gap-3 pb-4">
      <view class="flex flex-col gap-1 min-w-0">
        <text class="text-xs text-slate-500 break-words">{{
          result.discountName || result.discountCode || t('coupon.automaticDiscount')
        }}</text>
        <text class="text-xs text-brand">-{{ formatCurrency(result.discountAmount ?? 0) }}</text>
      </view>
      <view v-if="selection.discountCode" class="py-1 active:opacity-70" @tap="removeCode"
        ><text class="text-xs text-slate-400">{{ t('coupon.remove') }}</text></view
      >
    </view>
    <view v-if="rejected.length" class="pb-4 flex flex-col gap-1">
      <text
        v-for="(coupon, index) in rejected"
        :key="`${coupon.customerCouponId}-${index}`"
        class="text-xs text-slate-500 leading-relaxed"
        >{{ t('coupon.rejected', { name: coupon.couponName || t('coupon.title') }) }} ·
        {{ t(`coupon.reason.${coupon.reasonCode}`, t('coupon.reason.unavailable')) }}</text
      >
    </view>
  </view>
</template>
