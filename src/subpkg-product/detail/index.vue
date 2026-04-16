<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import AppContactButton from '@/components/common/AppContactButton.vue';
import RichContent from '@/components/common/RichContent.vue';
import { productApi } from '@/api/modules/product';
import { useAppConfig } from '@/config';
import { ICON_COLOR } from '@/helpers/icon';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { usePageShare } from '@/hooks/usePageShare';
import { useQuery } from '@/hooks/useRequest';
import SkuSelector from '@/components/business/SkuSelector.vue';
import type {
  ProductResponse,
  ProductVariantResponse,
  SpecDefinitionPayload,
} from '@halo-dev/api-client';
import { formatImageUrl, formatImageUrlWithThumbnail, formatShareImageUrl } from '@/helpers/image';
import {
  isExternalProduct as checkIsExternalProduct,
  openExternalProduct,
} from '@/helpers/product';

const productId = ref<number>(0);
const appConfig = useAppConfig();
const { contactServiceEnabled, currencySymbol } = appConfig.business;
const { t } = useI18n();

function truncateShareText(text: string, maxLength: number) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return '';
  }
  return normalizedText.length > maxLength
    ? `${normalizedText.slice(0, Math.max(maxLength - 1, 1))}…`
    : normalizedText;
}

const {
  data: product,
  loading,
  error: productError,
  run: runProduct,
} = useQuery<
  ProductResponse,
  { id: number; includeVariants: boolean; includeContent: boolean; includeImages: boolean }
>(
  (params) =>
    productApi.getProduct(params.id, {
      includeVariants: params.includeVariants,
      includeContent: params.includeContent,
      includeImages: params.includeImages,
    }),
  { immediate: false },
);
const loadError = computed(() => !!productError.value);

const selectedSpecs = ref<Record<string, string>>({});

const selectedVariant = computed<ProductVariantResponse | null>(() => {
  if (!product.value?.productVariants?.length) {
    return null;
  }
  const variants = product.value.productVariants;
  return (
    variants.find((v) => {
      if (!v.specValues?.length) {
        return true;
      }
      return v.specValues.every((sv) => {
        return selectedSpecs.value[sv.name ?? ''] === sv.value;
      });
    }) ??
    variants[0] ??
    null
  );
});

const displayPrice = computed(() => {
  if (selectedVariant.value?.price != null) {
    return selectedVariant.value.price.toFixed(2);
  }
  if (product.value?.minPrice != null) {
    return product.value.minPrice.toFixed(2);
  }
  return '0.00';
});

const originalPrice = computed(() => {
  if (selectedVariant.value?.originalPrice != null) {
    return selectedVariant.value.originalPrice.toFixed(2);
  }
  if (product.value?.minOriginalPrice != null) {
    return product.value.minOriginalPrice.toFixed(2);
  }
  return null;
});

/**
 * Determine whether a variant is purchasable:
 * 1. It must exist in the productVariants list
 * 2. status must be PUBLISHED
 * 3. When trackInventory is true, stock must be > 0
 */
function isVariantAvailable(variant: ProductVariantResponse): boolean {
  if (variant.status !== 'PUBLISHED') {
    return false;
  }
  if (variant.trackInventory && (variant.stock ?? 0) <= 0) {
    return false;
  }
  return true;
}

/**
 * Set of unavailable spec values; key is the spec name, value is the set of disabled values under that spec
 *
 * Rule: for a value v in dimension A, keep the selected values of all other dimensions (non-A),
 * then check whether there is at least one available variant that both includes v and matches all other selected spec values.
 * If not, disable that value.
 */
const disabledSpecValues = computed<Record<string, Set<string>>>(() => {
  const result: Record<string, Set<string>> = {};
  const variants = product.value?.productVariants ?? [];
  const specDef = product.value?.specDefinition ?? [];

  specDef.forEach((def) => {
    const specName = def.name ?? '';
    const disabledValues = new Set<string>();

    def.values?.forEach((valDef) => {
      const specValue = valDef.value ?? '';

      // Build the full hypothetical spec map for an assumed selection: keep selected values from other dimensions and set the current dimension to the candidate value
      const hypotheticalSpecs: Record<string, string> = {
        ...selectedSpecs.value,
        [specName]: specValue,
      };

      // Among all variants, find one that matches every dimension in hypotheticalSpecs
      const matchedVariants = variants.filter((v) => {
        return Object.entries(hypotheticalSpecs).every(([name, value]) =>
          v.specValues?.some((sv) => sv.name === name && sv.value === value),
        );
      });

      if (matchedVariants.length === 0 || matchedVariants.every((v) => !isVariantAvailable(v))) {
        disabledValues.add(specValue);
      }
    });

    result[specName] = disabledValues;
  });

  return result;
});

/**
 * Image list (cover + images)
 */
const imageList = computed(() => {
  const imgs: string[] = [];
  if (product.value?.coverImageUrl) {
    imgs.push(product.value.coverImageUrl);
  }
  if (product.value?.images?.length) {
    product.value.images.forEach((img) => {
      if (img && !imgs.includes(img)) {
        imgs.push(img);
      }
    });
  }
  return imgs;
});

function resolveProductShareTitle() {
  const productTitle = product.value?.title?.trim();
  const priceText = displayPrice.value !== '0.00' ? `${currencySymbol}${displayPrice.value}` : '';
  if (productTitle && priceText) {
    return `${truncateShareText(productTitle, 18)} | ${priceText}`;
  }
  if (productTitle) {
    const productDescription = truncateShareText(product.value?.description ?? '', 12);
    return productDescription
      ? `${truncateShareText(productTitle, 14)} | ${productDescription}`
      : productTitle;
  }
  return appConfig.app.name;
}

function resolveProductShareImage() {
  const productImage = product.value?.coverImageUrl || imageList.value[0];
  if (productImage) {
    return formatImageUrlWithThumbnail(productImage, 'L');
  }
  return formatShareImageUrl(appConfig.app.logo);
}

const { showShareMenu, createShareAppMessage, createShareTimeline } = usePageShare(() => ({
  title: resolveProductShareTitle(),
  path: productId.value
    ? `/subpkg-product/detail/index?id=${productId.value}`
    : '/pages/home/index',
  query: productId.value ? `id=${productId.value}` : '',
  imageUrl: resolveProductShareImage(),
}));

onLoad((options) => {
  showShareMenu();
  if (options?.id) {
    productId.value = Number(options.id);
    loadProduct();
  }
});

onShareAppMessage(() => createShareAppMessage());

onShareTimeline(() => createShareTimeline());

const currentImage = ref(0);
/**
 * Text description of selected specs (used for list rows)
 */
const selectedSpecText = computed(() => {
  const entries = Object.entries(selectedSpecs.value).filter(([, v]) => v);
  if (!entries.length) {
    return t('product.selectSpec');
  }
  return entries.map(([k, v]) => `${k}: ${v}`).join('，');
});

const showSpecPanel = ref(false);
const quantity = ref(1);
const isExternalProduct = computed(() => checkIsExternalProduct(product.value));

async function loadProduct() {
  if (!productId.value) {
    return;
  }
  try {
    const data = await runProduct({
      id: productId.value,
      includeVariants: true,
      includeContent: true,
      includeImages: true,
    });
    if (!data) {
      return;
    }

    // Prefer the first available variant as the default selection
    const firstAvailableVariant = data.productVariants?.find((v) => isVariantAvailable(v));
    const defaultVariant = firstAvailableVariant ?? data.productVariants?.[0];
    if (defaultVariant?.specValues?.length) {
      const specs: Record<string, string> = {};
      defaultVariant.specValues.forEach((sv) => {
        if (sv.name) {
          specs[sv.name] = sv.value ?? '';
        }
      });
      selectedSpecs.value = specs;
    }
  } catch {
    // ignore
  }
}

const { requireAuth } = useAuth();
const { addToCart, totalCount, goToCart } = useCart();
const addingToCart = ref(false);

async function handleAddToCart() {
  if (isExternalProduct.value) {
    openExternalProduct(product.value);
    return;
  }
  if (addingToCart.value) {
    return;
  }
  if (!selectedVariant.value?.id) {
    uni.showToast({ title: t('product.chooseSpec'), icon: 'none' });
    return;
  }
  addingToCart.value = true;
  try {
    await addToCart(selectedVariant.value.id, quantity.value);
    showSpecPanel.value = false;
  } finally {
    addingToCart.value = false;
  }
}

function handleBuyNow() {
  if (isExternalProduct.value) {
    openExternalProduct(product.value);
    return;
  }
  if (!selectedVariant.value?.id) {
    uni.showToast({ title: t('product.chooseSpec'), icon: 'none' });
    return;
  }
  const targetUrl = `/subpkg-trade/confirm/index?variantId=${selectedVariant.value.id}&quantity=${quantity.value}`;
  if (!requireAuth({ redirectUrl: targetUrl })) {
    return;
  }
  showSpecPanel.value = false;
  uni.navigateTo({ url: targetUrl });
}

function previewImage(index: number) {
  const urls = imageList.value.map((img) => formatImageUrl(img));
  if (!urls.length) {
    return;
  }
  uni.previewImage({ urls, current: urls[index] ?? urls[0] });
}

function onBannerChange(e: { detail: { current: number } }) {
  currentImage.value = e.detail.current;
}
</script>

<template>
  <view v-if="loading" class="flex flex-col items-center justify-center min-h-screen bg-bg-page">
    <view class="text-slate-400 text-sm">{{ $t('common.loading') }}</view>
  </view>

  <view v-else-if="product" class="flex flex-col bg-bg-page min-h-screen pb-27.5">
    <view class="relative w-full bg-white h-94">
      <swiper
        v-if="imageList.length"
        class="w-full h-94"
        circular
        :interval="4000"
        :duration="400"
        @change="onBannerChange"
      >
        <swiper-item v-for="(img, idx) in imageList" :key="idx">
          <image
            :src="formatImageUrlWithThumbnail(img, 'L')"
            mode="aspectFill"
            class="w-full h-94"
            @tap="previewImage(idx)"
          />
        </swiper-item>
      </swiper>
      <view v-else class="w-full flex items-center justify-center bg-slate-100 h-94">
        <TIcon name="image" v-bind="{ size: '80rpx', color: ICON_COLOR.subtle }" />
      </view>

      <view
        v-if="imageList.length > 1"
        class="flex items-center justify-center absolute bottom-4 right-4 bg-white/40 rounded-full px-3 py-1 backdrop-blur-4"
      >
        <text class="text-white text-xs font-medium">
          {{ currentImage + 1 }} / {{ imageList.length }}
        </text>
      </view>
    </view>

    <view class="bg-white mt-2 px-4 pt-5 pb-2">
      <view class="flex items-baseline gap-2 mb-4">
        <text class="text-brand text-3xl font-bold leading-none tracking-[-1.5rpx]">
          {{ currencySymbol }}{{ displayPrice }}
        </text>
        <text
          v-if="originalPrice && originalPrice !== displayPrice"
          class="text-slate-400 text-sm line-through"
        >
          {{ currencySymbol }}{{ originalPrice }}
        </text>
      </view>

      <view class="flex items-center gap-2 mb-4">
        <view class="flex items-center bg-brand/10 rounded-full px-2 py-1 text-center">
          <text class="text-brand text-xs font-bold tracking-[1rpx]">{{
            $t('product.freeShipping')
          }}</text>
        </view>
        <view v-if="false" class="flex items-center bg-brand/10 rounded-full px-2 py-1 text-center">
          <text class="text-brand text-xs font-bold tracking-[1rpx]">{{
            $t('product.returnPolicy')
          }}</text>
        </view>
      </view>

      <view class="mb-1">
        <text class="text-slate-950 text-xl font-bold leading-snug">
          {{ product.title }}
        </text>
      </view>

      <view v-if="product.description">
        <text class="text-slate-500 text-sm leading-relaxed">
          {{ product.description }}
        </text>
      </view>
    </view>

    <view class="bg-white mt-2 px-4">
      <view
        v-if="!isExternalProduct"
        class="flex items-center justify-between py-4 border-0 border-b-1 border-slate-100 border-solid"
        @tap="showSpecPanel = true"
      >
        <view class="flex items-center gap-2">
          <text class="text-slate-400 text-sm">{{ $t('product.selectLabel') }}</text>
          <text class="text-slate-950 text-sm font-medium">{{ selectedSpecText }}</text>
        </view>
        <TIcon name="chevron-right" v-bind="{ size: '28rpx', color: ICON_COLOR.muted }" />
      </view>
      <view v-if="product.specDefinition?.length" class="flex items-center justify-between py-4">
        <view class="flex items-center gap-2">
          <text class="text-slate-400 text-sm">{{ $t('product.specLabel') }}</text>
          <text class="text-slate-950 text-sm font-medium flex-1">
            {{ product.specDefinition.map((d: SpecDefinitionPayload) => d.name).join('，') }}
          </text>
        </view>
      </view>
    </view>

    <view
      v-if="product.content"
      class="flex flex-col gap-4 px-4 bg-white mt-2 flex items-center justify-center py-4"
    >
      <text class="text-slate-400 text-xs font-medium tracking-[2.4rpx]">
        {{ $t('product.detailTitle') }}
      </text>
      <RichContent
        :html="product.content"
        class-name="w-full text-slate-700 text-sm leading-[1.8]"
      />
    </view>

    <SkuSelector
      v-if="!isExternalProduct"
      v-model:visible="showSpecPanel"
      :cover-image="selectedVariant?.imageUrl ?? ''"
      :fallback-cover-image="product.coverImageUrl ?? ''"
      :price="displayPrice"
      :stock="selectedVariant?.stock ?? -1"
      :track-inventory="selectedVariant?.trackInventory ?? false"
      :selected-text="selectedSpecText"
      :spec-definition="product.specDefinition ?? []"
      :selected-specs="selectedSpecs"
      :disabled-spec-values="disabledSpecValues"
      :quantity="quantity"
      @update:selected-specs="selectedSpecs = $event"
      @update:quantity="quantity = $event"
    >
      <view class="flex gap-3">
        <view
          class="flex flex-1 items-center justify-center py-3.5 border border-solid border-brand rounded-full"
          :class="addingToCart ? 'opacity-60' : ''"
          @tap="handleAddToCart"
        >
          <text class="text-brand text-base font-bold">{{ $t('product.addToCart') }}</text>
        </view>
        <view
          class="flex flex-1 items-center justify-center py-3.5 bg-brand rounded-full"
          @tap="handleBuyNow"
        >
          <text class="text-white text-base font-bold">{{ $t('product.buyNow') }}</text>
        </view>
      </view>
    </SkuSelector>
  </view>

  <view
    v-else-if="loadError"
    class="flex flex-col items-center justify-center min-h-screen bg-bg-page"
  >
    <AppLoadError @retry="loadProduct" />
  </view>

  <view v-else class="flex flex-col items-center justify-center min-h-screen bg-bg-page">
    <text class="text-slate-400 text-sm">{{ $t('product.notFound') }}</text>
  </view>

  <view
    v-if="product"
    class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 border-t border-solid border-slate-100 px-4 pt-3.5 pb-safe-sm backdrop-blur-md"
  >
    <view class="flex items-center gap-4">
      <view class="flex items-center" :class="contactServiceEnabled ? 'gap-5 pr-2' : ''">
        <AppContactButton v-if="contactServiceEnabled" class="flex flex-col items-center gap-1">
          <TIcon name="service" v-bind="{ size: '42rpx', color: ICON_COLOR.default }" />
          <text class="text-slate-500 text-xs">{{ $t('product.customerService') }}</text>
        </AppContactButton>

        <view class="flex flex-col items-center gap-1 relative" @tap="goToCart">
          <TIcon name="cart" v-bind="{ size: '40rpx', color: ICON_COLOR.default }" />
          <view
            v-if="totalCount > 0"
            class="absolute w-3 h-3 p-0.5 -top-1 -right-1 bg-brand rounded-full flex items-center justify-center"
          >
            <text class="text-white text-sm font-medium">
              {{ totalCount > 99 ? '99+' : totalCount }}
            </text>
          </view>
          <text class="text-slate-500 text-xs">{{ $t('product.cart') }}</text>
        </view>
      </view>

      <view v-if="isExternalProduct" class="flex flex-1 rounded-full overflow-hidden">
        <view
          class="flex flex-1 items-center justify-center py-3 bg-brand"
          @tap="openExternalProduct(product)"
        >
          <text class="text-white text-sm font-bold">{{ $t('product.goBuy') }}</text>
        </view>
      </view>
      <view v-else class="flex flex-1 rounded-full overflow-hidden">
        <view
          class="flex flex-1 items-center justify-center py-3 bg-brand/10"
          @tap="showSpecPanel = true"
        >
          <text class="text-brand text-sm font-bold">{{ $t('product.addToCart') }}</text>
        </view>
        <view
          class="flex flex-1 items-center justify-center py-3 bg-brand"
          @tap="showSpecPanel = true"
        >
          <text class="text-white text-sm font-bold">{{ $t('product.buyNow') }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
