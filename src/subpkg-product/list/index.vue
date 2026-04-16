<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { productApi } from '@/api/modules/product';
import { ICON_COLOR } from '@/helpers/icon';
import type { ProductResponse } from '@halo-dev/api-client';
import type { FilterGroup, FilterValue } from '@/types/filter';
import type { ProductListQuery } from '@/api/modules/product';
import type { ListResult } from '@/types/api';
import ProductFilter from '@/components/business/ProductFilter.vue';
import AppLoading from '@/components/common/AppLoading.vue';
import AppEmpty from '@/components/common/AppEmpty.vue';
import AppListFooter from '@/components/common/AppListFooter.vue';
import ProductCard from '@/components/business/ProductCard.vue';
import { useCart } from '@/hooks/useCart';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { useScrollViewPullRefresh } from '@/hooks/usePullRefresh';
import { useInfiniteQuery, useQuery } from '@/hooks/useRequest';
import { isExternalProduct, openExternalProduct } from '@/helpers/product';

const categoryId = ref<number | undefined>(undefined);
const categoryName = ref('');
const searchKeyword = ref('');

const searchBarText = ref('');

function goToSearch() {
  uni.navigateTo({
    url: `/subpkg-product/search/index?keyword=${encodeURIComponent(searchKeyword.value)}`,
  });
}

function goToSearchClear() {
  uni.navigateTo({ url: '/subpkg-product/search/index' });
}

const showFilter = ref(false);
const filterValue = ref<FilterValue>({});
const filterGroups = ref<FilterGroup[]>([]);
const { run: runFilterOptionsQuery } = useQuery<FilterGroup[], { categoryId?: number }>(
  (params) => productApi.getFilterOptions(params.categoryId),
  { immediate: false },
);

async function loadFilterOptions() {
  try {
    filterGroups.value = (await runFilterOptionsQuery({ categoryId: categoryId.value })) ?? [];
  } catch {
    filterGroups.value = [];
  }
}

onLoad((options) => {
  if (options?.categoryId) {
    const id = Number(options.categoryId);
    categoryId.value = id;
    filterValue.value = { categoryId: id };
  }
  if (options?.categoryName) {
    categoryName.value = decodeURIComponent(options.categoryName);
    uni.setNavigationBarTitle({ title: categoryName.value });
    searchBarText.value = categoryName.value;
  }
  if (options?.keyword) {
    const kw = decodeURIComponent(options.keyword);
    searchKeyword.value = kw;
    searchBarText.value = kw;
    uni.setNavigationBarTitle({ title: `"${kw}"` });
  }
  void loadPageData();
});

type SortType = 'default' | 'sales' | 'price_asc' | 'price_desc';
const sortType = ref<SortType>('default');

function toNumberOrUndefined(value: string | number | undefined) {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function selectSort(type: SortType) {
  if (type === 'price_asc' || type === 'price_desc') {
    if (sortType.value === 'price_asc') {
      sortType.value = 'price_desc';
    } else {
      sortType.value = 'price_asc';
    }
  } else {
    sortType.value = type;
  }
  refreshProducts();
}

const sortParam = computed(() => {
  switch (sortType.value) {
    case 'sales':
      return ['salesCount,desc'];
    case 'price_asc':
      return ['minPrice,asc'];
    case 'price_desc':
      return ['minPrice,desc'];
    default:
      return undefined;
  }
});

interface ProductListParams {
  categoryId?: number;
  keyword?: string;
  sort?: ProductListQuery['sort'];
  minPrice?: number;
  maxPrice?: number;
}

const PAGE_SIZE = 10;
const {
  list: products,
  loading,
  loadingMore,
  hasMore,
  loadMore,
  run: runProducts,
} = useInfiniteQuery<ListResult<ProductResponse>, ProductResponse, ProductListParams>(
  (page: number, size: number, params: ProductListParams) =>
    productApi.getProducts({
      page,
      size,
      categoryId: params.categoryId,
      keyword: params.keyword,
      sort: params.sort,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
    }),
  {
    immediate: false,
    pageSize: PAGE_SIZE,
    getItems: (res) => res.items ?? [],
    getHasMore: (res) => res.hasNext ?? false,
  },
);
const {
  isInitialLoading: isInitialProductsLoading,
  showInitialLoading: showInitialProductsLoading,
  markLoaded: markProductsLoaded,
} = useInitialLoading(loading, { delay: 120, minDuration: 180 });

const isLastPage = computed(() => !hasMore.value);

function buildProductParams(): ProductListParams {
  const activeCategoryId = toNumberOrUndefined(filterValue.value.categoryId) ?? categoryId.value;
  return {
    categoryId: activeCategoryId,
    keyword: searchKeyword.value || undefined,
    sort: sortParam.value,
    minPrice: filterValue.value.minPrice,
    maxPrice: filterValue.value.maxPrice,
  };
}

async function refreshProducts() {
  await runProducts(buildProductParams());
}

async function loadPageData() {
  try {
    await Promise.allSettled([loadFilterOptions(), refreshProducts()]);
  } finally {
    markProductsLoaded();
  }
}

function onScrollToLower() {
  loadMore();
}

function onFilterConfirm(val: FilterValue) {
  filterValue.value = val;
  refreshProducts();
}

const { addToCart } = useCart();

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

const { refresherTriggered, onRefresherRefresh, resetRefresher } =
  useScrollViewPullRefresh(loadPageData);
</script>

<template>
  <view class="flex flex-col h-screen bg-bg-page">
    <view class="shrink-0 bg-white border-b border-solid border-slate-100">
      <view class="flex items-center gap-2 p-3">
        <view
          v-if="!searchBarText"
          class="flex flex-1 items-center gap-2 bg-slate-100 rounded-full px-4 py-1.5"
          @tap="goToSearch"
        >
          <TIcon name="search" v-bind="{ size: '28rpx', color: ICON_COLOR.muted }" />
          <text class="flex-1 text-sm text-slate-400">{{ $t('home.searchPlaceholder') }}</text>
        </view>
        <view
          v-else
          class="flex flex-1 items-center gap-2 bg-slate-100 rounded-full px-4 py-1.5"
          @tap="goToSearch"
        >
          <TIcon name="search" v-bind="{ size: '28rpx', color: ICON_COLOR.muted }" />
          <view
            class="flex items-center gap-1 bg-slate-200 rounded-1 px-2 py-0.5 shrink-0 max-w-[60%]"
          >
            <text
              class="text-slate-700 text-xs max-w-30 overflow-hidden text-ellipsis whitespace-nowrap"
            >
              {{ searchBarText }}
            </text>
            <view @tap.stop="goToSearchClear">
              <TIcon name="close" v-bind="{ size: '22rpx', color: ICON_COLOR.default }" />
            </view>
          </view>
          <view class="flex-1" />
        </view>
        <view
          class="flex items-center justify-center w-9 h-9 rounded-full"
          :class="Object.keys(filterValue).length > 0 ? 'bg-brand/10' : 'bg-slate-100'"
          @tap="showFilter = true"
        >
          <TIcon
            name="filter"
            v-bind="{
              size: '36rpx',
              color: Object.keys(filterValue).length > 0 ? ICON_COLOR.brand : ICON_COLOR.default,
            }"
          />
        </view>
      </view>

      <view class="flex items-center h-10">
        <view
          class="flex flex-1 items-center justify-center h-full"
          :class="sortType === 'default' ? 'border-0 border-b border-solid border-brand' : ''"
          @tap="selectSort('default')"
        >
          <text
            class="text-sm font-medium"
            :class="sortType === 'default' ? 'text-brand' : 'text-slate-500'"
          >
            {{ $t('list.sort.default') }}
          </text>
        </view>

        <view
          class="flex flex-1 items-center justify-center h-full"
          :class="sortType === 'sales' ? 'border-0 border-b border-solid border-brand' : ''"
          @tap="selectSort('sales')"
        >
          <text
            class="text-sm font-medium"
            :class="sortType === 'sales' ? 'text-brand' : 'text-slate-500'"
          >
            {{ $t('list.sort.sales') }}
          </text>
        </view>

        <view
          class="flex flex-1 items-center justify-center gap-2 h-full"
          :class="
            sortType === 'price_asc' || sortType === 'price_desc'
              ? 'border-0 border-b border-solid border-brand'
              : ''
          "
          @tap="selectSort('price_asc')"
        >
          <text
            class="text-sm font-medium"
            :class="
              sortType === 'price_asc' || sortType === 'price_desc'
                ? 'text-brand'
                : 'text-slate-500'
            "
          >
            {{ $t('list.sort.price') }}
          </text>
          <view class="flex flex-col items-center gap-0.5">
            <text
              class="text-2 leading-none"
              :class="sortType === 'price_asc' ? 'text-brand' : 'text-slate-300'"
            >
              ▲
            </text>
            <text
              class="text-2 leading-none"
              :class="sortType === 'price_desc' ? 'text-brand' : 'text-slate-300'"
            >
              ▼
            </text>
          </view>
        </view>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="flex-1 overflow-hidden"
      lower-threshold="100"
      refresher-enabled
      :refresher-triggered="refresherTriggered"
      @refresherrefresh="onRefresherRefresh"
      @refresherrestore="resetRefresher"
      @refresherabort="resetRefresher"
      @scrolltolower="onScrollToLower"
    >
      <view class="px-3 pt-3 pb-6">
        <AppLoading v-if="showInitialProductsLoading" variant="product" :rows="3" />

        <view v-else-if="isInitialProductsLoading" class="min-h-1" />

        <template v-else>
          <view v-if="products.length" class="grid grid-cols-2 gap-3">
            <ProductCard
              v-for="product in products"
              :key="product.id"
              :product="product"
              @select="goToProduct"
              @add-cart="handleAddToCart"
            />
          </view>

          <AppEmpty v-else :text="$t('list.empty')" />

          <AppListFooter :loading="loadingMore" :has-more="!isLastPage" :total="products.length" />
        </template>
      </view>
    </scroll-view>

    <ProductFilter
      v-model:visible="showFilter"
      :filter-groups="filterGroups"
      :initial-value="filterValue"
      @confirm="onFilterConfirm"
    />
  </view>
</template>
