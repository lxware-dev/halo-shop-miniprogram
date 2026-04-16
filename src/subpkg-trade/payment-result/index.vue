<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { useI18n } from 'vue-i18n';
import { orderApi } from '@/api/modules/order';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { useQuery } from '@/hooks/useRequest';
import { ICON_COLOR } from '@/helpers/icon';
import { getCurrencySymbol, formatPriceByLocale } from '@/utils/format';
import type { OrderResponse } from '@halo-dev/api-client';

const status = ref<'success' | 'fail'>('success');
const orderCode = ref<string>('');
const { t, locale } = useI18n();
const { data: orderData, run: runOrder } = useQuery<OrderResponse, { orderCode: string }>(
  (params: { orderCode: string }) => orderApi.getOrder(params.orderCode),
  { immediate: false },
);
const amount = computed(() => orderData.value?.totalAmount ?? 0);
const currencySymbol = getCurrencySymbol();

onLoad(async (options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (options?.status) {
    status.value = options.status === 'fail' ? 'fail' : 'success';
  }
  if (options?.orderCode) {
    orderCode.value = options.orderCode;
  }
  if (orderCode.value) {
    try {
      await runOrder({ orderCode: orderCode.value });
    } catch {
      // ignore
    }
  }
});

const isSuccess = computed(() => status.value === 'success');

const formattedAmount = computed(() => {
  return formatPriceByLocale(amount.value, locale.value);
});

function goToOrderDetail() {
  if (orderCode.value) {
    uni.redirectTo({
      url: `/subpkg-trade/order-detail/index?orderCode=${orderCode.value}`,
    });
  } else {
    uni.redirectTo({ url: '/subpkg-trade/order-list/index' });
  }
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
          v-else
          class="flex items-center justify-center rounded-full w-18 h-18 bg-status-danger"
        >
          <TIcon name="close" v-bind="{ size: '72rpx', color: ICON_COLOR.inverse }" />
        </view>
      </view>

      <view class="flex flex-col items-center gap-2 mb-10">
        <text class="text-slate-950 text-2xl font-medium">
          {{ isSuccess ? t('paymentResult.success') : t('paymentResult.fail') }}
        </text>
        <text class="text-slate-500 text-sm text-center">
          {{ isSuccess ? t('paymentResult.successDesc') : t('paymentResult.failDesc') }}
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
          @tap="goToOrderDetail"
        >
          <text class="text-white text-base font-medium">
            {{ isSuccess ? t('paymentResult.viewOrder') : t('paymentResult.retryPay') }}
          </text>
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
