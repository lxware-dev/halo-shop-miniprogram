<script setup lang="ts">
import { shallowRef, computed } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { useI18n } from 'vue-i18n';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { usePaymentResult } from '@/composables/usePaymentResult';
import { ICON_COLOR } from '@/helpers/icon';
import { getCurrencySymbol, formatPriceByLocale } from '@/utils/format';

const orderCode = shallowRef('');
const sessionCode = shallowRef('');
const { t, locale } = useI18n();
const { order, result, checking, queryFailed, check, dispose } = usePaymentResult();
const amount = computed(() => order.value?.totalAmount ?? 0);
const currencySymbol = getCurrencySymbol();
const isSuccess = computed(() => result.value === 'success');
const isPending = computed(() => result.value === 'pending');
const resultTitle = computed(() => t(`paymentResult.${result.value}`));
const resultDescription = computed(() =>
  t(
    queryFailed.value && isPending.value
      ? 'paymentResult.queryFailed'
      : `paymentResult.${result.value}Desc`,
  ),
);
const primaryActionText = computed(() => {
  if (isPending.value) {
    return t(checking.value ? 'paymentResult.checking' : 'paymentResult.checkAgain');
  }
  return t(isSuccess.value ? 'paymentResult.viewOrder' : 'paymentResult.retryPay');
});
const formattedAmount = computed(() => formatPriceByLocale(amount.value, locale.value));

onLoad(async (options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  orderCode.value = options?.orderCode ?? '';
  sessionCode.value = options?.sessionCode ?? '';
  // URL status and client payment callbacks cannot prove payment success.
  await checkResult();
});
onUnload(dispose);

function checkResult() {
  return check(orderCode.value, sessionCode.value || undefined);
}

function handlePrimaryAction() {
  if (isPending.value) {
    void checkResult();
  } else {
    goToOrderDetail();
  }
}

function goToOrderDetail() {
  uni.redirectTo({
    url: orderCode.value
      ? `/subpkg-trade/order-detail/index?orderCode=${encodeURIComponent(orderCode.value)}`
      : '/subpkg-trade/order-list/index',
  });
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' });
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="flex-1 bg-white flex flex-col items-center px-6 pt-16 pb-12">
      <view class="mb-6">
        <view
          v-if="isSuccess"
          class="flex items-center justify-center rounded-full w-18 h-18 bg-status-success"
        >
          <TIcon name="check" v-bind="{ size: '72rpx', color: ICON_COLOR.inverse }" />
        </view>
        <view
          v-else-if="isPending"
          class="flex items-center justify-center rounded-full w-18 h-18 bg-status-info"
        >
          <TIcon name="time" v-bind="{ size: '72rpx', color: ICON_COLOR.inverse }" />
        </view>
        <view
          v-else
          class="flex items-center justify-center rounded-full w-18 h-18 bg-status-danger"
        >
          <TIcon name="close" v-bind="{ size: '72rpx', color: ICON_COLOR.inverse }" />
        </view>
      </view>

      <view class="flex flex-col items-center gap-2 mb-10">
        <text class="text-slate-950 text-2xl font-medium">
          {{ checking ? t('paymentResult.checking') : resultTitle }}
        </text>
        <text class="text-slate-500 text-sm text-center">
          {{ resultDescription }}
        </text>
      </view>

      <view v-if="amount > 0" class="flex items-start gap-1 mb-12">
        <text class="text-brand text-sm mt-1 font-bold">{{ currencySymbol }}</text>
        <text class="text-brand text-3xl font-bold leading-none tracking-[-1.8rpx]">
          {{ formattedAmount }}
        </text>
      </view>

      <view class="flex flex-col gap-4 w-full max-w-96">
        <view
          class="flex items-center justify-center bg-brand rounded-2 py-3.5 w-full"
          :class="checking ? 'opacity-60' : ''"
          @tap="handlePrimaryAction"
        >
          <text class="text-white text-base font-medium">
            {{ primaryActionText }}
          </text>
        </view>

        <view
          v-if="isPending"
          class="flex items-center justify-center bg-white border border-solid border-slate-200 rounded-2 py-3.5 w-full"
          @tap="goToOrderDetail"
        >
          <text class="text-slate-700 text-base">{{ t('paymentResult.viewOrder') }}</text>
        </view>

        <view
          class="flex items-center justify-center bg-white border border-solid border-slate-200 rounded-2 py-3.5 w-full"
          @tap="goHome"
        >
          <text class="text-slate-700 text-base">{{ t('paymentResult.backHome') }}</text>
        </view>
      </view>

      <view class="flex items-center gap-2 mt-auto pt-12">
        <TIcon name="secured" v-bind="{ size: '28rpx', color: ICON_COLOR.muted }" />
        <text class="text-slate-400 text-xs">{{ t('paymentResult.secured') }}</text>
      </view>
    </view>
  </view>
</template>
