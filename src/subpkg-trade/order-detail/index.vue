<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import { orderApi } from '@/api/modules/order';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { ICON_COLOR } from '@/helpers/icon';
import { useCart } from '@/hooks/useCart';
import { sendRequest, useAsyncQuery } from '@/hooks/useRequest';
import { formatCurrency, maskPhone, joinName, formatDate } from '@/utils/format';
import {
  getOrderStatusInfo,
  canPayNow,
  canViewLogistics,
  canConfirmReceive,
  canBuyAgain,
  getSpecText,
  requiresShipping,
} from '@/helpers/order';
import type { OrderResponse, OrderItemResponse, FulfillmentUcResponse } from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';

const orderCode = ref('');
const { t } = useI18n();
const {
  data: detailData,
  loading,
  error: loadErrorRaw,
  run: runOrderDetail,
} = useAsyncQuery<
  { orderData: OrderResponse; fulfillData: FulfillmentUcResponse[] },
  { orderCode: string }
>(
  async (params) => {
    const [orderData, fulfillData] = await Promise.all([
      sendRequest(orderApi.getOrder(params.orderCode)),
      sendRequest(orderApi.getOrderFulfillments(params.orderCode)).catch(() => []),
    ]);
    return { orderData, fulfillData: fulfillData as FulfillmentUcResponse[] };
  },
  { immediate: false },
);
const order = computed(() => detailData.value?.orderData ?? null);
const fulfillments = computed(() => detailData.value?.fulfillData ?? []);
const loadError = computed(() => !!loadErrorRaw.value);

onLoad(async (options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (options?.orderCode) {
    orderCode.value = options.orderCode;
    try {
      await runOrderDetail({ orderCode: orderCode.value });
    } catch {
      // ignore
    }
  }
});

function retryLoadData() {
  if (!orderCode.value) {
    return;
  }
  runOrderDetail({ orderCode: orderCode.value });
}

const statusInfo = computed(() => {
  const orderRaw = order.value;
  if (!orderRaw) {
    return { label: '', subtitle: '', textClass: '', bgClass: '', heroBgClass: 'bg-brand' };
  }
  return getOrderStatusInfo(orderRaw);
});

const orderRequiresShipping = computed(() => !!order.value && requiresShipping(order.value));

/**
 * Latest logistics update
 */
const latestLogistics = computed(() => {
  if (!orderRequiresShipping.value || !fulfillments.value.length) {
    return null;
  }
  const f = fulfillments.value[0];
  const label = f.labels?.[0];
  if (!label?.carrier && !label?.trackingNumber) {
    return null;
  }
  return {
    carrier: label?.carrier ?? t('order.status.express'),
    trackingNumber: label?.trackingNumber ?? '',
  };
});

/**
 * Shipping address
 */
const shippingAddr = computed(() => {
  if (!orderRequiresShipping.value) {
    return null;
  }
  const addr = order.value?.shippingAddress;
  if (!addr) {
    return null;
  }
  const name = joinName(addr.lastName, addr.firstName);
  const phone = maskPhone(addr.contactPhone ?? '');
  const fullAddr = [addr.province, addr.city, addr.district, addr.streetAddress]
    .filter(Boolean)
    .join('');
  return { name, phone, fullAddr };
});

/**
 * Item subtotal (sum of item unit price x quantity)
 */
const subtotal = computed(() => {
  return (order.value?.items ?? []).reduce(
    (sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 1),
    0,
  );
});

/**
 * Shipping fee = order total - item subtotal; clamp negative values to 0 for safety
 */
const shippingFee = computed(() => {
  const fee = (order.value?.totalAmount ?? 0) - subtotal.value;
  return fee > 0 ? fee : 0;
});

function getItemSpecText(item: OrderItemResponse): string {
  return getSpecText(item.productVariantSnapshot?.specValues);
}

const showPayNow = computed(() => !!order.value && canPayNow(order.value));
const showConfirmReceive = computed(() => !!order.value && canConfirmReceive(order.value));
const showViewLogistics = computed(() => !!order.value && canViewLogistics(order.value));
// const showCancelOrder = computed(() => !!order.value && canCancelOrder(order.value));
const showBuyAgain = computed(() => !!order.value && canBuyAgain(order.value));

function onPayNow() {
  uni.navigateTo({ url: `/subpkg-trade/payment/index?orderCode=${orderCode.value}` });
}

async function onConfirmReceive() {
  uni.showModal({
    title: t('order.confirmReceiveTitle'),
    content: t('order.confirmReceiveContent'),
    success: async (res) => {
      if (res.confirm) {
        try {
          await sendRequest(orderApi.markAsReceived(orderCode.value));
          uni.showToast({ title: t('order.confirmReceiveSuccess'), icon: 'success' });
          await runOrderDetail({ orderCode: orderCode.value });
        } catch {
          uni.showToast({ title: t('order.actionFailed'), icon: 'none' });
        }
      }
    },
  });
}

function onViewLogistics() {
  uni.navigateTo({ url: `/subpkg-trade/logistics/index?orderCode=${orderCode.value}` });
}

// function onCancelOrder() {
//   uni.showModal({
//     title: t('order.cancelTitle'),
//     content: t('order.cancelContent'),
//     success: (res) => {
//       if (res.confirm) {
//         uni.showToast({ title: t('order.cancelUnavailable'), icon: 'none' });
//       }
//     },
//   });
// }

const { addOrderItemsToCart, goToCart } = useCart();
const buyingAgain = ref(false);

async function onBuyAgain() {
  const o = order.value;
  if (!o?.items?.length) {
    uni.showToast({ title: t('order.emptyItemsToast'), icon: 'none' });
    return;
  }
  const items = o.items.filter((i) => i.productVariantId != null && (i.quantity ?? 0) > 0);
  if (!items.length) {
    uni.showToast({ title: t('order.emptyItemsToast'), icon: 'none' });
    return;
  }
  buyingAgain.value = true;
  try {
    const ok = await addOrderItemsToCart(
      items.map((i) => ({
        productVariantId: i.productVariantId!,
        quantity: i.quantity ?? 1,
      })),
    );
    if (ok) {
      uni.showToast({ title: t('order.addedToCart'), icon: 'success', duration: 1500 });
      goToCart();
    } else {
      uni.showModal({
        title: '',
        content: t('order.soldOutFallback'),
        showCancel: false,
        confirmText: t('common.confirm'),
        confirmColor: '#ee2b2b',
      });
    }
  } finally {
    buyingAgain.value = false;
  }
}

function onCopyOrderCode() {
  uni.setClipboardData({
    data: orderCode.value,
    success: () => uni.showToast({ title: t('order.copied'), icon: 'success' }),
  });
}
</script>

<template>
  <view v-if="loading" class="flex items-center justify-center min-h-screen bg-bg-page">
    <text class="text-xs text-slate-400">{{ $t('common.loading') }}</text>
  </view>

  <view
    v-else-if="order"
    class="flex flex-col bg-bg-page min-h-screen"
    style="padding-bottom: calc(120rpx + env(safe-area-inset-bottom))"
  >
    <view class="mx-3 mt-3 rounded-2 overflow-hidden relative h-32" :class="statusInfo.heroBgClass">
      <view
        class="absolute inset-0"
        style="background: linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.1) 100%)"
      />
      <view class="absolute right-6 top-8.5 opacity-20">
        <TIcon
          v-if="order.fulfillmentStatus === 'PROCESSING' || order.fulfillmentStatus === 'FULFILLED'"
          name="secured"
          v-bind="{ size: '160rpx', color: '#ffffff' }"
        />
        <TIcon
          v-else-if="order.paymentStatus === 'PENDING'"
          name="wallet"
          v-bind="{ size: '160rpx', color: '#ffffff' }"
        />
        <TIcon v-else name="secured" v-bind="{ size: '160rpx', color: '#ffffff' }" />
      </view>
      <view class="absolute left-6 top-6 flex flex-col gap-1">
        <text class="text-white font-bold text-2xl">
          {{ statusInfo.label }}
        </text>
        <text v-if="statusInfo.subtitle" class="text-sm text-white/80">
          {{ statusInfo.subtitle }}
        </text>
      </view>
    </view>

    <view
      v-if="latestLogistics"
      class="mx-3 mt-3 bg-white rounded-2 p-4 shadow-card border border-solid border-brand/5"
    >
      <view
        class="flex gap-4 items-start pb-4"
        style="border-bottom: 1rpx solid rgba(238, 43, 43, 0.06)"
      >
        <view class="shrink-0 flex items-center justify-center rounded-1.5 w-10 h-10 bg-brand/10">
          <TIcon name="secured" v-bind="{ size: '32rpx', color: ICON_COLOR.brand }" />
        </view>
        <view class="flex-1 min-w-0 flex flex-col gap-1">
          <text class="text-sm text-slate-950 font-medium leading-snug">
            {{
              $t('order.shippingProgress', {
                carrier: latestLogistics.carrier,
                trackingNumber: latestLogistics.trackingNumber,
              })
            }}
          </text>
          <text class="text-xs text-slate-500">{{ formatDate(order.updatedAt) }}</text>
        </view>
        <TIcon name="chevron-right" v-bind="{ size: '24rpx', color: ICON_COLOR.muted }" />
      </view>

      <view v-if="shippingAddr" class="flex gap-4 items-start pt-4">
        <view class="shrink-0 flex items-center justify-center rounded-1.5 w-10 h-10 bg-brand/10">
          <TIcon name="location" v-bind="{ size: '32rpx', color: ICON_COLOR.brand }" />
        </view>
        <view class="flex-1 min-w-0 flex flex-col gap-0.5">
          <view class="flex items-center gap-2">
            <text class="text-sm text-slate-950 font-medium">{{ shippingAddr.name }}</text>
            <text class="text-sm text-slate-950 font-medium">{{ shippingAddr.phone }}</text>
          </view>
          <text class="text-xs text-slate-500 leading-tight">
            {{ shippingAddr.fullAddr }}
          </text>
        </view>
      </view>
    </view>

    <view
      v-else-if="shippingAddr"
      class="mx-3 mt-3 bg-white rounded-2 p-4 shadow-card border border-solid border-brand/5"
    >
      <view class="flex gap-4 items-start">
        <view class="shrink-0 flex items-center justify-center rounded-1.5 w-10 h-10 bg-brand/10">
          <TIcon name="location" v-bind="{ size: '32rpx', color: ICON_COLOR.brand }" />
        </view>
        <view class="flex-1 min-w-0 flex flex-col gap-0.5">
          <view class="flex items-center gap-2">
            <text class="text-sm text-slate-950 font-medium">{{ shippingAddr.name }}</text>
            <text class="text-sm text-slate-950 font-medium">{{ shippingAddr.phone }}</text>
          </view>
          <text class="text-xs text-slate-500 leading-tight">
            {{ shippingAddr.fullAddr }}
          </text>
        </view>
      </view>
    </view>

    <view
      class="mx-3 mt-3 bg-white rounded-2 overflow-hidden shadow-card border border-solid border-brand/5"
    >
      <view class="flex flex-col gap-4 p-4">
        <view
          v-for="item in order.items"
          :key="item.productVariantId"
          class="flex gap-4 items-start"
        >
          <view
            class="shrink-0 rounded-1.5 overflow-hidden bg-slate-100 w-20 h-20"
            style="border: 1rpx solid rgba(238, 43, 43, 0.06)"
          >
            <image
              v-if="item.itemImageUrl"
              :src="formatImageUrlWithThumbnail(item.itemImageUrl, 'S')"
              mode="aspectFill"
              class="w-20 h-20"
            />
            <view v-else class="flex items-center justify-center w-full h-full">
              <TIcon name="image" v-bind="{ size: '48rpx', color: ICON_COLOR.subtle }" />
            </view>
          </view>

          <view class="flex-1 min-w-0 flex flex-col justify-between min-h-20 py-0.5">
            <view class="flex flex-col gap-1">
              <text class="text-sm text-slate-950 font-medium leading-tight line-clamp-2">
                {{ item.itemTitle }}
              </text>
              <text v-if="getItemSpecText(item)" class="text-xs text-slate-500">
                {{ getItemSpecText(item) }}
              </text>
            </view>
            <view class="flex items-end justify-between">
              <text class="text-base text-brand font-bold">
                {{ formatCurrency(item.unitPrice) }}
              </text>
              <text class="text-xs text-slate-400">x {{ item.quantity }}</text>
            </view>
          </view>
        </view>
      </view>

      <view
        class="flex flex-col gap-3 px-4 pt-4 pb-4"
        style="border-top: 1rpx solid rgba(238, 43, 43, 0.06)"
      >
        <view class="flex items-center justify-between">
          <text class="text-sm text-slate-500">{{ $t('order.productTotal') }}</text>
          <text class="text-sm text-slate-950">{{ formatCurrency(subtotal) }}</text>
        </view>
        <view class="flex items-center justify-between">
          <text class="text-sm text-slate-500">{{ $t('order.freight') }}</text>
          <text class="text-sm text-slate-950">
            {{ shippingFee > 0 ? formatCurrency(shippingFee) : $t('checkout.freeShipping') }}
          </text>
        </view>
        <view class="flex items-center justify-between pt-1">
          <text class="text-sm text-slate-950">{{ $t('order.total') }}</text>
          <text class="text-xl text-brand font-bold">{{ formatCurrency(order.totalAmount) }}</text>
        </view>
      </view>
    </view>

    <view class="mx-3 mt-3 bg-white rounded-2 p-4 shadow-card border border-solid border-brand/5">
      <view class="flex items-center gap-2 mb-4">
        <view class="rounded-full bg-brand w-1 h-4" />
        <text class="text-sm text-slate-950 font-medium">{{ $t('order.infoTitle') }}</text>
      </view>

      <view class="flex flex-col gap-3">
        <view class="flex items-center">
          <text class="text-xs text-slate-500 shrink-0" style="width: 160rpx">{{
            $t('order.code')
          }}</text>
          <text class="text-xs text-slate-950 flex-1 min-w-0" style="word-break: break-all">
            {{ order.orderCode }}
          </text>
          <view
            class="shrink-0 flex items-center justify-center px-2 py-0.5 rounded-1.5 ml-2 bg-brand/10"
            @tap="onCopyOrderCode"
          >
            <text class="text-xs text-brand">{{ $t('common.copy') }}</text>
          </view>
        </view>

        <view class="flex items-center">
          <text class="text-xs text-slate-500 shrink-0 w-20">{{ $t('order.createdAt') }}</text>
          <text class="text-xs text-slate-950 flex-1">{{ formatDate(order.createdAt) }}</text>
        </view>

        <view v-if="order.paidAt" class="flex items-center">
          <text class="text-xs text-slate-500 shrink-0 w-20">{{ $t('order.paidAt') }}</text>
          <text class="text-xs text-slate-950 flex-1">{{ formatDate(order.paidAt) }}</text>
        </view>

        <view v-if="order.customerNotes" class="flex items-start">
          <text class="text-xs text-slate-500 shrink-0 w-20">{{ $t('order.customerNotes') }}</text>
          <text class="text-xs text-slate-950 flex-1 leading-relaxed">
            {{ order.customerNotes }}
          </text>
        </view>
      </view>
    </view>
  </view>

  <view
    v-else-if="loadError"
    class="flex flex-col items-center justify-center min-h-screen bg-bg-page"
  >
    <AppLoadError @retry="retryLoadData" />
  </view>

  <view v-else class="flex flex-col items-center justify-center min-h-screen bg-bg-page">
    <text class="text-sm text-slate-400">{{ $t('order.notFound') }}</text>
  </view>

  <view
    v-if="order"
    class="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-end gap-3 px-4 pt-4 bg-white/90 border-t border-t-solid border-t-brand/10 shadow-up backdrop-blur-md pb-safe-sm"
  >
    <!-- TODO: cancel order action -->
    <!-- <view
      v-if="showCancelOrder"
      class="px-4 py-2.5 rounded-1.5 border border-solid border-slate-200"
      @tap="onCancelOrder"
    >
      <text class="text-sm text-slate-500 font-medium">{{ $t('order.cancel') }}</text>
    </view> -->

    <view
      v-if="showPayNow"
      class="px-6 py-2.5 rounded-1.5 bg-brand shadow-brand-btn"
      @tap="onPayNow"
    >
      <text class="text-sm text-white font-medium">{{ $t('order.payNow') }}</text>
    </view>

    <view
      v-if="showViewLogistics"
      class="px-5 py-2.5 rounded-1.5 border border-solid border-brand"
      @tap="onViewLogistics"
    >
      <text class="text-sm text-brand font-medium">{{ $t('order.viewLogistics') }}</text>
    </view>

    <view
      v-if="showConfirmReceive"
      class="px-6 py-2.5 rounded-1.5 bg-brand shadow-brand-btn"
      @tap="onConfirmReceive"
    >
      <text class="text-sm text-white font-medium">{{ $t('order.confirmReceive') }}</text>
    </view>

    <view
      v-if="showBuyAgain"
      class="px-5 py-2.5 rounded-1.5 border border-solid border-slate-200"
      :class="{ 'opacity-60': buyingAgain }"
      @tap="!buyingAgain && onBuyAgain()"
    >
      <text class="text-sm text-slate-950 font-medium">
        {{ buyingAgain ? $t('order.buyingAgain') : $t('order.buyAgain') }}
      </text>
    </view>
  </view>
</template>
