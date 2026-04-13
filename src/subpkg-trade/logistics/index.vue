<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import AppContactButton from '@/components/common/AppContactButton.vue';
import { logisticsApi } from '@/api/modules/logistics';
import { useAppConfig } from '@/config';
import { useQuery } from '@/hooks/useRequest';
import type { LogisticsInfo } from '@/types/logistics';
import { formatImageUrlWithThumbnail } from '@/helpers/image';

const { contactServiceEnabled } = useAppConfig().business;
const orderCode = ref('');
const {
  data: logistics,
  loading,
  run: runLogistics,
} = useQuery<LogisticsInfo, { orderCode: string }>(
  (params) => logisticsApi.getLogistics(params.orderCode),
  { immediate: false },
);

onLoad(async (options) => {
  if (options?.orderCode) {
    orderCode.value = options.orderCode;
    try {
      await runLogistics({ orderCode: orderCode.value });
    } catch {
      // ignore
    }
  }
});

const statusLabel = computed(() => {
  const s = logistics.value?.status;
  const MAP: Record<string, string> = {
    IN_TRANSIT: '运输中',
    DELIVERED: '已签收',
    PENDING: '待揽收',
    PICKED_UP: '已揽收',
    EXCEPTION: '物流异常',
  };
  return s ? (MAP[s] ?? '运输中') : '运输中';
});

const deliveryEstimate = computed(() => logistics.value?.deliveryEstimate ?? '预计明天送达');

function copyTrackingNumber() {
  const num = logistics.value?.trackingNumber;
  if (!num) {
    return;
  }
  uni.setClipboardData({
    data: num,
    success() {
      uni.showToast({ title: '已复制', icon: 'none' });
    },
  });
}

function subscribeUpdates() {
  uni.showToast({ title: '订阅成功', icon: 'none' });
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page pb-20">
    <view v-if="loading" class="flex items-center justify-center h-[60vh]">
      <view
        class="logistics-spinner w-7.5 h-7.5 rounded-1/2 border-0.5 border-solid border-slate-200 border-t-brand"
      />
    </view>

    <template v-else-if="logistics">
      <view class="relative h-48 overflow-hidden bg-slate-200">
        <image
          class="absolute inset-0 w-full h-full opacity-80"
          src="https://api.mapbox.com/styles/v1/mapbox/light-v10/static/121.4737,31.2304,10/750x400@2x?access_token=placeholder"
          mode="aspectFill"
        />
        <view class="absolute inset-0 map-fade-overlay" />

        <view
          class="absolute left-4 right-4 bottom-4 bg-white rounded-2 flex items-center gap-4 p-4 border-0.5 border-solid border-slate-100 shadow-xs"
        >
          <view class="w-10 h-10 bg-brand/10 rounded-1.5 flex items-center justify-center shrink-0">
            <TIcon name="car" v-bind="{ size: '40rpx', color: '#ee2b2b' }" />
          </view>
          <view class="flex-1 min-w-0">
            <view class="flex items-center justify-between mb-0.5">
              <text class="text-xl font-medium text-slate-950 leading-relaxed">{{
                statusLabel
              }}</text>
              <text class="text-xs text-brand">{{ deliveryEstimate }}</text>
            </view>
            <text class="text-sm text-slate-500 leading-tight">
              {{ logistics.carrier }}：{{ logistics.trackingNumber }}
            </text>
          </view>
        </view>
      </view>

      <view class="px-4 mt-3">
        <view
          class="bg-white rounded-2 flex items-start gap-4 p-4.5 border-0.5 border-solid border-slate-100 shadow-xs"
        >
          <image
            class="w-16 h-16 rounded-1 bg-slate-100 shrink-0"
            :src="formatImageUrlWithThumbnail(logistics.productImage, 'S')"
            mode="aspectFill"
          />
          <view class="flex-1 min-w-0 flex flex-col gap-2">
            <view style="min-height: 77rpx">
              <text class="text-sm font-medium text-slate-950 line-clamp-2 leading-snug">{{
                logistics.productTitle
              }}</text>
            </view>
            <view class="flex items-center justify-between">
              <text class="text-xs text-slate-400">共{{ logistics.totalQuantity }}件商品</text>
              <view
                class="flex items-center gap-1 bg-slate-100 rounded-full px-3 py-1"
                @tap="copyTrackingNumber"
              >
                <TIcon name="file-copy" v-bind="{ size: '22rpx', color: '#475569' }" />
                <text class="text-sm text-slate-950 leading-none">复制单号</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="px-4 mt-3">
        <view class="bg-white rounded-2 p-6 border-0.5 border-solid border-slate-100 shadow-xs">
          <view class="flex items-center gap-2 mb-6">
            <TIcon name="map" v-bind="{ size: '30rpx', color: '#ee2b2b' }" />
            <text class="text-base font-medium text-slate-950">订单追踪</text>
          </view>

          <view class="flex flex-col">
            <view
              v-for="(track, index) in logistics.tracks"
              :key="index"
              class="flex items-start relative"
              :class="index < logistics.tracks.length - 1 ? 'pb-8' : ''"
            >
              <view class="w-4 flex flex-col items-center shrink-0 mr-4">
                <view
                  v-if="index === 0"
                  class="relative w-4 h-4 flex items-center justify-center shrink-0 mt-1.5"
                >
                  <view class="absolute w-4 h-4 rounded-full bg-brand/20" />
                  <view
                    class="w-4 h-4 relative rounded-1/2 bg-brand flex items-center justify-center after:block after:w-1.5 after:h-1.5 after:rounded-1/2 after:bg-white"
                  />
                </view>
                <view
                  v-else
                  class="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0 mt-1.75 mx-0.75"
                />
              </view>

              <view
                v-if="index < logistics.tracks.length - 1"
                class="absolute bg-slate-200 w-0.5 left-1.875 top-6 bottom-0"
              />

              <view class="flex-1 min-w-0 pt-1">
                <text
                  class="text-sm font-medium leading-tight block mb-1"
                  :class="index === 0 ? 'text-brand' : 'text-slate-600'"
                  >{{ track.description }}</text
                >
                <text class="text-xs text-slate-400">{{ track.time }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="h-20" />
    </template>

    <view v-else class="flex flex-col items-center justify-center h-[60vh] gap-3">
      <TIcon name="map-off" v-bind="{ size: '100rpx', color: '#cbd5e1' }" />
      <text class="text-sm text-slate-400">暂无物流信息</text>
    </view>

    <view
      class="fixed left-0 right-0 bottom-0 bg-white z-100 border-0 border-t-0.5 border-solid border-slate-100 pb-safe-raw"
    >
      <view class="flex items-center px-4 py-3.5" :class="contactServiceEnabled ? 'gap-3' : ''">
        <AppContactButton
          v-if="contactServiceEnabled"
          class="flex-1 h-11 rounded-2 flex items-center justify-center gap-2 border-0.5 border-solid border-slate-200"
        >
          <TIcon name="service" v-bind="{ size: '28rpx', color: '#334155' }" />
          <text class="text-base font-medium text-slate-700 leading-normal">联系客服</text>
        </AppContactButton>
        <view
          class="h-11 rounded-2 bg-brand flex items-center justify-center gap-2"
          :class="contactServiceEnabled ? 'flex-1' : 'w-full'"
          @tap="subscribeUpdates"
        >
          <TIcon name="notification" v-bind="{ size: '28rpx', color: '#ffffff' }" />
          <text class="text-base font-medium text-white leading-normal">订阅更新</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style>
.logistics-spinner {
  animation: logistics-spin 0.8s linear infinite;
}

@keyframes logistics-spin {
  to {
    transform: rotate(360deg);
  }
}

.map-fade-overlay {
  background: linear-gradient(to top, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 50%);
}
</style>
