<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import TToast from '@tdesign/uniapp/toast/toast.vue';
import type { ToastOptionsType } from '@tdesign/uniapp/toast/index.js';
import { useAppConfig } from '@/config';
import { checkoutApi } from '@/api/modules/checkout';
import { guardCurrentPageAccess, navigateToPage } from '@/helpers/auth';
import { ICON_COLOR } from '@/helpers/icon';
import { addressApi } from '@/api/modules/address';
import { useQuery } from '@/hooks/useRequest';
import { formatPrice, formatCurrency, maskPhone, joinName, joinAddress } from '@/utils/format';
import { getSpecText } from '@/helpers/order';
import type {
  CheckoutItemResponse,
  MpCheckoutSubmitRequest,
  PrepareCheckoutRequest,
  UserAddressUpsertRequest,
  UserAddressResponse,
} from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import CheckoutPromotions from '@/components/business/coupon/CheckoutPromotions.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import { useCheckoutPromotions } from '@/composables/useCheckoutPromotions';
import type { PromotionSelection } from '@/composables/useCheckoutPromotions';
import { isHaloProblem } from '@/utils/error';
import { CheckoutSubmissionUncertainError } from '@/helpers/checkout';

// From cart: items=[{ cartItemId, quantity }]
// From buy now: variantId=10&quantity=2
interface CheckoutPrepareItemPayload {
  cartItemId?: number;
  productVariantId?: number;
  quantity: number;
}

const loading = ref(true);
const submitting = ref(false);
const submissionUncertain = ref(false);
const completedOrderCode = ref('');
const checkoutLocked = computed(
  () => submitting.value || submissionUncertain.value || Boolean(completedOrderCode.value),
);
const promotionToast = ref<{ show: (options: ToastOptionsType) => void } | null>(null);
const { t } = useI18n();
const { currencySymbol } = useAppConfig().business;
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
const {
  context,
  syncing: syncingContext,
  verified: pricingVerified,
  failed: pricingFailed,
  error: promotionError,
  selection: promotionSelection,
  supported: promotionsSupported,
  refresh: prepareCheckout,
  apply: applyPromotions,
} = useCheckoutPromotions(basePreparePayload, syncAddressByContext);

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
        item.quantity <= 0 ||
        !(createPayload?.source === 'CART' ? item.cartItemId : item.productVariantId),
    )
  ) {
    uni.showToast({ title: t('checkout.invalidParams'), icon: 'none' });
    loading.value = false;
    hasInitialized.value = true;
    return;
  }

  basePreparePayload.value = createPayload;

  try {
    await loadAddresses();
    await refreshCheckoutContext(selectedAddress.value?.id);
  } catch {
    uni.showToast({ title: t('checkout.initFailed'), icon: 'none' });
  } finally {
    loading.value = false;
    hasInitialized.value = true;
  }
});

onShow(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (checkoutLocked.value) {
    return;
  }
  if (!hasInitialized.value || loading.value || syncingContext.value || !basePreparePayload.value) {
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
  () =>
    (context.value?.calculateResult?.totalDiscountAmount ?? 0) +
    (context.value?.calculateResult?.couponDiscountAmount ?? 0) +
    (context.value?.calculateResult?.discountAmount ?? 0),
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
    if (checkoutLocked.value) {
      return;
    }
    if (addresses?.length) {
      const preferredId = selectedAddress.value?.id ?? context.value?.selectedAddressId;
      localAddresses.value = addresses;
      selectedAddress.value =
        addresses.find((a) => a.id === preferredId) ??
        addresses.find((a) => a.isDefault) ??
        addresses[0];
      return;
    }
    localAddresses.value = [];
  } catch {
    // ignore
    if (!checkoutLocked.value) {
      localAddresses.value = [];
    }
  }
}

function syncAddressByContext(ctx: NonNullable<typeof context.value>) {
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
  if (checkoutLocked.value) {
    return;
  }
  await loadAddresses();
  if (checkoutLocked.value || !isShippingRequired.value) {
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
  if (checkoutLocked.value) {
    return;
  }
  await prepareCheckout(selectedAddressId);
}

async function updatePromotions(selection: PromotionSelection) {
  if (checkoutLocked.value || syncingContext.value) {
    return;
  }
  const codeChanged = selection.discountCode?.trim() !== promotionSelection.value.discountCode;
  const success = await applyPromotions(selection);
  if (!success) {
    const problem = promotionError.value;
    promotionToast.value?.show({
      message:
        codeChanged && isHaloProblem(problem) && problem.status === 400
          ? t('coupon.codeUnavailable')
          : t('coupon.updateFailed'),
      placement: 'bottom',
      duration: 2500,
    });
  }
}

function goSelectCoupons() {
  if (syncingContext.value || checkoutLocked.value) {
    return;
  }
  const pages = getCurrentPages();
  const currentPage = pages.at(-1) as any;
  currentPage.couponCheckout = {
    payload: {
      ...basePreparePayload.value,
      selectedAddressId: selectedAddress.value?.id ?? context.value?.selectedAddressId,
    },
    context: context.value,
    selection: promotionSelection.value,
  };
  currentPage.onCouponsSelected = (ids: number[]) => {
    void updatePromotions({ ...promotionSelection.value, customerCouponIds: ids });
  };
  navigateToPage('/subpkg-mine/coupons/index?mode=select');
}

function goSelectAddress() {
  if (checkoutLocked.value || syncingContext.value || !isShippingRequired.value) {
    return;
  }
  const pages = getCurrentPages();
  const currentPage = pages.at(-1) as any;

  navigateToPage('/subpkg-mine/address-list/index?mode=select');

  if (currentPage) {
    currentPage.onAddressSelected = (address: UserAddressResponse) => {
      applySelectedAddress(address).catch(() => {
        uni.showToast({ title: t('checkout.updateAddressFailed'), icon: 'none' });
      });
    };
  }
}

async function applySelectedAddress(address: UserAddressResponse) {
  if (checkoutLocked.value) {
    return;
  }
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
  if (completedOrderCode.value) {
    navigateToPage(`/subpkg-trade/order-detail/index?orderCode=${completedOrderCode.value}`);
    return;
  }
  if (submissionUncertain.value) {
    navigateToPage('/subpkg-trade/order-list/index');
    return;
  }
  if (submitting.value) {
    return;
  }
  if (syncingContext.value || !pricingVerified.value) {
    uni.showToast({ title: t('checkout.syncing'), icon: 'none' });
    return;
  }
  if (isShippingRequired.value && !hasAddress.value) {
    uni.showToast({ title: t('checkout.selectAddress'), icon: 'none' });
    return;
  }
  if (!context.value) {
    return;
  }
  const submitSource = context.value.source === 'BUY_NOW' ? 'BUY_NOW' : 'CART';
  const submitItems = buildSubmitItems(submitSource);
  if (!submitItems.length) {
    uni.showToast({ title: t('checkout.emptyItems'), icon: 'none' });
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
    const { order } = await checkoutApi.submitOrder(payload, context.value.id);

    if (!order?.orderCode) {
      uni.showToast({ title: t('checkout.submitMissingOrderCode'), icon: 'none' });
      return;
    }
    completedOrderCode.value = order.orderCode;
    uni.redirectTo({
      url:
        order.paymentStatus === 'PAID'
          ? `/subpkg-trade/payment-result/index?status=success&orderCode=${order.orderCode}`
          : `/subpkg-trade/payment/index?orderCode=${order.orderCode}`,
    });
  } catch (error) {
    if (error instanceof CheckoutSubmissionUncertainError) {
      submissionUncertain.value = true;
      return;
    }
    uni.showToast({ title: t('checkout.submitFailed'), icon: 'none' });
    submitting.value = false;
    await refreshCheckoutContext(selectedAddress.value?.id);
  } finally {
    submitting.value = false;
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
              <text class="text-brand text-base font-bold">
                {{ formatCurrency(item.price, { withSpace: true }) }}
              </text>
              <text class="text-slate-400 text-sm">x {{ item.quantity }}</text>
            </view>
          </view>
        </view>
      </view>

      <CheckoutPromotions
        v-if="promotionsSupported && context?.calculateResult"
        :result="context.calculateResult"
        :selection="promotionSelection"
        :busy="syncingContext || checkoutLocked"
        @select-coupons="goSelectCoupons"
        @apply="updatePromotions"
      />
      <AppLoadError
        v-if="pricingFailed"
        :text="t('coupon.pricingFailed')"
        @retry="refreshCheckoutContext(selectedAddress?.id)"
      />
      <view
        v-if="submissionUncertain"
        class="bg-white mt-2 px-4 py-3 text-xs text-slate-500 leading-relaxed"
      >
        {{ t('checkout.submitUncertain') }}
      </view>
      <view class="bg-white mt-2 px-4">
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

      <view class="bg-white mt-2 px-4 py-4 flex items-center justify-end gap-2">
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
          <text class="text-brand text-sm font-bold">{{ currencySymbol }}</text>
          <text class="text-brand text-6 font-bold">
            {{ formatPrice(payableAmount) }}
          </text>
        </view>
        <text v-if="totalDiscountAmount > 0" class="text-slate-400 text-2.5">
          {{ $t('checkout.discount', { amount: formatCurrency(totalDiscountAmount) }) }}
        </text>
      </view>

      <view
        class="flex items-center justify-center rounded-3 px-8 py-3"
        :class="
          submitting ||
          syncingContext ||
          (!pricingVerified && !submissionUncertain && !completedOrderCode)
            ? 'opacity-60 bg-brand'
            : 'bg-brand'
        "
        @tap="handleSubmit"
      >
        <text class="text-white text-base font-medium">
          {{
            completedOrderCode
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
    <TToast ref="promotionToast" t-class="toast-wide" />
  </view>
</template>
