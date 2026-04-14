<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { onLoad, onReachBottom, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppLoading from '@/components/common/AppLoading.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import AppListFooter from '@/components/common/AppListFooter.vue';
import ProductCard from '@/components/business/ProductCard.vue';
import { useAppConfig } from '@/config';
import { useFetch, useInfiniteQuery } from '@/hooks/useRequest';
import { useSmoothLoading } from '@/hooks/useSmoothLoading';
import { usePageShare } from '@/hooks/usePageShare';
import { usePagePullRefresh } from '@/hooks/usePullRefresh';
import { homeApi } from '@/api/modules/home';
import type { ProductResponse, Banner, QuickEntry } from '@halo-dev/api-client';
import type { ListResult } from '@/types/api';
import { useMenuButton } from '@/composables/useMenuButton';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { navigateToPage as authNavigateToPage } from '@/helpers/auth';
import { useCart } from '@/hooks/useCart';
import { formatImageUrlWithThumbnail, formatShareImageUrl } from '@/helpers/image';
import { ICON_COLOR } from '@/helpers/icon';
import { isExternalProduct, openExternalProduct } from '@/helpers/product';
import { useTabBar } from '@/composables/useTabBar';

const BACKEND_FIRST_PAGE = 1;
const MAX_QUICK_ENTRIES = 8;
const systemInfo = uni.getSystemInfoSync();
const appConfig = useAppConfig();
const { width } = useMenuButton();
const { totalHeight } = useTabBar();
const { addToCart } = useCart();
const contentPaddingBottom = computed(() => `${totalHeight + 8}px`);

function truncateShareText(text: string, maxLength: number) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return '';
  }
  return normalizedText.length > maxLength
    ? `${normalizedText.slice(0, Math.max(maxLength - 1, 1))}…`
    : normalizedText;
}

const statusBarStyle = computed(() => {
  return {
    paddingTop: `${systemInfo.statusBarHeight ?? 0}px`,
    marginRight: `${width}px`,
  };
});

function sortByPriorityDesc<T extends { priority?: number }>(items: T[] = []) {
  const sorted: T[] = [];
  for (const item of items) {
    const currentPriority = item.priority ?? 0;
    const insertIndex = sorted.findIndex((existing) => (existing.priority ?? 0) < currentPriority);
    if (insertIndex === -1) {
      sorted.push(item);
      continue;
    }
    sorted.splice(insertIndex, 0, item);
  }
  return sorted;
}

const {
  data: bannersRaw,
  loading: bannersLoading,
  send: reloadBanners,
} = useFetch(homeApi.getBanners());
const showBannersLoading = useSmoothLoading(bannersLoading, { delay: 120, minDuration: 180 });
const banners = computed<Banner[]>(() => sortByPriorityDesc(bannersRaw.value ?? []));
const {
  data: quickEntriesRaw,
  loading: quickEntriesLoading,
  send: reloadQuickEntries,
} = useFetch(homeApi.getQuickEntries());
const showQuickEntriesLoading = useSmoothLoading(quickEntriesLoading, {
  delay: 120,
  minDuration: 180,
});
const quickEntries = computed<QuickEntry[]>(() =>
  sortByPriorityDesc(quickEntriesRaw.value ?? []).slice(0, MAX_QUICK_ENTRIES),
);

const PAGE_SIZE = 10;
const {
  list: products,
  hasMore,
  loading: productsLoading,
  loadingMore,
  error: productsErrorRaw,
  run: runProducts,
  refresh: refreshProducts,
  loadMore,
} = useInfiniteQuery<ListResult<ProductResponse>, ProductResponse, Record<string, never>>(
  (page: number, size: number, _params: Record<string, never>) =>
    homeApi.getRecommendProducts(page + BACKEND_FIRST_PAGE, size),
  {
    pageSize: PAGE_SIZE,
    immediate: false,
    getItems: (res) => res.items ?? [],
    getHasMore: (res) => res.hasNext ?? false,
  },
);
const productsError = computed(() => !!productsErrorRaw.value);
const isLastPage = computed(() => !hasMore.value);
const hasBanners = computed(() => banners.value.length > 0);
const productItems = computed<ProductResponse[]>(() => products.value ?? []);
const hasProductItems = computed(() => productItems.value.length > 0);
const productTotal = computed(() => productItems.value.length);
const isProductsLoadingMore = computed(() => loadingMore.value);
const showProductsLoading = useSmoothLoading(productsLoading, { delay: 120, minDuration: 180 });
const primaryBanner = computed(() => banners.value[0] ?? null);
const primaryShareProduct = computed(() => productItems.value[0] ?? null);

function resolveHomeShareTitle() {
  const bannerTitle = primaryBanner.value?.title?.trim();
  const bannerDescription = primaryBanner.value?.description?.trim();
  if (bannerTitle && bannerDescription) {
    return `${truncateShareText(bannerTitle, 12)} | ${truncateShareText(bannerDescription, 12)}`;
  }
  if (bannerTitle) {
    return truncateShareText(bannerTitle, 24);
  }
  const brandDescription = truncateShareText(appConfig.app.brandDescription ?? '', 18);
  return brandDescription ? `${appConfig.app.name} | ${brandDescription}` : appConfig.app.name;
}

function resolveHomeShareImage() {
  if (primaryBanner.value?.imageUrl) {
    return formatImageUrlWithThumbnail(primaryBanner.value.imageUrl, 'L');
  }
  if (primaryShareProduct.value?.coverImageUrl) {
    return formatImageUrlWithThumbnail(primaryShareProduct.value.coverImageUrl, 'L');
  }
  return formatShareImageUrl(appConfig.app.logo);
}

const { showShareMenu, createShareAppMessage, createShareTimeline } = usePageShare(() => ({
  title: resolveHomeShareTitle(),
  path: '/pages/home/index',
  imageUrl: resolveHomeShareImage(),
}));

onLoad(() => {
  showShareMenu();
});

onShareAppMessage(() => createShareAppMessage());

onShareTimeline(() => createShareTimeline());

onMounted(() => {
  runProducts({});
});

onReachBottom(() => {
  loadMore();
});

async function refreshHomeData() {
  await Promise.allSettled([reloadBanners(), reloadQuickEntries(), refreshProducts()]);
}

async function retryHomeData() {
  await refreshHomeData();
}

usePagePullRefresh(refreshHomeData);

const currentBanner = ref(0);
function onBannerChange(e: { detail: { current: number } }) {
  currentBanner.value = e.detail.current;
}

const HTTP_LINK_REGEXP = /^https?:\/\//i;

function normalizePath(rawPath: string) {
  const value = rawPath.trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('/')) {
    return value;
  }
  return `/${value}`;
}

function mapBannerLinkType(linkType?: string) {
  const type = linkType?.trim().toLowerCase() ?? '';
  if (['none', 'noop'].includes(type)) {
    return 'none';
  }
  if (['product', 'goods', 'sku', 'detail'].includes(type)) {
    return 'product';
  }
  if (['category', 'catalog'].includes(type)) {
    return 'category';
  }
  if (['page', 'path', 'route', 'internal'].includes(type)) {
    return 'page';
  }
  if (['external', 'url', 'h5', 'web'].includes(type)) {
    return 'external';
  }
  return type;
}

function navigateToPage(url: string) {
  const path = normalizePath(url);
  if (!path) {
    return;
  }
  authNavigateToPage(path);
}

function navigateByLink(linkType?: string, linkValue?: string, title?: string) {
  const type = mapBannerLinkType(linkType);
  const value = (linkValue ?? '').trim();
  switch (type) {
    case 'product':
      if (!value) {
        return;
      }
      uni.navigateTo({ url: `/subpkg-product/detail/index?id=${encodeURIComponent(value)}` });
      return;
    case 'category': {
      if (!value) {
        return;
      }
      const categoryNameQuery = title ? `&categoryName=${encodeURIComponent(title)}` : '';
      uni.navigateTo({
        url: `/subpkg-product/list/index?categoryId=${encodeURIComponent(value)}${categoryNameQuery}`,
      });
      return;
    }
    case 'page':
      if (!value) {
        return;
      }
      navigateToPage(value);
      return;
    case 'external':
      if (!value) {
        return;
      }
      if (HTTP_LINK_REGEXP.test(value)) {
        uni.showToast({
          title: '请配置 H5 承载页后再跳转',
          icon: 'none',
          duration: 2000,
        });
        return;
      }
      navigateToPage(value);
      break;
    case 'none':
      break;
    default:
      break;
  }
}

function onBannerTap(banner: Banner) {
  navigateByLink(banner.linkType, banner.linkValue);
}

function goToSearch() {
  uni.navigateTo({ url: '/subpkg-product/search/index' });
}

function goToProduct(product: ProductResponse) {
  uni.navigateTo({ url: `/subpkg-product/detail/index?id=${product.id}` });
}

function handleAddToCart(product: ProductResponse) {
  if (isExternalProduct(product)) {
    openExternalProduct(product);
    return;
  }
  const variants = product.productVariants ?? [];
  if (variants.length === 1 && variants[0].id) {
    addToCart(variants[0].id);
  } else {
    uni.navigateTo({ url: `/subpkg-product/detail/index?id=${product.id}` });
  }
}

function onQuickEntry(entry: QuickEntry) {
  navigateByLink(entry.linkType, entry.linkValue, entry.title);
}
</script>

<template>
  <view class="flex flex-col px-4 min-h-screen bg-white">
    <view class="sticky top-0 w-full z-20 flex flex-col backdrop-blur-sm">
      <view class="flex items-center gap-3 pb-3" :style="statusBarStyle">
        <view
          class="flex flex-1 items-center h-10 bg-slate-100 rounded-full px-4 gap-2"
          @tap="goToSearch"
        >
          <TIcon
            name="search"
            v-bind="{
              size: '28rpx',
              color: ICON_COLOR.muted,
            }"
          />
          <text class="text-slate-400 text-sm flex-1">搜索商品</text>
        </view>
      </view>
    </view>

    <view class="flex flex-col gap-2" :style="{ paddingBottom: contentPaddingBottom }">
      <view
        v-if="showBannersLoading || hasBanners"
        class="rounded-3xl overflow-hidden shadow-sm relative mb-5"
      >
        <view v-if="showBannersLoading" class="w-full h-38 skeleton-shimmer-bg rounded-3xl" />
        <swiper
          v-else-if="hasBanners"
          class="w-full h-38"
          circular
          autoplay
          :interval="4000"
          :duration="500"
          @change="onBannerChange"
        >
          <swiper-item v-for="(banner, idx) in banners" :key="idx">
            <view class="relative w-full h-full" @tap="onBannerTap(banner)">
              <image
                :src="formatImageUrlWithThumbnail(banner.imageUrl, 'L')"
                mode="aspectFill"
                class="w-full h-full"
              />
              <view class="absolute inset-0 flex flex-col justify-center px-6 banner-overlay">
                <text class="text-white text-xs font-bold tracking-widest mb-1">
                  {{ banner.title }}
                </text>
                <text class="text-white text-xl font-bold leading-snug mb-2">
                  {{ banner.description }}
                </text>
                <view class="flex items-center bg-white rounded-full px-3 py-1.5 self-start">
                  <text class="text-brand text-xs font-bold text-center">立即选购</text>
                </view>
              </view>
            </view>
          </swiper-item>
        </swiper>
        <view
          v-if="hasBanners"
          class="absolute bottom-3 left-0 right-0 flex justify-center items-center gap-1.5"
        >
          <view
            v-for="(_, idx) in banners"
            :key="idx"
            class="rounded-full"
            :class="idx === currentBanner ? 'w-2 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'"
          />
        </view>
      </view>

      <view v-if="showQuickEntriesLoading || quickEntries.length > 0" class="rounded-4 pb-5">
        <view
          v-if="showQuickEntriesLoading"
          class="grid grid-cols-[repeat(4,max-content)] justify-between gap-y-3"
        >
          <view v-for="idx in 8" :key="idx" class="flex flex-col items-center gap-1.5">
            <view class="w-14 h-14 rounded-full skeleton-shimmer-bg" />
            <view class="w-12 h-3 rounded-full skeleton-shimmer-bg" />
          </view>
        </view>

        <view v-else class="grid grid-cols-[repeat(4,max-content)] justify-between gap-y-3">
          <view
            v-for="(entry, idx) in quickEntries"
            :key="`${entry.linkType ?? 'none'}-${entry.linkValue ?? ''}-${idx}`"
            class="flex flex-col items-center gap-1.5"
            @tap="onQuickEntry(entry)"
          >
            <view
              class="w-14 h-14 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center"
            >
              <image
                v-if="entry.imageUrl"
                :src="formatImageUrlWithThumbnail(entry.imageUrl, 'S')"
                mode="aspectFill"
                class="w-full h-full"
              />
              <TIcon v-else name="app" v-bind="{ size: '40rpx', color: ICON_COLOR.muted }" />
            </view>
            <text class="text-slate-600 text-xs font-medium text-center w-16 line-clamp-2">
              {{ entry.title }}
            </text>
          </view>
        </view>
      </view>
      <view>
        <view class="mb-4">
          <text class="text-slate-950 font-bold">为您推荐</text>
        </view>

        <AppLoading v-if="showProductsLoading" variant="product" :rows="2" />

        <template v-else>
          <AppLoadError v-if="productsError" @retry="retryHomeData" />

          <view v-else-if="hasProductItems" class="grid grid-cols-2 gap-3">
            <ProductCard
              v-for="product in productItems"
              :key="product.id"
              class="h-full"
              :product="product"
              @select="goToProduct"
              @add-cart="handleAddToCart"
            />
          </view>

          <view v-else class="flex flex-col items-center py-10">
            <text class="text-slate-400 text-sm">暂无商品</text>
          </view>

          <AppListFooter
            :loading="isProductsLoadingMore"
            :has-more="!isLastPage"
            :total="productTotal"
            no-more-text="— 已经到底了 —"
          />
        </template>
      </view>
    </view>

    <AppTabBar />
  </view>
</template>

<style lang="scss" scoped>
.banner-overlay {
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0) 100%);
}

.skeleton-shimmer-bg {
  background: linear-gradient(90deg, #f1f5f9 25%, #e8edf3 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer-anim 1.6s ease-in-out infinite;
}

@keyframes skeleton-shimmer-anim {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
