<script setup lang="ts">
import { computed } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { openLegalDocument } from '@/helpers/legal';
import { useOrderPayment } from '@/composables/useOrderPayment';
import { formatCurrency, formatPriceByLocale, getCurrencySymbol } from '@/utils/format';
import { ICON_COLOR } from '@/helpers/icon';

const { t, locale } = useI18n();
const {
  orderCode,
  order,
  paymentMethods,
  selectedMethodId,
  loading,
  loadError,
  paying,
  redirecting,
  awaitingResult,
  resultNavigationFailed,
  isPayable,
  canPay,
  load,
  selectMethod,
  pay,
  viewPaymentResult,
  dispose,
} = useOrderPayment();
const payableAmount = computed(() => order.value?.totalAmount ?? 0);
const formattedAmount = computed(() => formatPriceByLocale(payableAmount.value, locale.value));
const currencySymbol = getCurrencySymbol();
const paymentActionDisabled = computed(() =>
  awaitingResult.value ? redirecting.value : !canPay.value,
);
const paymentActionText = computed(() => {
  if (awaitingResult.value) {
    return t(redirecting.value ? 'paymentResult.opening' : 'paymentResult.viewResult');
  }
  return paying.value
    ? t('payment.processing')
    : t('payment.payNow', {
        amount: formatCurrency(payableAmount.value, { locale: locale.value }),
      });
});

onLoad(async (options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (options?.orderCode) {
    await load(options.orderCode);
  }
});
onUnload(dispose);

function goToOrderDetail() {
  uni.redirectTo({
    url: orderCode.value
      ? `/subpkg-trade/order-detail/index?orderCode=${encodeURIComponent(orderCode.value)}`
      : '/subpkg-trade/order-list/index',
  });
}

function handlePaymentAction() {
  if (awaitingResult.value) {
    viewPaymentResult();
  } else {
    void pay();
  }
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-white">
    <view class="bg-white flex flex-col items-center px-4 py-10">
      <text class="text-slate-500 text-sm mb-2">{{ $t('payment.pendingAmount') }}</text>

      <view class="flex items-end gap-1 mb-4">
        <text class="text-brand text-2xl font-bold leading-none">{{ currencySymbol }}</text>
        <text class="text-brand text-4xl font-bold leading-none tracking-tighter">
          {{ formattedAmount }}
        </text>
      </view>

      <view v-if="orderCode" class="flex items-center bg-slate-50 rounded-1 px-3 py-1">
        <text class="text-slate-500 text-xs">{{
          $t('payment.orderCode', { code: orderCode })
        }}</text>
      </view>
    </view>

    <view class="flex flex-col gap-4 px-4 pb-27.5">
      <text class="text-slate-950 text-sm font-medium">{{ $t('payment.selectMethod') }}</text>

      <view v-if="loading" class="flex items-center justify-center py-8">
        <text class="text-slate-400 text-sm">{{ $t('common.loading') }}</text>
      </view>

      <view v-else-if="loadError" class="flex flex-col items-center gap-4 py-8">
        <text class="text-slate-500 text-sm text-center">
          {{ $t(loadError === 'order' ? 'payment.loadOrderFailed' : 'payment.loadMethodsFailed') }}
        </text>
        <view class="border border-solid border-slate-200 rounded-2 px-6 py-3" @tap="load()">
          <text class="text-slate-700 text-sm">{{ $t('payment.retryLoad') }}</text>
        </view>
      </view>

      <view v-else-if="!isPayable" class="flex flex-col items-center gap-4 py-8">
        <text class="text-slate-500 text-sm">{{ $t('payment.orderNotPayable') }}</text>
        <view
          class="border border-solid border-slate-200 rounded-2 px-6 py-3"
          @tap="goToOrderDetail"
        >
          <text class="text-slate-700 text-sm">{{ $t('paymentResult.viewOrder') }}</text>
        </view>
      </view>

      <view v-else-if="paymentMethods.length === 0" class="flex items-center justify-center py-8">
        <text class="text-slate-400 text-sm">{{ $t('payment.noMethods') }}</text>
      </view>

      <view v-else class="flex flex-col gap-3">
        <view
          v-for="method in paymentMethods"
          :key="method.id"
          class="flex items-center gap-4 bg-white border border-solid rounded-2 px-4 py-4"
          :class="selectedMethodId === method.id ? 'border-brand' : 'border-slate-100'"
          @tap="selectMethod(method.id)"
        >
          <view
            class="flex items-center justify-center rounded-full shrink-0 w-6.5 h-6.5 bg-status-wechat"
          >
            <TIcon name="logo-wechatpay" v-bind="{ size: '28rpx', color: ICON_COLOR.inverse }" />
          </view>

          <view class="flex-1 flex flex-col gap-0.5 min-w-0">
            <view class="flex items-center gap-2">
              <text class="text-slate-950 text-sm font-medium">{{ method.name }}</text>
              <view class="flex items-center bg-brand/10 rounded-0.5 px-1.5 py-0.5">
                <text class="text-brand text-xs">{{ $t('payment.recommended') }}</text>
              </view>
            </view>
            <text class="text-slate-500 text-xs">{{ $t('payment.wechatPayDesc') }}</text>
          </view>

          <view
            class="flex items-center justify-center shrink-0 rounded-full border-2 border-solid w-5 h-5"
            :class="
              selectedMethodId === method.id
                ? 'border-brand bg-brand'
                : 'border-slate-300 bg-transparent'
            "
          >
            <view v-if="selectedMethodId === method.id" class="rounded-full bg-white w-2 h-2" />
          </view>
        </view>
      </view>

      <view
        class="flex items-center justify-center gap-3 rounded-2 border border-solid border-brand/10 px-4 py-3.5 bg-brand/5"
      >
        <TIcon name="info-circle" v-bind="{ size: '30rpx', color: 'rgba(238,43,43,0.8)' }" />
        <view class="flex-1 flex flex-wrap items-center text-xs leading-relaxed">
          <text class="text-brand/80">{{ $t('payment.agreementPrefix') }}</text>
          <text class="text-brand font-medium" @tap.stop="openLegalDocument('paymentAgreement')">
            {{ $t('legal.paymentAgreement') }}
          </text>
          <text class="text-brand/80">{{ $t('payment.agreementAnd') }}</text>
          <text class="text-brand font-medium" @tap.stop="openLegalDocument('privacyPolicy')">
            {{ $t('legal.privacyPolicy') }}
          </text>
          <text class="text-brand/80">{{ $t('payment.agreementSuffix') }}</text>
        </view>
      </view>
    </view>

    <view
      class="fixed bottom-0 left-0 right-0 z-10 bg-white border-0 border-t border-solid border-slate-100 flex flex-col gap-3 px-4 pt-4.5 pb-safe"
    >
      <text v-if="resultNavigationFailed" class="text-slate-500 text-sm text-center">
        {{ $t('paymentResult.openFailed') }}
      </text>
      <view
        class="flex items-center justify-center rounded-2 py-3.5 w-full bg-brand shadow-brand-btn"
        :class="paymentActionDisabled ? 'opacity-60' : ''"
        @tap="handlePaymentAction"
      >
        <text class="text-white text-base font-bold">
          {{ paymentActionText }}
        </text>
      </view>
    </view>
  </view>
</template>
