<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { useAppConfig } from '@/config';
import { productApi } from '@/api/modules/product';
import { useQuery } from '@/hooks/useRequest';
import { useSmoothLoading } from '@/hooks/useSmoothLoading';
import { formatPrice } from '@/utils/format';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import type { ProductResponse } from '@halo-dev/api-client';

const keyword = ref('');
const inputFocused = ref(false);
const { currencySymbol } = useAppConfig().business;

onLoad((options) => {
  if (options?.keyword) {
    keyword.value = decodeURIComponent(options.keyword);
  }
  nextTick(() => {
    inputFocused.value = true;
  });
});

function onInput(e: { detail: { value: string } }) {
  keyword.value = e.detail.value;
}

function doNavigate() {
  const kw = keyword.value.trim();
  if (kw) {
    saveHistory(kw);
    uni.navigateTo({ url: `/subpkg-product/list/index?keyword=${encodeURIComponent(kw)}` });
  }
}

function clearInput() {
  keyword.value = '';
}

const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 10;

const history = ref<string[]>([]);

function loadHistory() {
  try {
    const stored = uni.getStorageSync(HISTORY_KEY);
    history.value = stored ? JSON.parse(stored) : [];
  } catch {
    history.value = [];
  }
}

function saveHistory(kw: string) {
  const list = [kw, ...history.value.filter((h) => h !== kw)].slice(0, MAX_HISTORY);
  history.value = list;
  uni.setStorageSync(HISTORY_KEY, JSON.stringify(list));
}

function clearHistory() {
  history.value = [];
  uni.removeStorageSync(HISTORY_KEY);
}

const {
  data: recommendData,
  loading: recommendLoading,
  error: recommendErrorRaw,
  run: runRecommend,
} = useQuery((params: { page: number; size: number }) => productApi.getProducts(params), {
  immediate: false,
});
const recommend = computed<ProductResponse[]>(() => {
  const res: any = recommendData.value;
  return res?.content ?? res?.items ?? [];
});
const recommendError = computed(() => !!recommendErrorRaw.value);
const showRecommendLoading = useSmoothLoading(recommendLoading, { delay: 120, minDuration: 180 });

async function loadRecommend() {
  try {
    await runRecommend({ page: 0, size: 6 });
  } catch {
    // ignore
  }
}

onMounted(() => {
  loadHistory();
  loadRecommend();
});

function selectKeyword(kw: string) {
  keyword.value = kw;
  saveHistory(kw);
  uni.redirectTo({ url: `/subpkg-product/list/index?keyword=${encodeURIComponent(kw)}` });
}

function goToProduct(product: ProductResponse) {
  uni.navigateTo({ url: `/subpkg-product/detail/index?id=${product.id}` });
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="bg-bg-page px-4 pt-4 pb-2">
      <view class="flex items-center gap-2">
        <view class="h-10 flex flex-1 items-center gap-2 bg-slate-200/60 rounded-1.5 px-3">
          <TIcon name="search" v-bind="{ size: '30rpx', color: '#94a3b8' }" />
          <input
            class="flex-1 text-sm text-slate-950 bg-transparent"
            :placeholder="$t('search.placeholder')"
            placeholder-class="text-slate-400"
            :value="keyword"
            :focus="inputFocused"
            confirm-type="search"
            @input="onInput"
            @confirm="doNavigate"
          />
          <view v-if="keyword" @tap="clearInput">
            <TIcon name="close-circle-filled" v-bind="{ size: '30rpx', color: '#94a3b8' }" />
          </view>
        </view>
        <view
          class="shrink-0 flex items-center justify-center rounded-1.5 px-3 py-2 bg-brand"
          @tap="doNavigate"
        >
          <text class="text-white text-sm font-medium">{{ $t('search.action') }}</text>
        </view>
      </view>
    </view>

    <view class="flex flex-col">
      <view v-if="history.length" class="px-4 pt-4 pb-3">
        <view class="flex items-center justify-between mb-3">
          <text class="text-slate-950 text-sm font-medium tracking-[-0.7rpx]">
            {{ $t('search.history') }}
          </text>
          <view @tap="clearHistory">
            <TIcon name="delete" v-bind="{ size: '36rpx', color: '#94a3b8' }" />
          </view>
        </view>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="kw in history"
            :key="kw"
            class="flex items-center justify-center px-3 rounded-full h-7 bg-brand/6 border border-solid border-brand/12"
            @tap="selectKeyword(kw)"
          >
            <text class="text-slate-700 text-xs">{{ kw }}</text>
          </view>
        </view>
      </view>

      <view class="flex items-center justify-center gap-3 pt-4 pb-4 px-4">
        <view class="bg-slate-300 h-[1rpx] w-6" />
        <text class="text-slate-400 text-xs tracking-0.5">{{ $t('search.guessYouLike') }}</text>
        <view class="bg-slate-300 h-[1rpx] w-6" />
      </view>

      <view class="px-3 pb-10">
        <view v-if="showRecommendLoading" class="grid grid-cols-2 gap-3">
          <view v-for="i in 4" :key="i" class="rounded-1.5 overflow-hidden bg-white shadow-sm">
            <view class="w-full bg-slate-100 aspect-square" />
            <view class="p-2.5 flex flex-col gap-1.5">
              <view class="h-3.5 bg-slate-100 rounded-full w-4/5" />
              <view class="h-3.5 bg-slate-100 rounded-full w-2/5" />
            </view>
          </view>
        </view>

        <view v-else-if="recommendError" class="flex flex-col items-center py-8 gap-2">
          <text class="text-slate-400 text-xs">{{ $t('search.loadFailed') }}</text>
          <view
            class="flex items-center justify-center px-4 py-1.5 rounded-full border border-solid border-slate-300"
            @tap="loadRecommend"
          >
            <text class="text-slate-500 text-xs">{{ $t('common.retry') }}</text>
          </view>
        </view>

        <view v-else-if="!recommend.length" class="flex flex-col items-center py-8">
          <text class="text-slate-400 text-xs">{{ $t('search.emptyRecommend') }}</text>
        </view>

        <view v-else class="grid grid-cols-2 gap-3">
          <view
            v-for="product in recommend"
            :key="product.id"
            class="rounded-1.5 overflow-hidden bg-white border border-solid border-slate-100 shadow-sm"
            @tap="goToProduct(product)"
          >
            <view class="w-full overflow-hidden bg-slate-100 aspect-square">
              <image
                :src="formatImageUrlWithThumbnail(product.coverImageUrl, 'S')"
                mode="aspectFill"
                class="w-full h-full"
                lazy-load
              />
            </view>
            <view class="p-2.5 flex flex-col gap-2">
              <text class="text-slate-900 text-xs font-medium leading-snug line-clamp-2">
                {{ product.title }}
              </text>
              <view class="flex items-baseline gap-0.5">
                <text class="text-brand text-2 font-bold">{{ currencySymbol }}</text>
                <text class="text-brand text-4 font-bold leading-none">
                  {{ formatPrice(product.minPrice) }}
                </text>
                <text
                  v-if="product.minOriginalPrice"
                  class="text-slate-400 text-xs line-through ml-0.5"
                >
                  {{ currencySymbol }}{{ formatPrice(product.minOriginalPrice) }}
                </text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
