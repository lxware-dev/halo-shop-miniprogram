<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppLoading from '@/components/common/AppLoading.vue';
import AppEmpty from '@/components/common/AppEmpty.vue';
import LoginPanel from '@/components/business/LoginPanel.vue';
import { cartApi } from '@/api/modules/cart';
import { productApi } from '@/api/modules/product';
import { useAppConfig } from '@/config';
import { getSpecText } from '@/helpers/order';
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
const { maxCartItems } = useAppConfig().business;
const cartStore = useCartStore();
const userStore = useUserStore();
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
  cartItems.value = [];
  cartStore.clearAll();
  selectedIds.value = new Set();
  isEditing.value = false;
  swipedId.value = null;
  swipedIds.value.clear();
  resetCartLoaded();
}

async function loadCart() {
  try {
    const data = await runCartQuery({});
    cartItems.value = data ?? [];
    selectedIds.value = new Set(cartItems.value.map((i) => i.id!));
    syncCartStore(cartItems.value);
  } catch {
  } finally {
    markCartLoaded();
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
  const newQty = (item.quantity ?? 1) + delta;
  if (newQty < 1) {
    return;
  }
  if (newQty > maxCartItems) {
    uni.showToast({ title: `每件商品最多加 ${maxCartItems} 件`, icon: 'none' });
    return;
  }
  try {
    await sendRequest(cartApi.updateCartItem(item.id!, newQty));
    item.quantity = newQty;
    cartStore.updateQuantity(item.id!, newQty);
  } catch {
    uni.showToast({ title: '操作失败', icon: 'none' });
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
    uni.showToast({ title: '删除失败', icon: 'none' });
  }
}

function removeItem(item: CartItemResponse) {
  uni.showModal({
    title: '提示',
    content: '确定要删除该商品吗？',
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
    uni.showToast({ title: '请先选择商品', icon: 'none' });
    return;
  }
  uni.showModal({
    title: '提示',
    content: `确定删除选中的 ${selectedItems.value.length} 件商品吗？`,
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
  if (!selectedItems.value.length) {
    uni.showToast({ title: '请选择商品', icon: 'none' });
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
    uni.showToast({ title: '缺少可结算商品', icon: 'none' });
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
    return skuTargetItem.value?.productVariant ?? null;
  }
  return (
    variants.find((v) => {
      if (!v.specValues?.length) {
        return true;
      }
      return v.specValues.every((sv) => skuSelectedSpecs.value[sv.name ?? ''] === sv.value);
    }) ??
    variants[0] ??
    null
  );
});

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
  skuTargetItem.value = item;
  skuQuantity.value = item.quantity ?? 1;

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
    uni.showToast({ title: '加载规格失败', icon: 'none' });
  } finally {
    skuLoadingId.value = null;
  }
}

const skuSubmitting = ref(false);

async function confirmSkuChange() {
  if (skuSubmitting.value) {
    return;
  }
  const item = skuTargetItem.value;
  if (!item) {
    return;
  }

  const newVariant = skuSelectedVariant.value;
  const newQty = skuQuantity.value;

  skuSubmitting.value = true;
  try {
    // If the variant changes, remove the old item before adding the new one
    if (newVariant?.id && newVariant.id !== item.productVariant?.id) {
      await sendRequest(cartApi.removeCartItem(item.id!));
      await sendRequest(cartApi.addCartItem({ productVariantId: newVariant.id, quantity: newQty }));
      await loadCart();
    } else if (newQty !== item.quantity) {
      await sendRequest(cartApi.updateCartItem(item.id!, newQty));
      item.quantity = newQty;
    }
    skuVisible.value = false;
    uni.showToast({ title: '已更新', icon: 'success' });
  } catch {
    uni.showToast({ title: '更新失败', icon: 'none' });
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
        <text class="text-slate-600 text-sm">{{ isEditing ? '完成' : '编辑' }}</text>
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
        <AppEmpty
          v-if="!cartItems.length"
          text="购物车还是空的"
          subtext="去挑选你喜欢的商品，加入购物车吧"
          cta-text="去逛逛"
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
              <text class="text-white text-sm font-bold">删除</text>
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
                    ¥{{ (item.productVariant?.price ?? 0).toFixed(2) }}
                  </text>

                  <view class="flex items-center bg-slate-100 rounded-1 overflow-hidden">
                    <view
                      class="w-7 h-7 flex items-center justify-center"
                      :class="(item.quantity ?? 1) <= 1 ? 'opacity-30' : ''"
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
      v-if="!showLoginPanel && cartItems.length"
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
        <text class="text-slate-500 text-sm">全选</text>
      </view>

      <view v-if="!isEditing" class="flex items-center gap-4">
        <view class="flex flex-col items-end">
          <view class="flex items-baseline gap-1">
            <text class="text-slate-950 text-3.5">合计:</text>
            <text class="text-brand text-lg font-bold">¥{{ totalPrice.toFixed(2) }}</text>
          </view>
          <text class="text-slate-400 text-2.5">不含运费</text>
        </view>
        <view
          class="bg-brand rounded-3 px-6 py-2.5 flex items-center justify-center"
          @tap.stop="goToCheckout"
        >
          <text class="text-white text-sm font-bold">
            结算{{ selectedCount > 0 ? `(${selectedCount})` : '' }}
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
            删除{{ selectedCount > 0 ? `(${selectedCount})` : '' }}
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
      :selected-text="skuSelectedText"
      :spec-definition="skuSpecDefinition"
      :selected-specs="skuSelectedSpecs"
      :quantity="skuQuantity"
      @update:selected-specs="skuSelectedSpecs = $event"
      @update:quantity="skuQuantity = $event"
    >
      <view
        class="bg-brand rounded-full py-3.5 flex items-center justify-center"
        :class="skuSubmitting ? 'opacity-60' : ''"
        @tap="confirmSkuChange"
      >
        <text class="text-white text-base font-bold">{{
          skuSubmitting ? '更新中...' : '确认'
        }}</text>
      </view>
    </SkuSelector>
  </view>
</template>
