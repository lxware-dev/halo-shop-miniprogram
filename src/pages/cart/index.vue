<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import AppLoading from '@/components/common/AppLoading.vue';
import AppEmpty from '@/components/common/AppEmpty.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import LoginPanel from '@/components/business/LoginPanel.vue';
import { cartApi } from '@/api/modules/cart';
import { productApi } from '@/api/modules/product';
import { useAppConfig } from '@/config';
import { getSpecText } from '@/helpers/order';
import {
  clampQuantity,
  getCartQuantityLimit,
  getQuantityLimit,
  isQuantityAllowed,
} from '@/helpers/quantity';
import type {
  CartItemResponse,
  ProductResponse,
  SpecDefinitionPayload,
} from '@halo-dev/api-client';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import AppTabBar from '@/components/common/AppTabBar.vue';
import { ICON_COLOR } from '@/helpers/icon';
import { useTabBar } from '@/composables/useTabBar';
import SkuSelector from '@/components/business/SkuSelector.vue';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { sendRequest, useQuery } from '@/hooks/useRequest';
import { usePagePullRefresh } from '@/hooks/usePullRefresh';
import { useCartStore, useUserStore } from '@/store';

const { totalHeight } = useTabBar();
const { maxCartItems, currencySymbol } = useAppConfig().business;
const cartStore = useCartStore();
const userStore = useUserStore();
const { t } = useI18n();
const showLoginPanel = computed(() => !userStore.isLoggedIn);

const listPaddingBottom = computed(() => {
  if (showLoginPanel.value) {
    return '0px';
  }
  return `${totalHeight + 64}px`;
});

const cartItems = ref<CartItemResponse[]>([]);
const { loading, run: runCartQuery } = useQuery<CartItemResponse[], Record<string, never>>(
  () => cartApi.getCartItems(),
  { immediate: false },
);
const {
  isInitialLoading,
  showInitialLoading,
  markLoaded: markCartLoaded,
  reset: resetCartLoaded,
} = useInitialLoading(loading, { delay: 120, minDuration: 180 });
const isEditing = ref(false);
const updatingIds = ref(new Set<number>());
const skuSubmitting = ref(false);
const cartRefreshRequired = ref(false);
let cartRequestVersion = 0;
const cartQuantityMaximum = Math.min(maxCartItems, 999);

function itemQuantityLimit(item: CartItemResponse) {
  return getCartQuantityLimit(item, cartQuantityMaximum);
}

function showQuantityLimit(maximum: number) {
  uni.showToast({
    title: maximum < 1 ? t('sku.unavailable') : t('sku.quantityLimit', { max: maximum }),
    icon: 'none',
  });
}

const selectedIds = ref<Set<number>>(new Set());

const swipedId = ref<number | null>(null);
const swipedIds = ref<Set<number>>(new Set());

const touchStartX = ref(0);
const touchStartY = ref(0);
let directionLocked: 'h' | 'v' | null = null;
let activeTouchId: number | null = null;

function onTouchStart(e: TouchEvent, id: number) {
  touchStartX.value = e.touches[0].clientX;
  touchStartY.value = e.touches[0].clientY;
  directionLocked = null;
  activeTouchId = id;
}

function onTouchMove(e: TouchEvent, id: number) {
  if (activeTouchId !== id) {
    return;
  }
  const dx = e.touches[0].clientX - touchStartX.value;
  const dy = e.touches[0].clientY - touchStartY.value;
  if (!directionLocked) {
    directionLocked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
  }
}

function onTouchEnd(e: TouchEvent, id: number) {
  if (activeTouchId !== id) {
    return;
  }
  activeTouchId = null;
  if (directionLocked !== 'h') {
    return;
  }

  const dx = e.changedTouches[0].clientX - touchStartX.value;
  if (dx < -20) {
    swipedIds.value.add(id);
  } else if (dx > 20) {
    swipedIds.value.delete(id);
  }
}

function closeSwipe(id: number) {
  swipedIds.value.delete(id);
  if (swipedId.value === id) {
    swipedId.value = null;
  }
}

const isAllSelected = computed(
  () => cartItems.value.length > 0 && selectedIds.value.size === cartItems.value.length,
);

const selectedItems = computed(() =>
  cartItems.value.filter((item) => selectedIds.value.has(item.id!)),
);

const totalPrice = computed(() =>
  selectedItems.value.reduce(
    (sum, item) => sum + (item.productVariant?.price ?? 0) * (item.quantity ?? 1),
    0,
  ),
);

const selectedCount = computed(() => selectedItems.value.length);

function syncCartStore(items: CartItemResponse[]) {
  cartStore.syncFromServer(items);
}

function resetCartView() {
  cartRequestVersion++;
  cartRefreshRequired.value = false;
  cartItems.value = [];
  cartStore.clearAll();
  selectedIds.value = new Set();
  isEditing.value = false;
  swipedId.value = null;
  swipedIds.value.clear();
  resetCartLoaded();
}

async function loadCart() {
  const version = ++cartRequestVersion;
  try {
    const data = await runCartQuery({});
    if (version !== cartRequestVersion) {
      return false;
    }
    if (!Array.isArray(data)) {
      throw new TypeError('Missing cart list response');
    }
    cartItems.value = data;
    selectedIds.value = new Set(cartItems.value.map((i) => i.id!));
    syncCartStore(cartItems.value);
    cartRefreshRequired.value = false;
    return true;
  } catch {
    return false;
  } finally {
    if (version === cartRequestVersion) {
      markCartLoaded();
    }
  }
}

onShow(() => {
  if (showLoginPanel.value) {
    resetCartView();
    return;
  }
  loadCart();
});

watch(
  () => userStore.isLoggedIn,
  (isLoggedIn) => {
    if (!isLoggedIn) {
      resetCartView();
    }
  },
);

function handleLoginSuccess() {
  void loadCart();
}

usePagePullRefresh(async () => {
  if (showLoginPanel.value) {
    return;
  }
  await loadCart();
});

function toggleSelectAll() {
  selectedIds.value = isAllSelected.value ? new Set() : new Set(cartItems.value.map((i) => i.id!));
}

function toggleSelect(id: number) {
  selectedIds.value.has(id) ? selectedIds.value.delete(id) : selectedIds.value.add(id);
}

async function changeQuantity(item: CartItemResponse, delta: number) {
  if (
    item.id == null ||
    updatingIds.value.has(item.id) ||
    skuSubmitting.value ||
    cartRefreshRequired.value
  ) {
    return;
  }
  const maximum = itemQuantityLimit(item);
  const requested = (item.quantity ?? 1) + delta;
  if (requested < 1) {
    return;
  }
  const newQty = delta < 0 ? clampQuantity(requested, maximum) : requested;
  if (!isQuantityAllowed(newQty, maximum)) {
    showQuantityLimit(maximum);
    return;
  }
  updatingIds.value.add(item.id);
  try {
    const updated = await sendRequest(cartApi.updateCartItem(item.id, newQty));
    if (!updated) {
      throw new Error('Missing cart item response');
    }
    applyCartItemResponse(item, updated);
  } catch {
    uni.showToast({ title: t('cart.operationFailed'), icon: 'none' });
  } finally {
    updatingIds.value.delete(item.id);
  }
}

async function doRemoveItem(item: CartItemResponse) {
  try {
    await sendRequest(cartApi.removeCartItem(item.id!));
    cartItems.value = cartItems.value.filter((i) => i.id !== item.id);
    selectedIds.value.delete(item.id!);
    cartStore.removeItem(item.id!);
    closeSwipe(item.id!);
  } catch {
    uni.showToast({ title: t('cart.removeFailed'), icon: 'none' });
  }
}

function removeItem(item: CartItemResponse) {
  uni.showModal({
    title: t('cart.confirmTitle'),
    content: t('cart.removeConfirm'),
    success: async ({ confirm }) => {
      if (!confirm) {
        return;
      }
      await doRemoveItem(item);
    },
  });
}

async function removeSelected() {
  if (!selectedItems.value.length) {
    uni.showToast({ title: t('cart.selectItemsFirst'), icon: 'none' });
    return;
  }
  uni.showModal({
    title: t('cart.confirmTitle'),
    content: t('cart.removeSelectedConfirm', { count: selectedItems.value.length }),
    success: async ({ confirm }) => {
      if (!confirm) {
        return;
      }
      for (const item of [...selectedItems.value]) {
        await doRemoveItem(item);
      }
    },
  });
}

function goToCheckout() {
  if (updatingIds.value.size || skuSubmitting.value || cartRefreshRequired.value) {
    return;
  }
  if (!selectedItems.value.length) {
    uni.showToast({ title: t('cart.selectItems'), icon: 'none' });
    return;
  }
  const invalidItem = selectedItems.value.find(
    (item) => !isQuantityAllowed(item.quantity ?? 1, getCartQuantityLimit(item, 999)),
  );
  if (invalidItem) {
    showQuantityLimit(getCartQuantityLimit(invalidItem, 999));
    return;
  }
  const checkoutItems = selectedItems.value
    .map((item) => ({
      cartItemId: item.id,
      quantity: item.quantity ?? 1,
    }))
    .filter(
      (item): item is { cartItemId: number; quantity: number } =>
        typeof item.cartItemId === 'number',
    );
  if (!checkoutItems.length) {
    uni.showToast({ title: t('cart.noCheckoutItems'), icon: 'none' });
    return;
  }
  const items = encodeURIComponent(JSON.stringify(checkoutItems));
  uni.navigateTo({ url: `/subpkg-trade/confirm/index?items=${items}` });
}

function toggleEditing() {
  isEditing.value = !isEditing.value;
  if (!isEditing.value) {
    swipedId.value = null;
    swipedIds.value.clear();
  }
}

function getItemSpecText(item: CartItemResponse): string {
  return getSpecText(item.productVariant?.specValues);
}

function onPageTap() {
  if (swipedId.value !== null) {
    closeSwipe(swipedId.value);
  }
}

function goShopping() {
  uni.switchTab({ url: '/pages/home/index' });
}

const skuVisible = ref(false);
const skuTargetItem = ref<CartItemResponse | null>(null);
const skuProduct = ref<ProductResponse | null>(null);
const skuLoadingId = ref<number | null>(null);

function applyCartItemResponse(item: CartItemResponse, updated: CartItemResponse) {
  Object.assign(item, updated, {
    maxPerOrder: updated.maxPerOrder,
    maxPerUser: updated.maxPerUser,
  });
  // The full product cache may still carry purchase limits the server has just removed.
  skuProduct.value = null;
  syncCartStore(cartItems.value);
}

const skuSpecDefinition = computed<SpecDefinitionPayload[]>(
  () => skuProduct.value?.specDefinition ?? [],
);

const skuSelectedSpecs = ref<Record<string, string>>({});
const skuQuantity = ref(1);

/**
 * Find the matching variant from the selected specs
 */
const skuSelectedVariant = computed(() => {
  const variants = skuProduct.value?.productVariants;
  if (!variants?.length) {
    const item = skuTargetItem.value;
    return item?.productVariant
      ? {
          ...item.productVariant,
          maxPerOrder: item.maxPerOrder ?? item.productVariant.maxPerOrder,
          maxPerUser: item.maxPerUser ?? item.productVariant.maxPerUser,
        }
      : null;
  }
  return (
    variants.find((v) => {
      if (!v.specValues?.length) {
        return true;
      }
      return v.specValues.every((sv) => skuSelectedSpecs.value[sv.name ?? ''] === sv.value);
    }) ?? null
  );
});

const skuQuantityLimit = computed(() =>
  getQuantityLimit(skuSelectedVariant.value, cartQuantityMaximum),
);
watch(
  skuQuantityLimit,
  (maximum) => {
    if (skuSelectedVariant.value) {
      skuQuantity.value = clampQuantity(skuQuantity.value, maximum);
    }
  },
  { flush: 'sync' },
);

const skuDisplayPrice = computed(() => {
  const price = skuSelectedVariant.value?.price;
  if (price != null) {
    return price.toFixed(2);
  }
  return (skuTargetItem.value?.productVariant?.price ?? 0).toFixed(2);
});

const skuSelectedText = computed(() => {
  const entries = Object.entries(skuSelectedSpecs.value).filter(([, v]) => v);
  if (!entries.length) {
    return '';
  }
  return entries.map(([k, v]) => `${k}: ${v}`).join('，');
});

async function openSkuSelector(item: CartItemResponse) {
  if (
    skuSubmitting.value ||
    cartRefreshRequired.value ||
    (item.id != null && updatingIds.value.has(item.id))
  ) {
    return;
  }
  skuTargetItem.value = item;
  skuQuantity.value = clampQuantity(item.quantity ?? 1, itemQuantityLimit(item));

  /**
   * Initialize selected specs from the current cart item variant
   */
  const specs: Record<string, string> = {};
  (item.productVariant?.specValues ?? []).forEach((sv) => {
    if (sv.name) {
      specs[sv.name] = sv.value ?? '';
    }
  });
  skuSelectedSpecs.value = specs;

  const productId = item.product?.id;
  if (!productId) {
    skuProduct.value = null;
    skuVisible.value = true;
    return;
  }

  // Reuse it directly if the same product is already cached
  if (skuProduct.value?.id === productId) {
    skuVisible.value = true;
    return;
  }

  skuLoadingId.value = item.id ?? null;
  try {
    const data = await sendRequest(
      productApi.getProduct(productId, {
        includeVariants: true,
        includeContent: false,
        includeImages: false,
      }),
    );
    skuProduct.value = data;
    skuVisible.value = true;
  } catch {
    uni.showToast({ title: t('cart.loadSkuFailed'), icon: 'none' });
  } finally {
    skuLoadingId.value = null;
  }
}

async function confirmSkuChange() {
  if (skuSubmitting.value || cartRefreshRequired.value || !skuVisible.value) {
    return;
  }
  const item = skuTargetItem.value;
  if (!item) {
    return;
  }

  const newVariant = skuSelectedVariant.value;
  const newQty = skuQuantity.value;
  if (!newVariant?.id) {
    uni.showToast({ title: t('sku.unavailable'), icon: 'none' });
    return;
  }
  if (!isQuantityAllowed(newQty, skuQuantityLimit.value)) {
    showQuantityLimit(skuQuantityLimit.value);
    return;
  }
  const oldVariantId = item.productVariantId ?? item.productVariant?.id;
  const variantChanged = newVariant.id !== oldVariantId;
  if (variantChanged) {
    const existing = cartItems.value.find(
      (candidate) =>
        candidate.id !== item.id &&
        (candidate.productVariantId ?? candidate.productVariant?.id) === newVariant.id,
    );
    const mergedQuantity = newQty + (existing?.quantity ?? 0);
    if (!isQuantityAllowed(mergedQuantity, skuQuantityLimit.value)) {
      showQuantityLimit(skuQuantityLimit.value);
      return;
    }
  }

  skuSubmitting.value = true;
  let replacementStarted = false;
  try {
    if (variantChanged) {
      // Once sent, a failed response cannot prove whether the server has accumulated the new SKU.
      replacementStarted = true;
      cartRequestVersion++;
      const added = await sendRequest(
        cartApi.addCartItem({ productVariantId: newVariant.id, quantity: newQty }),
      );
      if (!added) {
        throw new Error('Missing added cart item response');
      }
      await sendRequest(cartApi.removeCartItem(item.id!));
      cartRefreshRequired.value = true;
      if (!(await loadCart())) {
        skuVisible.value = false;
        uni.showToast({ title: t('cart.updateFailed'), icon: 'none' });
        return;
      }
    } else if (newQty !== item.quantity) {
      const updated = await sendRequest(cartApi.updateCartItem(item.id!, newQty));
      if (!updated) {
        throw new Error('Missing cart item response');
      }
      applyCartItemResponse(item, updated);
    }
    skuVisible.value = false;
    uni.showToast({ title: t('cart.updated'), icon: 'success' });
  } catch {
    if (replacementStarted) {
      skuVisible.value = false;
      cartRefreshRequired.value = true;
    }
    await loadCart();
    uni.showToast({ title: t('cart.updateFailed'), icon: 'none' });
  } finally {
    skuSubmitting.value = false;
  }
}

function goToProduct(product: ProductResponse | undefined) {
  if (!product) {
    return;
  }
  uni.navigateTo({ url: `/subpkg-product/detail/index?id=${product.id}` });
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page" @tap="onPageTap">
    <view v-if="!showLoginPanel" class="bg-white flex justify-end px-4 py-3 shadow-sm z-10">
      <view @tap.stop="toggleEditing">
        <text class="text-slate-600 text-sm">
          {{ isEditing ? $t('cart.done') : $t('cart.edit') }}
        </text>
      </view>
    </view>

    <view class="flex-1" :style="`padding-bottom: ${listPaddingBottom}`">
      <view v-if="showLoginPanel" class="bg-white min-h-full">
        <LoginPanel mode="page" :page-offset-bottom="totalHeight" @success="handleLoginSuccess" />
      </view>

      <view v-else-if="showInitialLoading" class="flex justify-center px-4 py-10">
        <AppLoading variant="spinner" />
      </view>

      <view v-else-if="isInitialLoading" class="flex-1" />

      <template v-else>
        <AppLoadError v-if="cartRefreshRequired" @retry="loadCart" />
        <AppEmpty
          v-else-if="!cartItems.length"
          :text="$t('cart.emptyTitle')"
          :subtext="$t('cart.emptySubtitle')"
          :cta-text="$t('cart.goShopping')"
          @cta="goShopping"
        />

        <view v-else class="bg-white mt-3">
          <view
            v-for="(item, idx) in cartItems"
            :key="item.id"
            class="relative overflow-hidden"
            :class="idx > 0 ? 'border-t border-slate-50' : ''"
          >
            <view
              class="w-12.5 absolute right-0 top-0 bottom-0 bg-brand flex items-center justify-center"
              style="height: calc(100% - 4rpx); margin: auto 0"
              @tap.stop="removeItem(item)"
            >
              <text class="text-white text-sm font-bold">{{ $t('cart.remove') }}</text>
            </view>

            <view
              class="relative bg-white flex items-start gap-4 p-4 transition-transform duration-250 ease-in-out"
              :style="`transform: translateX(${swipedIds.has(item.id!) ? -100 : 0}rpx);`"
              @touchstart="onTouchStart($event, item.id!)"
              @touchmove.stop="onTouchMove($event, item.id!)"
              @touchend="onTouchEnd($event, item.id!)"
            >
              <view class="self-center shrink-0" @tap.stop="toggleSelect(item.id!)">
                <view
                  class="w-4 h-4 flex items-center justify-center rounded-sm"
                  :class="
                    selectedIds.has(item.id!)
                      ? 'bg-brand border-[2rpx] border-solid border-brand'
                      : 'bg-white border-[2rpx] border-solid border-slate-300'
                  "
                >
                  <TIcon
                    v-if="selectedIds.has(item.id!)"
                    name="check"
                    v-bind="{ size: '24rpx', color: ICON_COLOR.inverse }"
                  />
                </view>
              </view>

              <view
                class="w-24 h-24 rounded-1 overflow-hidden bg-slate-100 shrink-0"
                @tap.stop="goToProduct(item.product)"
              >
                <image
                  :src="
                    formatImageUrlWithThumbnail(
                      item.productVariant?.imageUrl ?? item.product?.coverImageUrl ?? '',
                      'S',
                    )
                  "
                  mode="aspectFill"
                  class="w-full h-full"
                />
              </view>

              <view class="flex-1 flex flex-col justify-between self-stretch py-0.5 min-w-0">
                <view class="flex flex-col gap-2">
                  <text
                    class="text-slate-950 text-sm leading-snug line-clamp-2"
                    @tap.stop="goToProduct(item.product)"
                  >
                    {{ item.product?.title }}
                  </text>
                  <text
                    v-if="(item.maxPerOrder ?? item.productVariant?.maxPerOrder) != null"
                    class="text-slate-500 text-xs"
                  >
                    {{
                      t('sku.perOrderLimit', {
                        count: item.maxPerOrder ?? item.productVariant?.maxPerOrder,
                      })
                    }}
                  </text>
                  <text
                    v-if="(item.maxPerUser ?? item.productVariant?.maxPerUser) != null"
                    class="text-slate-500 text-xs"
                  >
                    {{
                      t('sku.perUserLimit', {
                        count: item.maxPerUser ?? item.productVariant?.maxPerUser,
                      })
                    }}
                  </text>
                  <view
                    v-if="getItemSpecText(item)"
                    class="flex items-center bg-slate-100 rounded-0.5 px-1.5 py-0.5 self-start gap-1 max-w-36"
                    @tap.stop="openSkuSelector(item)"
                  >
                    <text class="text-slate-500 text-xs truncate">{{ getItemSpecText(item) }}</text>
                    <TIcon
                      v-if="skuLoadingId === item.id"
                      name="loading"
                      v-bind="{ size: '20rpx', color: ICON_COLOR.muted }"
                    />
                    <TIcon
                      v-else
                      name="chevron-down"
                      v-bind="{ size: '20rpx', color: ICON_COLOR.muted }"
                    />
                  </view>
                </view>

                <view class="flex items-end justify-between mt-2">
                  <text class="text-brand text-base font-bold">
                    {{ currencySymbol }}{{ (item.productVariant?.price ?? 0).toFixed(2) }}
                  </text>

                  <view class="flex items-center bg-slate-100 rounded-1 overflow-hidden">
                    <view
                      class="w-7 h-7 flex items-center justify-center"
                      :class="
                        (item.quantity ?? 1) <= 1 || updatingIds.has(item.id!) ? 'opacity-30' : ''
                      "
                      @tap.stop="changeQuantity(item, -1)"
                    >
                      <view class="w-3 h-0.5 bg-slate-600 rounded-full" />
                    </view>
                    <view class="w-8 h-7 flex items-center justify-center">
                      <text class="text-slate-950 text-xs font-medium text-center">
                        {{ item.quantity }}
                      </text>
                    </view>
                    <view
                      class="w-7 h-7 flex items-center justify-center"
                      :class="
                        (item.quantity ?? 1) >= itemQuantityLimit(item) || updatingIds.has(item.id!)
                          ? 'opacity-30'
                          : ''
                      "
                      @tap.stop="changeQuantity(item, 1)"
                    >
                      <view class="relative w-3 h-3">
                        <view
                          class="absolute bg-slate-600 rounded-full top-1/2 left-0 right-0 h-0.5 -translate-y-1/2"
                        />
                        <view
                          class="absolute bg-slate-600 rounded-full left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2"
                        />
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </template>
    </view>

    <view
      v-if="!showLoginPanel && cartItems.length && !cartRefreshRequired"
      class="fixed left-0 right-0 z-20 bg-white border-t border-slate-100 flex items-center justify-between px-4 py-3"
      :style="`bottom: ${totalHeight + 5}px;`"
    >
      <view class="flex items-center gap-2" @tap.stop="toggleSelectAll">
        <view
          class="w-5 h-5 flex items-center justify-center rounded-sm"
          :class="
            isAllSelected
              ? 'bg-brand border-[2rpx] border-solid border-brand'
              : 'bg-white border-[2rpx] border-solid border-slate-300'
          "
        >
          <TIcon
            v-if="isAllSelected"
            name="check"
            v-bind="{ size: '24rpx', color: ICON_COLOR.inverse }"
          />
        </view>
        <text class="text-slate-500 text-sm">{{ $t('cart.selectAll') }}</text>
      </view>

      <view v-if="!isEditing" class="flex items-center gap-4">
        <view class="flex flex-col items-end">
          <view class="flex items-baseline gap-1">
            <text class="text-slate-950 text-3.5">{{ $t('cart.total') }}</text>
            <text class="text-brand text-lg font-bold">
              {{ currencySymbol }}{{ totalPrice.toFixed(2) }}
            </text>
          </view>
          <text class="text-slate-400 text-2.5">{{ $t('cart.shippingExcluded') }}</text>
        </view>
        <view
          class="bg-brand rounded-3 px-6 py-2.5 flex items-center justify-center"
          @tap.stop="goToCheckout"
        >
          <text class="text-white text-sm font-bold">
            {{ $t('cart.checkout') }}{{ selectedCount > 0 ? `(${selectedCount})` : '' }}
          </text>
        </view>
      </view>

      <view v-else>
        <view
          class="rounded-3 px-6 py-2.5 flex items-center justify-center"
          :class="
            selectedCount > 0
              ? 'border-2 border-brand border-solid'
              : 'border-2 border-slate-300 border-solid'
          "
          @tap.stop="removeSelected"
        >
          <text
            class="text-sm font-bold"
            :class="selectedCount > 0 ? 'text-brand' : 'text-slate-300'"
          >
            {{ $t('cart.remove') }}{{ selectedCount > 0 ? `(${selectedCount})` : '' }}
          </text>
        </view>
      </view>
    </view>

    <AppTabBar />

    <SkuSelector
      v-model:visible="skuVisible"
      :cover-image="skuTargetItem?.productVariant?.imageUrl ?? ''"
      :fallback-cover-image="skuTargetItem?.product?.coverImageUrl ?? ''"
      :price="skuDisplayPrice"
      :stock="skuSelectedVariant?.stock ?? -1"
      :track-inventory="skuSelectedVariant?.trackInventory ?? false"
      :max-per-order="skuSelectedVariant?.maxPerOrder"
      :max-per-user="skuSelectedVariant?.maxPerUser"
      :max-quantity="cartQuantityMaximum"
      :selected-text="skuSelectedText"
      :spec-definition="skuSpecDefinition"
      :selected-specs="skuSelectedSpecs"
      :quantity="skuQuantity"
      @update:selected-specs="skuSelectedSpecs = $event"
      @update:quantity="skuQuantity = $event"
    >
      <view
        class="bg-brand rounded-full py-3.5 flex items-center justify-center"
        :class="skuSubmitting || !skuSelectedVariant || skuQuantityLimit < 1 ? 'opacity-60' : ''"
        @tap="confirmSkuChange"
      >
        <text class="text-white text-base font-bold">{{
          skuSubmitting ? $t('cart.updating') : $t('common.confirm')
        }}</text>
      </view>
    </SkuSelector>
  </view>
</template>
