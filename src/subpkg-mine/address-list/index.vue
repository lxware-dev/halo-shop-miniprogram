<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { addressApi } from '@/api/modules/address';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { useScrollViewPullRefresh } from '@/hooks/usePullRefresh';
import { sendRequest, useQuery } from '@/hooks/useRequest';
import { buildQuery } from '@/utils/encode';
import { joinName, joinAddress } from '@/utils/format';
import type { UserAddressResponse, UserAddressUpsertRequest } from '@halo-dev/api-client';

/**
 * mode=select means selection mode (entered from checkout);
 * otherwise it is management mode
 */
const mode = ref<'manage' | 'select'>('manage');

onLoad((options) => {
  if (options?.mode === 'select') {
    mode.value = 'select';
  }
  guardCurrentPageAccess();
});

onShow(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  refreshAddresses();
});

const { loading, run: runAddresses } = useQuery<UserAddressResponse[], Record<string, never>>(
  () => addressApi.getAddresses(),
  { immediate: false },
);
const addresses = ref<UserAddressResponse[]>([]);

async function refreshAddresses() {
  try {
    const data = await runAddresses({});
    addresses.value = data ?? [];
  } catch {
    uni.showToast({ title: '加载地址失败', icon: 'none' });
  }
}

const { refresherTriggered, onRefresherRefresh, resetRefresher } = useScrollViewPullRefresh(
  async () => {
    if (!guardCurrentPageAccess()) {
      return;
    }
    await refreshAddresses();
  },
);

function selectAddress(address: UserAddressResponse) {
  if (mode.value !== 'select') {
    return;
  }
  const pages = getCurrentPages();
  const prevPage = pages[pages.length - 2] as any;
  if (prevPage?.onAddressSelected) {
    prevPage.onAddressSelected(address);
  }
  uni.navigateBack();
}

function goEditAddress(address: UserAddressResponse) {
  uni.navigateTo({ url: `/subpkg-mine/address-edit/index?id=${address.id}` });
}

function goAddAddress() {
  uni.navigateTo({ url: '/subpkg-mine/address-edit/index' });
}

// #ifndef APP-PLUS || H5
function importFromPlatform() {
  uni.chooseAddress({
    success(res) {
      const street = [res.streetName, res.detailInfo].filter(Boolean).join('');
      const query = buildQuery({
        importName: res.userName,
        importPhone: res.telNumber,
        importProvince: res.provinceName,
        importCity: res.cityName,
        importDistrict: res.countyName,
        importStreet: street,
        importPostalCode: res.postalCode,
      });
      uni.navigateTo({ url: `/subpkg-mine/address-edit/index?${query}` });
    },
    fail(err) {
      console.error(err);
      if (err?.errMsg?.includes('cancel')) {
        return;
      }
      uni.showToast({ title: '获取地址失败，请手动填写', icon: 'none' });
    },
  });
}
// #endif

function deleteAddress(address: UserAddressResponse) {
  uni.showModal({
    title: '删除地址',
    content: '确定要删除该收货地址吗？',
    success: async (res) => {
      if (res.confirm && address.id != null) {
        try {
          await sendRequest(addressApi.deleteAddress(address.id));
          addresses.value = addresses.value.filter((a) => a.id !== address.id);
          uni.showToast({ title: '删除成功', icon: 'success' });
        } catch {
          uni.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    },
  });
}

function buildAddressUpsertPayload(
  address: UserAddressResponse,
  isDefault: boolean,
): UserAddressUpsertRequest {
  return {
    firstName: address.firstName ?? '',
    lastName: address.lastName ?? '',
    contactPhone: address.contactPhone ?? '',
    provinceCode: address.provinceCode ?? '',
    cityCode: address.cityCode ?? '',
    districtCode: address.districtCode ?? '',
    streetAddress: address.streetAddress ?? '',
    postalCode: address.postalCode ?? '',
    isDefault,
  };
}

const switchingDefaultId = ref<number | null>(null);

async function toggleDefaultAddress(address: UserAddressResponse) {
  if (address.id == null || switchingDefaultId.value === address.id) {
    return;
  }
  const targetIsDefault = !address.isDefault;
  switchingDefaultId.value = address.id;
  try {
    await sendRequest(
      addressApi.updateAddress(address.id, buildAddressUpsertPayload(address, targetIsDefault)),
    );
    addresses.value = addresses.value.map((item) => {
      if (item.id === address.id) {
        return { ...item, isDefault: targetIsDefault };
      }
      if (targetIsDefault) {
        return { ...item, isDefault: false };
      }
      return item;
    });
    uni.showToast({
      title: targetIsDefault ? '已设为默认地址' : '已取消默认地址',
      icon: 'success',
    });
  } catch {
    uni.showToast({ title: '设置默认地址失败', icon: 'none' });
  } finally {
    switchingDefaultId.value = null;
  }
}

function getDisplayName(address: UserAddressResponse): string {
  return joinName(address.lastName, address.firstName);
}

function getFullAddress(address: UserAddressResponse): string {
  return joinAddress(address.province, address.city, address.district, address.streetAddress);
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view v-if="loading" class="flex items-center justify-center py-10">
      <text class="text-slate-400 text-base">加载中...</text>
    </view>

    <template v-else>
      <scroll-view
        v-if="addresses.length"
        scroll-y
        class="flex-1 pb-30"
        refresher-enabled
        :refresher-triggered="refresherTriggered"
        @refresherrefresh="onRefresherRefresh"
        @refresherrestore="resetRefresher"
        @refresherabort="resetRefresher"
      >
        <view
          v-for="address in addresses"
          :key="address.id"
          class="bg-white px-4 py-4 mx-3 mt-3 rounded-2"
          @tap="mode === 'select' ? selectAddress(address) : undefined"
        >
          <view class="min-w-0 flex flex-col gap-2">
            <view class="flex items-center gap-2 flex-wrap">
              <text class="text-slate-950 text-base font-medium shrink-0">
                {{ getDisplayName(address) }}
              </text>
              <text class="text-slate-600 text-base shrink-0">
                {{ address.contactPhone }}
              </text>
              <view
                v-if="address.isDefault"
                class="flex items-center justify-center px-1.5 py-0.5 rounded-1 shrink-0 bg-brand/10"
              >
                <text class="text-brand text-xs">默认</text>
              </view>
            </view>

            <view class="flex items-center justify-center gap-1.5">
              <text class="text-slate-700 text-sm line-height-relaxed flex-1 min-w-0 line-clamp-2">
                {{ getFullAddress(address) }}
              </text>
            </view>

            <view class="flex items-center justify-between pt-2" @tap.stop>
              <view
                class="flex items-center gap-1 py-1"
                :class="switchingDefaultId === address.id ? 'opacity-60' : ''"
                @tap.stop="toggleDefaultAddress(address)"
              >
                <view
                  class="w-3 h-3 rounded-1 border border-solid flex items-center justify-center"
                  :class="address.isDefault ? 'border-brand bg-brand' : 'border-slate-300 bg-white'"
                >
                  <TIcon
                    v-if="address.isDefault"
                    name="check"
                    v-bind="{ size: '16rpx', color: '#ffffff' }"
                  />
                </view>
                <text class="text-slate-600 text-xs">设为默认地址</text>
              </view>

              <view class="flex items-center gap-4">
                <view
                  class="flex items-center justify-center text-xs text-slate-500"
                  @tap.stop="deleteAddress(address)"
                >
                  删除
                </view>
                <view class="w-[1rpx] self-stretch bg-slate-200" />
                <view
                  class="flex items-center justify-center text-xs text-slate-500"
                  @tap.stop="goEditAddress(address)"
                >
                  修改
                </view>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <view v-else class="flex-1 flex flex-col items-center justify-center py-20 gap-3">
        <TIcon name="location" v-bind="{ size: '120rpx', color: '#cbd5e1' }" />
        <text class="text-slate-400 text-base">暂无收货地址</text>
        <text class="text-slate-300 text-xs">点击下方按钮添加地址</text>
      </view>
    </template>

    <view
      class="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-solid border-slate-100 px-4 py-4 pb-safe"
    >
      <!-- #ifndef APP-PLUS || H5 -->
      <view class="flex gap-3">
        <view
          class="flex-1 flex items-center justify-center gap-1.5 bg-brand rounded-1 py-3 shadow-sm"
          @tap="goAddAddress"
        >
          <TIcon name="add" v-bind="{ size: '32rpx', color: '#ffffff' }" />
          <text class="text-white text-base font-medium">新增地址</text>
        </view>
        <view
          class="flex-1 flex items-center justify-center gap-1.5 border border-solid border-brand rounded-1 py-3"
          @tap="importFromPlatform"
        >
          <TIcon name="map" v-bind="{ size: '32rpx', color: '#ee2b2b' }" />
          <text class="text-brand text-base font-medium">一键导入</text>
        </view>
      </view>
      <!-- #endif -->
      <!-- #ifdef APP-PLUS || H5 -->
      <view
        class="flex items-center justify-center gap-2 bg-brand rounded-1 py-3 shadow-sm"
        @tap="goAddAddress"
      >
        <TIcon name="add" v-bind="{ size: '32rpx', color: '#ffffff' }" />
        <text class="text-white text-base font-medium">新增收货地址</text>
      </view>
      <!-- #endif -->
    </view>
  </view>
</template>
