<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onReachBottom } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import AppEmpty from '@/components/common/AppEmpty.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import { orderApi } from '@/api/modules/order';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { ICON_COLOR } from '@/helpers/icon';
import { useCart } from '@/hooks/useCart';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { usePagePullRefresh } from '@/hooks/usePullRefresh';
import { sendRequest, useInfiniteQuery } from '@/hooks/useRequest';
import { formatCurrency } from '@/utils/format';
import { getPageResponseHasMore } from '@/utils/page';
import {
  getOrderStatusInfo,
  canPayNow,
  canViewLogistics,
  canConfirmReceive,
  canBuyAgain,
  getSpecText,
  getDisplayItems,
  requiresShipping,
} from '@/helpers/order';
import type { OrderResponse, OrderItemResponse } from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';

const TAB_LIST = [
  {
    labelKey: 'order.tab.all',
    paymentStatuses: undefined,
    fulfillmentStatuses: undefined,
    statuses: undefined,
  },
  {
    labelKey: 'order.tab.pendingPayment',
    paymentStatuses: ['PENDING'],
    fulfillmentStatuses: undefined,
    statuses: ['OPEN'],
  },
  {
    labelKey: 'order.tab.pendingShipment',
    paymentStatuses: ['PAID'],
    fulfillmentStatuses: ['PENDING'],
    statuses: ['OPEN'],
  },
  {
    labelKey: 'order.tab.pendingReceipt',
    paymentStatuses: ['PAID'],
    fulfillmentStatuses: ['PROCESSING', 'FULFILLED'],
    statuses: ['OPEN'],
  },
  {
    labelKey: 'order.tab.completed',
    paymentStatuses: undefined,
    fulfillmentStatuses: undefined,
    statuses: ['ARCHIVED'],
  },
] as const;

const activeTab = ref(0);
const PAGE_SIZE = 10;
const { t } = useI18n();

interface OrderListParams {
  paymentStatuses?: string[];
  fulfillmentStatuses?: string[];
  statuses?: string[];
}

function buildOrderParams(tabIndex: number): OrderListParams {
  const tab = TAB_LIST[tabIndex];
  return {
    paymentStatuses: tab.paymentStatuses ? [...tab.paymentStatuses] : undefined,
    fulfillmentStatuses: tab.fulfillmentStatuses ? [...tab.fulfillmentStatuses] : undefined,
    statuses: tab.statuses ? [...tab.statuses] : undefined,
  };
}

const {
  list: orders,
  hasMore,
  loading,
  loadingMore,
  error: loadErrorRaw,
  run: runOrders,
  loadMore: loadMoreOrders,
} = useInfiniteQuery<{ content?: OrderResponse[]; last?: boolean }, OrderResponse, OrderListParams>(
  (page: number, size: number, params: OrderListParams) =>
    orderApi.getOrders({
      page,
      size,
      paymentStatuses: params.paymentStatuses,
      fulfillmentStatuses: params.fulfillmentStatuses,
      statuses: params.statuses,
    }),
  {
    immediate: false,
    pageSize: PAGE_SIZE,
    getItems: (res) => res.content ?? [],
    getHasMore: (res) => getPageResponseHasMore(res, PAGE_SIZE),
  },
);
const {
  isInitialLoading: isInitialOrdersLoading,
  showInitialLoading: showInitialOrdersLoading,
  markLoaded: markOrdersLoaded,
} = useInitialLoading(loading, { delay: 120, minDuration: 180 });
const isLastPage = computed(() => !hasMore.value);
const loadError = computed(() => !!loadErrorRaw.value && orders.value.length === 0);
const visibleOrders = computed(() => {
  return orders.value.filter((order) => {
    if ((activeTab.value === 2 || activeTab.value === 3) && !requiresShipping(order)) {
      return false;
    }
    return true;
  });
});

async function refreshOrders() {
  try {
    await runOrders(buildOrderParams(activeTab.value));
  } finally {
    markOrdersLoaded();
  }
}

onLoad((options) => {
  // Support jumping to a specific tab via the tab param (0=all, 1=to pay, 2=to ship, 3=to receive, 4=completed)
  if (options?.tab !== undefined) {
    const idx = Number(options.tab);
    if (idx >= 0 && idx < TAB_LIST.length) {
      activeTab.value = idx;
    }
  }
  if (!guardCurrentPageAccess()) {
    return;
  }
  void refreshOrders();
});

onReachBottom(() => {
  loadMoreOrders();
});

function onTabChange(idx: number) {
  activeTab.value = idx;
  void refreshOrders();
}

function retryOrders() {
  void refreshOrders();
}

function getItemSpecText(item: OrderItemResponse): string {
  return getSpecText(item.productVariantSnapshot?.specValues, 'value-only');
}

function onGoDetail(order: OrderResponse) {
  uni.navigateTo({ url: `/subpkg-trade/order-detail/index?orderCode=${order.orderCode}` });
}

// function onCancelOrder(_order: OrderResponse) {
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

function onPayNow(order: OrderResponse) {
  uni.navigateTo({ url: `/subpkg-trade/payment/index?orderCode=${order.orderCode}` });
}

async function onConfirmReceive(order: OrderResponse) {
  uni.showModal({
    title: t('order.confirmReceiveTitle'),
    content: t('order.confirmReceiveContent'),
    success: async (res) => {
      if (res.confirm) {
        try {
          await sendRequest(orderApi.markAsReceived(order.orderCode!));
          uni.showToast({ title: t('order.confirmReceiveSuccess'), icon: 'success' });
          await refreshOrders();
        } catch {
          uni.showToast({ title: t('order.actionFailed'), icon: 'none' });
        }
      }
    },
  });
}

function onViewLogistics(order: OrderResponse) {
  uni.navigateTo({ url: `/subpkg-trade/logistics/index?orderCode=${order.orderCode}` });
}

const { addOrderItemsToCart, goToCart } = useCart();
const buyingAgain = ref(false);

async function onBuyAgain(order: OrderResponse) {
  const items = order.items?.filter((i) => i.productVariantId != null && (i.quantity ?? 0) > 0);
  if (!items?.length) {
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

// const showCancel = canCancelOrder;
const showPayNow = canPayNow;
const showViewLogistics = canViewLogistics;
const showConfirmReceive = canConfirmReceive;
const showBuyAgain = canBuyAgain;

usePagePullRefresh(async () => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  await refreshOrders();
});

function goShopping() {
  uni.switchTab({ url: '/pages/home/index' });
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="bg-white sticky top-0 z-10 border-b border-b-solid border-b-slate-100">
      <view class="flex items-stretch overflow-x-auto px-2 h-12.5">
        <view
          v-for="(tab, idx) in TAB_LIST"
          :key="tab.labelKey"
          class="flex flex-col items-center justify-center px-4 shrink-0 relative"
          @tap="onTabChange(idx)"
        >
          <text
            class="text-sm font-medium"
            :class="activeTab === idx ? 'text-brand' : 'text-slate-500'"
          >
            {{ $t(tab.labelKey) }}
          </text>
          <!-- Active underline -->
          <view
            v-if="activeTab === idx"
            class="absolute bottom-0 left-1/2 bg-brand rounded-full w-5 h-0.5 -translate-x-1/2"
          />
        </view>
      </view>
    </view>

    <view v-if="showInitialOrdersLoading" class="flex flex-col gap-3 px-3 py-3">
      <view v-for="i in 3" :key="i" class="bg-white rounded-2 overflow-hidden shadow-card">
        <view class="px-4 py-3 flex items-center justify-between">
          <view class="h-5 w-16 rounded-full skeleton-shimmer" />
          <view class="h-4 w-24 rounded-full skeleton-shimmer" />
        </view>
        <view class="px-4 pb-3 flex gap-3 items-start">
          <view class="w-20 h-20 shrink-0 rounded-1 skeleton-shimmer" />
          <view class="flex-1 flex flex-col gap-2.5 pt-1">
            <view class="h-3.5 rounded-full skeleton-shimmer w-full" />
            <view class="h-3 rounded-full skeleton-shimmer w-3/5" />
            <view class="h-4 rounded-full skeleton-shimmer w-1/4 mt-2" />
          </view>
        </view>
        <view class="px-4 py-3 border-t border-slate-50 flex justify-end">
          <view class="h-7 w-20 rounded-full skeleton-shimmer" />
        </view>
      </view>
    </view>

    <view v-else-if="isInitialOrdersLoading" class="flex-1" />

    <AppLoadError v-else-if="loadError" @retry="retryOrders" />

    <AppEmpty
      v-else-if="visibleOrders.length === 0"
      :text="
        activeTab === 0
          ? $t('order.emptyAll')
          : $t('order.emptyByTab', { label: $t(TAB_LIST[activeTab].labelKey) })
      "
      :subtext="$t('order.emptySubtitle')"
      :cta-text="$t('order.goShopping')"
      @cta="goShopping"
    />

    <view v-else class="flex flex-col gap-3 px-3 py-3 pb-7.5">
      <view
        v-for="order in visibleOrders"
        :key="order.orderCode"
        class="bg-white rounded-2 overflow-hidden shadow-card"
        @tap="onGoDetail(order)"
      >
        <view class="flex items-center justify-between px-4 py-3">
          <view
            class="flex items-center px-2 py-0.5 rounded-full"
            :class="getOrderStatusInfo(order).bgClass"
          >
            <text class="text-xs font-semibold" :class="getOrderStatusInfo(order).textClass">
              {{ getOrderStatusInfo(order).label }}
            </text>
          </view>
          <text class="text-xs text-slate-400 flex-shrink-0">
            {{ order.orderCode }}
          </text>
        </view>

        <view class="flex flex-col gap-3 px-4 pb-3">
          <view
            v-for="item in getDisplayItems(order)"
            :key="item.productVariantId"
            class="flex gap-3 items-start"
          >
            <view class="w-20 h-20 shrink-0 rounded-1 overflow-hidden bg-slate-100">
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

            <view class="min-h-20 py-0.5 flex flex-col justify-between flex-1 min-w-0">
              <view class="flex flex-col gap-1">
                <text class="text-sm text-slate-950 font-medium leading-snug line-clamp-2">
                  {{ item.itemTitle }}
                </text>
                <text v-if="getItemSpecText(item)" class="text-xs text-slate-400">
                  {{ getItemSpecText(item) }}
                </text>
              </view>
              <view class="flex items-end justify-between">
                <text class="text-sm text-slate-950 font-bold">
                  {{ formatCurrency(item.unitPrice) }}
                </text>
                <text class="text-xs text-slate-400">x{{ item.quantity }}</text>
              </view>
            </view>
          </view>

          <view v-if="(order.items?.length ?? 0) > 3" class="flex items-center justify-center py-1">
            <text class="text-xs text-slate-400">
              {{ $t('order.itemCount', { count: order.items?.length ?? 0 }) }}
            </text>
          </view>
        </view>

        <view
          class="flex items-center justify-between gap-2 px-4 py-3 border-t border-t-solid border-t-slate-50"
          @tap.stop
        >
          <text class="text-xs text-slate-500 mr-1">
            {{ $t('order.total') }}
            <text class="text-sm text-slate-950 font-bold">
              {{ formatCurrency(order.totalAmount) }}
            </text>
          </text>

          <view class="flex items-center gap-2">
            <!-- TODO: cancel order action -->
            <!-- <view
              v-if="showCancel(order)"
              class="flex items-center py-2 px-3.5 py-1.5 rounded-full border border-solid border-slate-200"
              @tap.stop="onCancelOrder(order)"
            >
              <text class="text-xs text-slate-950">{{ $t('order.cancel') }}</text>
            </view> -->

            <view
              v-if="showPayNow(order)"
              class="flex items-center py-2 px-4 rounded-full bg-brand shadow-brand-btn"
              @tap.stop="onPayNow(order)"
            >
              <text class="text-xs text-white font-medium">{{ $t('order.payNow') }}</text>
            </view>

            <view
              v-if="showViewLogistics(order)"
              class="flex items-center py-2 px-3.5 rounded-full border border-solid border-slate-200"
              @tap.stop="onViewLogistics(order)"
            >
              <text class="text-xs text-slate-950">{{ $t('order.viewLogistics') }}</text>
            </view>

            <view
              v-if="showConfirmReceive(order)"
              class="flex items-center px-3.5 py-2 rounded-full border border-solid border-brand"
              @tap.stop="onConfirmReceive(order)"
            >
              <text class="text-xs text-brand">{{ $t('order.confirmReceive') }}</text>
            </view>

            <view
              v-if="showBuyAgain(order)"
              class="flex items-center py-2 px-3.5 rounded-full border border-solid border-slate-200"
              :class="{ 'opacity-60': buyingAgain }"
              @tap.stop="!buyingAgain && onBuyAgain(order)"
            >
              <text class="text-xs text-slate-950"> {{ $t('order.buyAgain') }} </text>
            </view>
          </view>
        </view>
      </view>

      <view class="flex items-center justify-center py-8 gap-2">
        <template v-if="loadingMore">
          <view
            v-for="i in 3"
            :key="i"
            class="w-1.5 h-1.5 rounded-full bg-slate-300"
            :style="`animation: dot-pulse 1.2s ease-in-out ${(i - 1) * 0.2}s infinite`"
          />
        </template>
        <template v-else-if="isLastPage && visibleOrders.length > 0">
          <view class="flex-1 h-[1rpx] bg-slate-100 max-w-16" />
          <text class="text-2.5 text-slate-300 tracking-0.5">{{ $t('order.bottomReached') }}</text>
          <view class="flex-1 h-[1rpx] bg-slate-100 max-w-16" />
        </template>
      </view>
    </view>
  </view>
</template>

<style scoped>
.skeleton-shimmer {
  background: linear-gradient(90deg, #f1f5f9 25%, #e8edf3 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.6s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
