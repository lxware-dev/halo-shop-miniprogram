<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { checkoutApi } from '@/api/modules/checkout';
import { guardCurrentPageAccess, navigateToPage } from '@/helpers/auth';
import { ICON_COLOR } from '@/helpers/icon';
import { addressApi } from '@/api/modules/address';
import { sendRequest, useQuery } from '@/hooks/useRequest';
import { formatPrice, maskPhone, joinName, joinAddress } from '@/utils/format';
import { getSpecText } from '@/helpers/order';
import type {
  CheckoutContextResponse,
  CheckoutItemResponse,
  MpCheckoutSubmitRequest,
  PrepareCheckoutRequest,
  UserAddressUpsertRequest,
  UserAddressResponse,
} from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';

// From cart: items=[{ cartItemId, quantity }]
// From buy now: variantId=10&quantity=2
interface CheckoutPrepareItemPayload {
  cartItemId?: number;
  productVariantId?: number;
  quantity: number;
}

const loading = ref(true);
const submitting = ref(false);
const context = ref<CheckoutContextResponse | null>(null);
const selectedAddress = ref<UserAddressResponse | null>(null);
const localAddresses = ref<UserAddressResponse[]>([]);
const contextAddress = ref<UserAddressUpsertRequest | null>(null);
const basePreparePayload = ref<PrepareCheckoutRequest | null>(null);
const remark = ref('');
const hasInitialized = ref(false);
const { run: runAddressesQuery } = useQuery<UserAddressResponse[], Record<string, never>>(
  () => addressApi.getAddresses(),
  {
    immediate: false,
  },
);
const { loading: syncingContext, run: runPrepareCheckout } = useQuery<
  CheckoutContextResponse,
  PrepareCheckoutRequest
>((payload) => checkoutApi.prepareCheckout(payload), {
  immediate: false,
});

function parseCheckoutItems(raw?: string): CheckoutPrepareItemPayload[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        cartItemId:
          item?.cartItemId == null || item.cartItemId === '' ? undefined : Number(item.cartItemId),
        productVariantId: Number(item?.productVariantId),
        quantity: Number(item?.quantity ?? 1),
      }))
      .filter(
        (item) =>
          ((Number.isInteger(item.cartItemId) && (item.cartItemId ?? 0) > 0) ||
            (Number.isInteger(item.productVariantId) && (item.productVariantId ?? 0) > 0)) &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      );
  } catch {
    return [];
  }
}

onLoad(async (options) => {
  if (!guardCurrentPageAccess()) {
    loading.value = false;
    hasInitialized.value = true;
    return;
  }

  let createPayload: PrepareCheckoutRequest | null = null;

  if (options?.variantId) {
    createPayload = {
      source: 'BUY_NOW',
      items: [
        {
          productVariantId: Number(options.variantId),
          quantity: Number(options.quantity ?? 1),
        },
      ],
    };
  } else if (options?.items) {
    const checkoutItems = parseCheckoutItems(options.items);
    createPayload = {
      source: 'CART',
      items: checkoutItems,
    };
  }

  if (!createPayload || !createPayload.items?.length) {
    uni.showToast({ title: '结算参数无效', icon: 'none' });
    loading.value = false;
    hasInitialized.value = true;
    return;
  }

  basePreparePayload.value = createPayload;

  try {
    await loadAddresses();
    await refreshCheckoutContext(selectedAddress.value?.id);
  } catch {
    uni.showToast({ title: '结算初始化失败', icon: 'none' });
  } finally {
    loading.value = false;
    hasInitialized.value = true;
  }
});

onShow(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (!hasInitialized.value || loading.value || !basePreparePayload.value) {
    return;
  }
  syncLatestSelectedAddress().catch(() => {
    // ignore
  });
});

const items = computed<CheckoutItemResponse[]>(() => context.value?.items ?? []);

const totalQuantity = computed(() =>
  items.value.reduce((sum, item) => sum + (item.quantity ?? 0), 0),
);

const saleTotalAmount = computed(() => context.value?.calculateResult?.saleTotalAmount ?? 0);

const shippingFee = computed(() => context.value?.calculateResult?.shippingFeeAmount ?? 0);

const totalDiscountAmount = computed(
  () => context.value?.calculateResult?.totalDiscountAmount ?? 0,
);

const payableAmount = computed(() => context.value?.calculateResult?.payableAmount ?? 0);
const isShippingRequired = computed(() => context.value?.isShippingRequired !== false);
const shippingDetails = computed(() => context.value?.calculateResult?.shippingDetails ?? []);

const addressDisplayName = computed(() => {
  if (selectedAddress.value) {
    return joinName(selectedAddress.value.lastName, selectedAddress.value.firstName);
  }
  if (!contextAddress.value) {
    return '';
  }
  return joinName(contextAddress.value.lastName, contextAddress.value.firstName);
});

const addressDisplayPhone = computed(() =>
  maskPhone(selectedAddress.value?.contactPhone ?? contextAddress.value?.contactPhone ?? ''),
);

const addressDisplayText = computed(() => {
  if (selectedAddress.value) {
    const { province, city, district, streetAddress } = selectedAddress.value;
    return joinAddress(province, city, district, streetAddress);
  }
  if (!contextAddress.value) {
    return '';
  }
  const { streetAddress } = contextAddress.value;
  return streetAddress ?? '';
});

const hasAddress = computed(() => {
  if (!isShippingRequired.value) {
    return true;
  }
  return Boolean(selectedAddress.value || contextAddress.value);
});

async function loadAddresses() {
  try {
    const addresses = await runAddressesQuery({});
    if (addresses?.length) {
      localAddresses.value = addresses;
      selectedAddress.value = addresses.find((a) => a.isDefault) ?? addresses[0];
      return;
    }
    localAddresses.value = [];
  } catch {
    // ignore
    localAddresses.value = [];
  }
}

function syncAddressByContext(ctx: CheckoutContextResponse) {
  contextAddress.value = ctx.userAddress ?? null;
  if (!ctx.selectedAddressId) {
    selectedAddress.value = null;
    return;
  }
  const matched = localAddresses.value.find((addr) => addr.id === ctx.selectedAddressId);
  if (matched) {
    selectedAddress.value = matched;
    return;
  }
  selectedAddress.value = null;
}

async function syncLatestSelectedAddress() {
  await loadAddresses();
  if (!isShippingRequired.value) {
    return;
  }
  const preferredAddressId =
    selectedAddress.value?.id ??
    context.value?.selectedAddressId ??
    localAddresses.value.find((addr) => addr.isDefault)?.id;
  const latestSelectedAddress =
    (preferredAddressId != null
      ? localAddresses.value.find((addr) => addr.id === preferredAddressId)
      : null) ??
    localAddresses.value.find((addr) => addr.isDefault) ??
    localAddresses.value[0] ??
    null;
  selectedAddress.value = latestSelectedAddress;
  await refreshCheckoutContext(latestSelectedAddress?.id);
}

async function refreshCheckoutContext(selectedAddressId?: number) {
  if (!basePreparePayload.value) {
    return;
  }
  try {
    const payload: PrepareCheckoutRequest = {
      ...basePreparePayload.value,
      selectedAddressId,
    };
    const ctx = await runPrepareCheckout(payload);
    if (!ctx) {
      return;
    }
    context.value = ctx;
    syncAddressByContext(ctx);
  } catch {}
}

function goSelectAddress() {
  if (!isShippingRequired.value) {
    return;
  }
  const pages = getCurrentPages();
  const currentPage = pages.at(-1) as any;

  navigateToPage('/subpkg-mine/address-list/index?mode=select');

  if (currentPage) {
    currentPage.onAddressSelected = (address: UserAddressResponse) => {
      applySelectedAddress(address).catch(() => {
        uni.showToast({ title: '更新地址失败', icon: 'none' });
      });
    };
  }
}

async function applySelectedAddress(address: UserAddressResponse) {
  selectedAddress.value = address;
  await refreshCheckoutContext(address.id);
}

function getItemSpecText(item: CheckoutItemResponse): string {
  return getSpecText(item.productVariant?.specValues);
}

function buildSubmitItems(source: MpCheckoutSubmitRequest['source']) {
  if (source === 'CART') {
    return (basePreparePayload.value?.items ?? [])
      .map((item, index) => ({
        cartItemId: item.cartItemId,
        quantity: item.quantity ?? items.value[index]?.quantity ?? 1,
        selectedShippingRateId: items.value[index]?.selectedShippingRateId,
      }))
      .filter(
        (
          item,
        ): item is {
          cartItemId: number;
          quantity: number;
          selectedShippingRateId: number | undefined;
        } =>
          typeof item.cartItemId === 'number' &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      );
  }

  return items.value
    .map((item) => ({
      productVariantId: item.productVariant?.id,
      quantity: item.quantity ?? 1,
      selectedShippingRateId: item.selectedShippingRateId,
    }))
    .filter(
      (
        item,
      ): item is {
        productVariantId: number;
        quantity: number;
        selectedShippingRateId: number | undefined;
      } => typeof item.productVariantId === 'number',
    );
}

async function handleSubmit() {
  if (submitting.value) {
    return;
  }
  if (syncingContext.value) {
    uni.showToast({ title: '正在更新结算信息，请稍后', icon: 'none' });
    return;
  }
  if (isShippingRequired.value && !hasAddress.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' });
    return;
  }
  if (!context.value) {
    return;
  }
  const submitSource = context.value.source === 'BUY_NOW' ? 'BUY_NOW' : 'CART';
  const submitItems = buildSubmitItems(submitSource);
  if (!submitItems.length) {
    uni.showToast({ title: '结算商品为空', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    const submitAddressId = selectedAddress.value?.id ?? context.value.selectedAddressId;
    const payload: MpCheckoutSubmitRequest = {
      source: submitSource,
      items: submitItems,
      expectedPayableAmount: payableAmount.value,
      customerNotes: remark.value || undefined,
    };
    if (isShippingRequired.value) {
      payload.selectedAddressId = submitAddressId;
      if (!submitAddressId && context.value.userAddress) {
        payload.userAddress = context.value.userAddress;
      }
    }
    const { order } = await sendRequest(checkoutApi.submitOrder(payload));

    if (!order?.orderCode) {
      uni.showToast({ title: '提交成功，但未获取订单号', icon: 'none' });
      return;
    }
    uni.redirectTo({
      url: `/subpkg-trade/payment/index?orderCode=${order.orderCode}`,
    });
  } catch {
    uni.showToast({ title: '提交失败，请重试', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view v-if="loading" class="flex flex-col items-center justify-center min-h-screen bg-bg-page">
    <text class="text-slate-400 text-sm">加载中...</text>
  </view>

  <view
    v-else
    class="flex flex-col border-0 border-t-1 border-solid border-gray-100 bg-bg-page min-h-screen"
  >
    <scroll-view scroll-y class="flex-1 pb-30">
      <view class="bg-white">
        <view
          class="flex items-center justify-between px-4"
          :class="isShippingRequired ? 'py-2 min-h-22' : 'py-3 min-h-14'"
          @tap="goSelectAddress"
        >
          <view
            class="flex items-center flex-1 min-w-0"
            :class="isShippingRequired ? 'gap-4' : 'gap-2'"
          >
            <view
              class="flex items-center justify-center rounded-3 shrink-0 bg-brand/10"
              :class="isShippingRequired ? 'w-10 h-10' : 'w-8 h-8'"
            >
              <TIcon name="location" v-bind="{ size: '40rpx', color: ICON_COLOR.brand }" />
            </view>

            <view
              v-if="isShippingRequired && hasAddress"
              class="flex flex-col gap-1 flex-1 min-w-0"
            >
              <view class="flex items-center gap-2">
                <text class="text-slate-950 text-4 font-medium">
                  {{ addressDisplayName }}
                </text>
                <text class="text-slate-500 text-sm">{{ addressDisplayPhone }}</text>
              </view>
              <text class="text-slate-600 text-sm leading-normal line-clamp-2">
                {{ addressDisplayText }}
              </text>
            </view>

            <view v-else-if="isShippingRequired" class="flex flex-col gap-1">
              <text class="text-slate-950 text-base font-medium">请添加收货地址</text>
              <text class="text-slate-400 text-sm">点击选择或添加收货地址</text>
            </view>

            <view v-else class="flex flex-col gap-1">
              <text class="text-slate-950 text-sm font-medium">无需收货地址</text>
            </view>
          </view>

          <TIcon
            v-if="isShippingRequired"
            name="chevron-right"
            v-bind="{ size: '48rpx', color: ICON_COLOR.muted }"
          />
        </view>

        <view class="mx-4 border-0 border-b border-dashed border-slate-200" />
      </view>

      <view class="bg-white mt-2 px-4 py-4 flex flex-col gap-4">
        <view v-for="(item, idx) in items" :key="idx" class="flex gap-3 items-start">
          <view class="shrink-0 rounded-1 overflow-hidden bg-slate-100 w-24 h-24">
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

          <view class="flex-1 flex flex-col justify-between self-stretch min-w-0">
            <view class="flex flex-col gap-1">
              <text class="text-slate-950 text-sm leading-snug line-clamp-2">
                {{ item.product?.title }}
              </text>
              <text v-if="getItemSpecText(item)" class="text-slate-400 text-xs">
                {{ getItemSpecText(item) }}
              </text>
            </view>

            <view class="flex items-end justify-between">
              <text class="text-brand text-base font-bold"> ¥ {{ formatPrice(item.price) }} </text>
              <text class="text-slate-400 text-sm">x {{ item.quantity }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="bg-white mt-2 px-4">
        <view class="flex items-center justify-between py-4">
          <text class="text-slate-950 text-sm">商品金额</text>
          <text class="text-slate-950 text-sm">¥ {{ formatPrice(saleTotalAmount) }}</text>
        </view>

        <view
          class="flex items-center justify-between py-4 border-0 border-t border-solid border-slate-50"
        >
          <text class="text-slate-950 text-sm">配送费</text>
          <text class="text-slate-950 text-sm">
            {{
              !isShippingRequired
                ? '无需配送'
                : shippingFee > 0
                  ? `¥ ${formatPrice(shippingFee)}`
                  : '免运费'
            }}
          </text>
        </view>

        <view
          v-if="shippingDetails.length"
          class="flex items-center justify-between py-4 border-0 border-t border-solid border-slate-50"
        >
          <text class="text-slate-950 text-sm">配送方式</text>
          <text class="text-slate-500 text-sm text-right max-w-60 line-clamp-2">
            {{
              shippingDetails[0].shippingRateName || shippingDetails[0].description || '标准配送'
            }}
          </text>
        </view>

        <view class="flex items-center gap-3 py-4 border-0 border-t border-solid border-slate-50">
          <text class="text-slate-950 text-sm shrink-0">订单备注</text>
          <input
            v-model="remark"
            class="flex-1 text-sm text-slate-950"
            placeholder="选填，请先和商家协商一致"
            placeholder-style="color: #cbd5e1"
            :maxlength="200"
          />
        </view>
      </view>

      <view class="bg-white mt-2 px-4 py-4 flex items-center justify-end gap-2">
        <text class="text-slate-500 text-xs">共 {{ totalQuantity }} 件商品</text>
        <view class="flex items-center">
          <text class="text-slate-950 text-sm">合计：</text>
          <text class="text-brand text-xl font-bold"> ¥ {{ formatPrice(payableAmount) }} </text>
        </view>
      </view>
    </scroll-view>

    <view
      class="fixed bottom-0 left-0 right-0 z-10 bg-white border-0 border-t border-solid border-slate-100 px-4 pt-3 flex items-center justify-between pb-safe"
    >
      <view class="flex flex-col gap-0.5">
        <view class="flex items-baseline gap-0.5">
          <text class="text-brand text-sm font-bold">¥</text>
          <text class="text-brand text-6 font-bold">
            {{ formatPrice(payableAmount) }}
          </text>
        </view>
        <text v-if="totalDiscountAmount > 0" class="text-slate-400 text-2.5">
          已优惠 ¥{{ formatPrice(totalDiscountAmount) }}
        </text>
      </view>

      <view
        class="flex items-center justify-center rounded-3 px-8 py-3"
        :class="submitting || syncingContext ? 'opacity-60 bg-brand' : 'bg-brand'"
        @tap="handleSubmit"
      >
        <text class="text-white text-base font-medium">
          {{ submitting ? '提交中...' : syncingContext ? '更新中...' : '提交订单' }}
        </text>
      </view>
    </view>
  </view>
</template>
