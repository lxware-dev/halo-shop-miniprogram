<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import AppTabBar from '@/components/common/AppTabBar.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import { useMenuButton } from '@/composables/useMenuButton';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { useScrollViewPullRefresh } from '@/hooks/usePullRefresh';
import { useFetch } from '@/hooks/useRequest';
import { categoryApi } from '@/api/modules/category';
import type { ProductCategoryResponse } from '@halo-dev/api-client';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import { ICON_COLOR } from '@/helpers/icon';
import { useTabBar } from '@/composables/useTabBar';

const systemInfo = uni.getSystemInfoSync();
const { width } = useMenuButton();
const { totalHeight } = useTabBar();
const contentPaddingBottom = computed(() => `${totalHeight + 16}px`);

const statusBarStyle = computed(() => ({
  paddingTop: `${systemInfo.statusBarHeight ?? 0}px`,
  marginRight: `${width}px`,
}));

const {
  data: categories,
  loading,
  error: categoriesError,
  send: reloadCategories,
} = useFetch(categoryApi.getCategoryTrees(), false);
const {
  isInitialLoading: isInitialCategoriesLoading,
  showInitialLoading: showInitialCategoriesLoading,
  markLoaded: markCategoriesLoaded,
} = useInitialLoading(loading, { delay: 120, minDuration: 180 });

const activeCategory = ref<ProductCategoryResponse | null>(null);

watch(
  categories,
  (val) => {
    if (!val?.length) {
      activeCategory.value = null;
      return;
    }
    const currentId = activeCategory.value?.id;
    activeCategory.value = val.find((item) => item.id === currentId) ?? val[0];
  },
  { immediate: true },
);

function selectCategory(cat: ProductCategoryResponse) {
  activeCategory.value = cat;
}

function goToSearch() {
  uni.navigateTo({ url: '/subpkg-product/search/index' });
}

function goToSubCategory(item: { id?: number; name?: string }) {
  uni.navigateTo({
    url: `/subpkg-product/list/index?categoryId=${item.id}&categoryName=${encodeURIComponent(item.name ?? '')}`,
  });
}

async function loadCategories() {
  try {
    await reloadCategories();
  } finally {
    markCategoriesLoaded();
  }
}

onMounted(() => {
  void loadCategories();
});

const { refresherTriggered, onRefresherRefresh, resetRefresher } =
  useScrollViewPullRefresh(loadCategories);
</script>

<template>
  <view class="flex flex-col h-screen bg-white">
    <view class="flex items-center gap-3 px-4 pb-3 z-20" :style="statusBarStyle">
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
        <text class="text-slate-400 text-sm flex-1">{{ $t('category.searchPlaceholder') }}</text>
      </view>
    </view>

    <view v-if="showInitialCategoriesLoading" class="flex flex-1 overflow-hidden">
      <view
        class="w-24 h-full shrink-0 border-t-0 border-r-1.5 border-solid border-slate-100 bg-slate-50"
      >
        <view :style="{ paddingBottom: contentPaddingBottom }">
          <view
            v-for="idx in 8"
            :key="idx"
            class="relative flex items-center justify-center px-4 py-5"
          >
            <view v-if="idx === 1" class="absolute inset-0 bg-white" />
            <view
              v-if="idx === 1"
              class="w-1 absolute left-0 top-1/4 bottom-1/4 bg-brand/40 rounded-r-full"
            />
            <view
              class="relative z-1 h-3.5 rounded-full skeleton-shimmer"
              :class="idx % 3 === 0 ? 'w-10' : idx % 2 === 0 ? 'w-12' : 'w-14'"
            />
          </view>
        </view>
      </view>

      <view class="flex-1 bg-white h-full">
        <view class="p-4 grid grid-cols-3 gap-2" :style="{ paddingBottom: contentPaddingBottom }">
          <view v-for="idx in 9" :key="idx" class="flex flex-col items-center gap-2">
            <view
              class="pb-full w-full overflow-hidden rounded-2xl relative bg-brand/5 border border-solid border-brand/10"
            >
              <view class="absolute inset-0 skeleton-shimmer" />
            </view>
            <view
              class="h-3 rounded-full skeleton-shimmer"
              :class="idx % 3 === 0 ? 'w-10' : idx % 2 === 0 ? 'w-12' : 'w-14'"
            />
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="isInitialCategoriesLoading" class="flex-1" />

    <view v-else-if="categoriesError" class="flex-1 flex flex-col items-center justify-center">
      <AppLoadError :text="$t('category.loadFailed')" @retry="loadCategories" />
    </view>

    <view v-else class="flex flex-1 overflow-hidden">
      <scroll-view
        scroll-y
        class="w-24 h-full shrink-0 border-t-0 border-r-1.5 border-solid border-slate-100 bg-slate-50"
      >
        <view :style="{ paddingBottom: contentPaddingBottom }">
          <view
            v-for="cat in categories"
            :key="cat.id"
            class="relative flex items-center justify-center px-4 py-5"
            @tap="selectCategory(cat)"
          >
            <view v-if="activeCategory?.id === cat.id" class="absolute inset-0 bg-white" />
            <view
              v-if="activeCategory?.id === cat.id"
              class="w-1 absolute left-0 top-1/4 bottom-1/4 bg-brand rounded-r-full"
            />
            <text
              class="relative z-1 text-center text-sm font-medium w-14 line-clamp-2"
              :class="
                activeCategory?.id === cat.id
                  ? 'text-brand font-bold'
                  : 'text-slate-500 font-medium'
              "
            >
              {{ cat.name }}
            </text>
          </view>
        </view>
      </scroll-view>

      <scroll-view
        scroll-y
        class="flex-1 bg-white h-full"
        refresher-enabled
        :refresher-triggered="refresherTriggered"
        @refresherrefresh="onRefresherRefresh"
        @refresherrestore="resetRefresher"
        @refresherabort="resetRefresher"
      >
        <view class="p-4 flex flex-col gap-4" :style="{ paddingBottom: contentPaddingBottom }">
          <view v-if="!activeCategory?.children?.length" class="flex flex-col items-center py-20">
            <text class="text-slate-400 text-sm">{{ $t('category.empty') }}</text>
          </view>

          <view v-else class="grid grid-cols-3 gap-2">
            <view
              v-for="item in activeCategory.children"
              :key="item.id"
              class="flex flex-col items-center gap-2"
              @tap="goToSubCategory({ id: item.id, name: item.name })"
            >
              <view
                class="pb-full w-full overflow-hidden rounded-2xl relative bg-brand/5 border border-solid border-brand/10"
              >
                <image
                  v-if="item.image"
                  :src="formatImageUrlWithThumbnail(item.image, 'S')"
                  mode="aspectFill"
                  class="absolute inset-0 w-full h-full"
                />
                <view v-else class="absolute inset-0 flex items-center justify-center">
                  <TIcon name="image" v-bind="{ size: '36rpx', color: ICON_COLOR.muted }" />
                </view>
              </view>
              <text
                class="text-slate-600 font-medium text-center text-xs line-height-tight line-clamp-2"
              >
                {{ item.name }}
              </text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <AppTabBar />
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
</style>
