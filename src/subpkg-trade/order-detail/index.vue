<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import VirtualFulfillmentSection from '@/components/business/VirtualFulfillmentSection.vue';
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
import type {
  OrderResponse,
  OrderItemResponse,
  FulfillmentUcResponse,
  CustomerDigitalResourceUcResponse,
} from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import { openPurchasedDigitalResource } from '@/helpers/digital-resource';

const orderCode = ref('');
const { t } = useI18n();
const {
  data: orderData,
  loading,
  error: loadErrorRaw,
  run: runOrderDetail,
} = useAsyncQuery<OrderResponse, { orderCode: string }>(
  (params) => sendRequest(orderApi.getOrder(params.orderCode)),
  { immediate: false },
);
const {
  data: fulfillmentData,
  loading: fulfillmentsLoading,
  error: fulfillmentErrorRaw,
  run: runFulfillments,
} = useAsyncQuery<FulfillmentUcResponse[], { orderCode: string }>(
  (params) => sendRequest(orderApi.getOrderFulfillments(params.orderCode)),
  { immediate: false },
);
const order = computed(() => orderData.value);
const fulfillments = computed(() => fulfillmentData.value ?? []);
const loadError = computed(() => !!loadErrorRaw.value);
const fulfillmentError = computed(() => !!fulfillmentErrorRaw.value);

async function loadOrderData() {
  if (!orderCode.value) {
    return;
  }
  await Promise.allSettled([
    runOrderDetail({ orderCode: orderCode.value }),
    runFulfillments({ orderCode: orderCode.value }),
  ]);
}

onLoad((options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (options?.orderCode) {
    orderCode.value = options.orderCode;
  }
});

onShow(() => {
  if (orderCode.value) {
    void loadOrderData();
  }
});

onPullDownRefresh(async () => {
  try {
    await loadOrderData();
  } finally {
    uni.stopPullDownRefresh();
  }
});

function retryLoadData() {
  void loadOrderData().catch(() => {});
}

function retryFulfillments() {
  if (orderCode.value) {
    void loadOrderData();
  }
}

const statusInfo = computed(() => {
  const orderRaw = order.value;
  if (!orderRaw) {
    return { label: '', subtitle: '', textClass: '', bgClass: '', heroBgClass: 'bg-brand' };
  }
  const baseStatus = getOrderStatusInfo(orderRaw);
  if (
    orderRaw.paymentStatus !== 'PAID' ||
    orderRaw.status !== 'OPEN' ||
    (orderRaw.refundStatus && orderRaw.refundStatus !== 'NONE') ||
    requiresShipping(orderRaw)
  ) {
    return baseStatus;
  }

  const virtualFulfillments = fulfillments.value.filter((item) => item.type === 'VIRTUAL');
  if (!virtualFulfillments.length) {
    return baseStatus;
  }

  const completed = virtualFulfillments.filter((item) => item.status === 'COMPLETED').length;
  if (completed === virtualFulfillments.length) {
    return {
      ...baseStatus,
      label: t('order.virtual.hero.completed'),
      subtitle: t('order.virtual.hero.completedSubtitle'),
    };
  }
  if (completed > 0) {
    return {
      ...baseStatus,
      label: t('order.virtual.hero.partial'),
      subtitle: t('order.virtual.hero.partialSubtitle'),
    };
  }
  if (
    virtualFulfillments.some(
      (item) =>
        item.status === 'PENDING' || item.status === 'PROCESSING' || item.status === 'READY',
    )
  ) {
    return {
      ...baseStatus,
      label: t('order.virtual.hero.processing'),
      subtitle: t('order.virtual.hero.processingSubtitle'),
    };
  }
  return {
    ...baseStatus,
    label: t('order.virtual.hero.failed'),
    subtitle: t('order.virtual.hero.failedSubtitle'),
  };
});

const orderRequiresShipping = computed(() => !!order.value && requiresShipping(order.value));
const showVirtualFulfillment = computed(
  () =>
    !!order.value?.items?.some((item) => item.productVariantSnapshot?.shippingRequired === false) ||
    fulfillments.value.some((fulfillment) => fulfillment.type === 'VIRTUAL'),
);

const shippingPackages = computed(() => {
  if (!orderRequiresShipping.value) {
    return [];
  }
  return fulfillments.value
    .filter((fulfillment) => fulfillment.type === 'SHIPPING')
    .flatMap((fulfillment) => fulfillment.labels ?? [])
    .filter((label) => !!label.carrier || !!label.trackingNumber)
    .map((label) => ({
      carrier: label.carrier ?? t('order.status.express'),
      trackingNumber: label.trackingNumber ?? '',
    }));
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
          await loadOrderData();
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

function onCopyDeliveryContent(value: string) {
  uni.setClipboardData({
    data: value,
    success: () => uni.showToast({ title: t('order.copied'), icon: 'success' }),
  });
}

const openingResource = ref(false);

async function onOpenDigitalResource(resource: CustomerDigitalResourceUcResponse) {
  if (import.meta.env.VITE_MOCK_ENABLED === 'true' && resource.resourceType !== 'STATIC_URL') {
    uni.showToast({ title: t('order.virtual.mockDownloadUnavailable'), icon: 'none' });
    return;
  }
  if (openingResource.value) {
    return;
  }
  openingResource.value = true;
  try {
    await openPurchasedDigitalResource(resource);
  } catch {
    uni.showToast({ title: t('order.virtual.downloadFailed'), icon: 'none' });
  } finally {
    openingResource.value = false;
  }
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
      v-if="shippingPackages.length"
      class="mx-3 mt-3 bg-white rounded-2 p-4 shadow-card border border-solid border-brand/5"
    >
      <view class="flex flex-col gap-3" :class="shippingAddr ? 'pb-4' : ''">
        <view
          v-for="(shippingPackage, index) in shippingPackages"
          :key="index"
          class="flex gap-4 items-start"
        >
          <view class="shrink-0 flex items-center justify-center rounded-1.5 w-10 h-10 bg-brand/10">
            <TIcon name="secured" v-bind="{ size: '32rpx', color: ICON_COLOR.brand }" />
          </view>
          <view class="flex-1 min-w-0 flex flex-col gap-1">
            <text class="text-xs text-slate-500">
              {{ $t('order.shippingPackageNumber', { number: index + 1 }) }}
            </text>
            <text class="text-sm text-slate-950 font-medium leading-snug break-all">
              {{ shippingPackage.carrier }}：{{ shippingPackage.trackingNumber }}
            </text>
          </view>
        </view>
      </view>

      <view
        v-if="shippingAddr"
        class="flex gap-4 items-start pt-4"
        style="border-top: 1rpx solid rgba(238, 43, 43, 0.06)"
      >
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

    <VirtualFulfillmentSection
      v-if="showVirtualFulfillment"
      :paid="order.paymentStatus === 'PAID'"
      :fulfillments="fulfillments"
      :loading="fulfillmentsLoading"
      :error="fulfillmentError"
      @retry="retryFulfillments"
      @copy="onCopyDeliveryContent"
      @download="onOpenDigitalResource"
    />

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
