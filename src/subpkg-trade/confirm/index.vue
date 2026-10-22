<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { useAppConfig } from '@/config';
import { guardCurrentPageAccess, navigateToPage } from '@/helpers/auth';
import { ICON_COLOR } from '@/helpers/icon';
import { formatPrice, formatCurrency, maskPhone, joinName, joinAddress } from '@/utils/format';
import { getSpecText } from '@/helpers/order';
import type {
  CheckoutItemResponse,
  PrepareCheckoutRequest,
  UserAddressResponse,
} from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import AppLoadError from '@/components/common/AppLoadError.vue';
import { useCheckout, CheckoutNotReadyError } from '@/composables/useCheckout';

// From cart: items=[{ cartItemId, quantity }]
// From buy now: variantId=10&quantity=2
interface CheckoutPrepareItemPayload {
  cartItemId?: number;
  productVariantId?: number;
  quantity: number;
}

const loading = ref(true);
const { t } = useI18n();
const { currencySymbol } = useAppConfig().business;
const remark = ref('');
const hasInitialized = ref(false);
const {
  context,
  selectedAddress,
  syncing: syncingContext,
  verified: pricingVerified,
  failed: pricingFailed,
  failureDetail: pricingFailureDetail,
  submitting,
  uncertain: submissionUncertain,
  completedOrder,
  accountChanged,
  locked: checkoutLocked,
  isShippingRequired,
  hasAddress,
  initialize,
  refresh: refreshCheckoutContext,
  syncAddress,
  selectAddress,
  submit,
} = useCheckout();
const contextAddress = computed(() => context.value?.userAddress);
const pricingFailureText = computed(
  () => pricingFailureDetail.value ?? t('checkout.pricingFailed'),
);

function parsePositiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

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
        cartItemId: parsePositiveId(item?.cartItemId),
        productVariantId: parsePositiveId(item?.productVariantId),
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
          productVariantId: parsePositiveId(options.variantId),
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

  if (
    !createPayload ||
    !createPayload.items?.length ||
    createPayload.items.some(
      (item) =>
        !Number.isSafeInteger(item.quantity) ||
        (item.quantity ?? 0) <= 0 ||
        !(createPayload.source === 'CART' ? item.cartItemId : item.productVariantId),
    )
  ) {
    uni.showToast({ title: t('checkout.invalidParams'), icon: 'none' });
    loading.value = false;
    hasInitialized.value = true;
    return;
  }

  try {
    await initialize(createPayload);
  } finally {
    loading.value = false;
    hasInitialized.value = true;
  }
});

onShow(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (!hasInitialized.value || loading.value || syncingContext.value || checkoutLocked.value) {
    return;
  }
  void syncAddress();
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

function goSelectAddress() {
  if (checkoutLocked.value || syncingContext.value || !isShippingRequired.value) {
    return;
  }
  const pages = getCurrentPages();
  const currentPage = pages.at(-1) as any;

  navigateToPage('/subpkg-mine/address-list/index?mode=select');

  if (currentPage) {
    currentPage.onAddressSelected = (address: UserAddressResponse) => {
      void selectAddress(address);
    };
  }
}

function getItemSpecText(item: CheckoutItemResponse): string {
  return getSpecText(item.productVariant?.specValues);
}

function goModifyCheckout() {
  if (checkoutLocked.value) {
    return;
  }
  if (getCurrentPages().length > 1) {
    uni.navigateBack({ fail: () => navigateToPage('/pages/cart/index') });
    return;
  }
  navigateToPage('/pages/cart/index');
}

async function handleSubmit() {
  if (accountChanged.value) {
    navigateToPage('/pages/cart/index');
    return;
  }
  if (completedOrder.value) {
    navigateToPage(
      `/subpkg-trade/order-detail/index?orderCode=${encodeURIComponent(completedOrder.value.orderCode)}`,
    );
    return;
  }
  if (submissionUncertain.value) {
    navigateToPage('/subpkg-trade/order-list/index');
    return;
  }
  if (pricingFailed.value) {
    return;
  }
  try {
    const order = await submit(remark.value);
    if (!order) {
      return;
    }
    const orderCode = encodeURIComponent(order.orderCode);
    uni.redirectTo({
      url:
        order.paymentStatus === 'PAID'
          ? `/subpkg-trade/payment-result/index?status=success&orderCode=${orderCode}`
          : `/subpkg-trade/payment/index?orderCode=${orderCode}`,
    });
  } catch (error) {
    if (!completedOrder.value && !accountChanged.value) {
      const key = error instanceof CheckoutNotReadyError ? error.reason : 'submitFailed';
      uni.showToast({ title: t(`checkout.${key}`), icon: 'none' });
    }
  }
}
</script>

<template>
  <view v-if="loading" class="flex flex-col items-center justify-center min-h-screen bg-bg-page">
    <text class="text-slate-400 text-sm">{{ $t('common.loading') }}</text>
  </view>

  <view
    v-else
    class="flex flex-col border-0 border-t-1 border-solid border-gray-100 bg-bg-page min-h-screen"
  >
    <scroll-view scroll-y class="flex-1 pb-30">
      <view v-if="context" class="bg-white">
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
              <text class="text-slate-950 text-base font-medium">{{
                $t('checkout.addAddress')
              }}</text>
              <text class="text-slate-400 text-sm">{{ $t('checkout.addAddressDesc') }}</text>
            </view>

            <view v-else class="flex flex-col gap-1">
              <text class="text-slate-950 text-sm font-medium">{{
                $t('checkout.noAddressNeeded')
              }}</text>
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

      <view v-if="items.length" class="bg-white mt-2 px-4 py-4 flex flex-col gap-4">
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
              <text class="text-brand text-base font-bold">
                {{ formatCurrency(item.price, { withSpace: true }) }}
              </text>
              <text class="text-slate-400 text-sm">x {{ item.quantity }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="pricingFailed && !checkoutLocked">
        <AppLoadError :text="pricingFailureText" @retry="refreshCheckoutContext" />
        <view class="flex justify-center pb-6" @tap="goModifyCheckout">
          <text class="text-brand text-sm">{{ $t('checkout.modifyItems') }}</text>
        </view>
      </view>
      <view
        v-if="submissionUncertain || accountChanged"
        class="bg-white mt-2 px-4 py-3 text-xs text-slate-500 leading-relaxed"
      >
        {{ t(accountChanged ? 'checkout.accountChanged' : 'checkout.submitUncertain') }}
      </view>
      <view v-if="context" class="bg-white mt-2 px-4">
        <view class="flex items-center justify-between py-4">
          <text class="text-slate-950 text-sm">{{ $t('checkout.productAmount') }}</text>
          <text class="text-slate-950 text-sm">
            {{ formatCurrency(saleTotalAmount, { withSpace: true }) }}
          </text>
        </view>

        <view
          class="flex items-center justify-between py-4 border-0 border-t border-solid border-slate-50"
        >
          <text class="text-slate-950 text-sm">{{ $t('checkout.shippingFee') }}</text>
          <text class="text-slate-950 text-sm">
            {{
              !isShippingRequired
                ? $t('checkout.noShipping')
                : shippingFee > 0
                  ? formatCurrency(shippingFee, { withSpace: true })
                  : $t('checkout.freeShipping')
            }}
          </text>
        </view>

        <view
          v-if="shippingDetails.length"
          class="flex items-center justify-between py-4 border-0 border-t border-solid border-slate-50"
        >
          <text class="text-slate-950 text-sm">{{ $t('checkout.shippingMethod') }}</text>
          <text class="text-slate-500 text-sm text-right max-w-60 line-clamp-2">
            {{
              shippingDetails[0].shippingRateName ||
              shippingDetails[0].description ||
              $t('checkout.standardShipping')
            }}
          </text>
        </view>

        <view class="flex items-center gap-3 py-4 border-0 border-t border-solid border-slate-50">
          <text class="text-slate-950 text-sm shrink-0">{{ $t('checkout.remark') }}</text>
          <input
            v-model="remark"
            class="flex-1 text-sm text-slate-950"
            :placeholder="$t('checkout.remarkPlaceholder')"
            placeholder-style="color: #cbd5e1"
            :maxlength="200"
            :disabled="checkoutLocked"
          />
        </view>
      </view>

      <view v-if="context" class="bg-white mt-2 px-4 py-4 flex items-center justify-end gap-2">
        <text class="text-slate-500 text-xs">{{
          $t('checkout.totalItems', { count: totalQuantity })
        }}</text>
        <view class="flex items-center">
          <text class="text-slate-950 text-sm">{{ $t('checkout.totalAmount') }}</text>
          <text class="text-brand text-xl font-bold">
            {{ formatCurrency(payableAmount, { withSpace: true }) }}
          </text>
        </view>
      </view>
    </scroll-view>

    <view
      class="fixed bottom-0 left-0 right-0 z-10 bg-white border-0 border-t border-solid border-slate-100 px-4 pt-3 flex items-center justify-between pb-safe"
    >
      <view class="flex flex-col gap-0.5">
        <view class="flex items-baseline gap-0.5">
          <text v-if="context" class="text-brand text-sm font-bold">{{ currencySymbol }}</text>
          <text class="text-brand text-6 font-bold">
            {{ context ? formatPrice(payableAmount) : '--' }}
          </text>
        </view>
        <text v-if="totalDiscountAmount > 0" class="text-slate-400 text-2.5">
          {{ $t('checkout.discount', { amount: formatCurrency(totalDiscountAmount) }) }}
        </text>
      </view>

      <view
        class="flex items-center justify-center rounded-3 px-8 py-3"
        :class="
          submitting || syncingContext || (!pricingVerified && !checkoutLocked)
            ? 'opacity-60 bg-brand'
            : 'bg-brand'
        "
        @tap="handleSubmit"
      >
        <text class="text-white text-base font-medium">
          {{
            accountChanged
              ? $t('checkout.returnCart')
              : completedOrder
                ? $t('paymentResult.viewOrder')
                : submissionUncertain
                  ? $t('checkout.reviewOrders')
                  : submitting
                    ? $t('checkout.submitting')
                    : syncingContext
                      ? $t('cart.updating')
                      : $t('checkout.submit')
          }}
        </text>
      </view>
    </view>
  </view>
</template>
