<script setup lang="ts">
import AppTabBar from '@/components/common/AppTabBar.vue';
import LoginDrawer from '@/components/business/LoginDrawer.vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { computed, ref } from 'vue';
import { ICON_COLOR } from '@/helpers/icon';
import { onShow } from '@dcloudio/uni-app';
import { useFetch } from '@/hooks/useRequest';
import { userApi } from '@/api';
import { navigateToPage } from '@/helpers/auth';
import { useUserStore } from '@/store';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import { useSmoothLoading } from '@/hooks/useSmoothLoading';
import { useTabBar } from '@/composables/useTabBar';

const showLoginDrawer = ref(false);

const userStore = useUserStore();
const { totalHeight } = useTabBar();
const contentPaddingBottom = computed(() => `${totalHeight + 24}px`);
const isLoggedIn = computed(() => userStore.isLoggedIn);

const {
  data: detailedUser,
  loading: userLoading,
  send: refreshProfile,
} = useFetch(userApi.getProfile(), false);
const showUserLoading = useSmoothLoading(userLoading, { delay: 120, minDuration: 180 });

const user = computed(() => detailedUser.value?.user ?? userStore.profile);

onShow(() => {
  if (isLoggedIn.value && !user.value) {
    refreshProfile()
      .then((profile) => {
        userStore.setProfile(profile.user);
      })
      .catch(() => {});
  }
});

const displayName = computed(
  () => user.value?.spec?.displayName ?? (isLoggedIn.value ? '用户' : '未登录'),
);

const userId = computed(() => {
  const name = user.value?.metadata?.name ?? '';
  return name.length > 20 ? `${name.slice(0, 20)}...` : name;
});

const userAvatar = computed(() => user.value?.spec?.avatar ?? '');

const orderTabs = [
  { label: '待付款', icon: 'wallet', tab: 1 },
  { label: '待发货', icon: 'send', tab: 2 },
  { label: '待收货', icon: 'secured', tab: 3 },
];

const menuGroups = [
  [
    { label: '收货地址', icon: 'location', path: '/subpkg-mine/address-list/index' },
    { label: '帮助与客服', icon: 'help-circle', path: '/subpkg-mine/help/index' },
    { label: '关于我们', icon: 'info-circle', path: '/subpkg-mine/about/index' },
  ],
];

function onOrderTab(tab: { label: string; tab: number }) {
  navigateToPage(`/subpkg-trade/order-list/index?tab=${tab.tab}`);
}

function onMenu(item: { label: string; path: string }) {
  if (item.path) {
    navigateToPage(item.path);
  } else {
    uni.showToast({ title: item.label, icon: 'none' });
  }
}

function onLogin() {
  showLoginDrawer.value = true;
}

function onLoginSuccess() {
  refreshProfile();
}

function onEditProfile() {
  navigateToPage('/subpkg-mine/settings/index');
}

function onViewAllOrders() {
  navigateToPage('/subpkg-trade/order-list/index?tab=0');
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="flex flex-col px-5 py-10 rounded-b-md bg-brand-gradient">
      <view v-if="!isLoggedIn" class="flex items-center gap-4 w-full" @tap="onLogin">
        <view
          class="w-18 h-18 rounded-full shrink-0 flex items-center justify-center border-3 border-solid border-white/50 bg-white/15"
        >
          <TIcon name="user-filled" v-bind="{ size: '72rpx', color: 'rgba(255,255,255,0.9)' }" />
        </view>
        <view class="flex flex-col flex-1 min-w-0 gap-1.5">
          <text class="text-white font-bold text-lg leading-relaxed">登录 / 注册</text>
          <text class="text-white/70 text-xs">登录后享受更多权益</text>
        </view>
        <TIcon name="chevron-right" v-bind="{ size: '32rpx', color: 'rgba(255,255,255,0.6)' }" />
      </view>
      <view v-else class="flex items-center gap-4 w-full" @tap="onEditProfile">
        <view
          class="w-18 h-18 rounded-full shrink-0 overflow-hidden flex items-center justify-center border-3 border-solid border-white/50 bg-white/15"
        >
          <image
            v-if="userAvatar"
            :src="formatImageUrlWithThumbnail(userAvatar, 'S')"
            mode="aspectFill"
            class="w-full h-full"
          />
          <TIcon
            v-else
            name="user-filled"
            v-bind="{ size: '72rpx', color: 'rgba(255,255,255,0.9)' }"
          />
        </view>

        <view class="flex flex-col flex-1 min-w-0 gap-1">
          <template v-if="showUserLoading">
            <view class="h-6.5 w-22 rounded-1.5 bg-white/25" />
            <view class="h-4 w-17.5 rounded-1 bg-white/15" />
          </template>
          <template v-else>
            <text
              class="text-white font-bold text-xl leading-relaxed -tracking-[0.5rpx] truncate max-w-48"
            >
              {{ displayName }}
            </text>
            <view class="flex items-center gap-1">
              <view class="flex items-center px-1.5 py-0.5 rounded-full bg-white/18">
                <text class="text-white/90 text-2.5 tracking-[0.5rpx]"> uid · {{ userId }} </text>
              </view>
            </view>
          </template>
        </view>

        <TIcon name="chevron-right" v-bind="{ size: '32rpx', color: 'rgba(255,255,255,0.6)' }" />
      </view>
    </view>

    <view class="px-4 -mt-5">
      <view class="bg-white rounded-3 overflow-hidden shadow-lg">
        <view class="flex items-center justify-between px-5 pt-4.5 pb-3">
          <text class="text-slate-950 font-bold" style="font-size: 30rpx">我的订单</text>
          <view class="flex items-center gap-0.5" @tap="onViewAllOrders">
            <text class="text-xs text-slate-400">查看全部</text>
            <TIcon name="chevron-right" v-bind="{ size: '24rpx', color: ICON_COLOR.muted }" />
          </view>
        </view>

        <view class="mx-5 h-[1rpx] bg-slate-100" />

        <view class="flex items-stretch py-4">
          <view
            v-for="(tab, idx) in orderTabs"
            :key="tab.label"
            class="flex-1 flex flex-col items-center gap-1"
            :class="idx < orderTabs.length - 1 ? 'border-r border-slate-100' : ''"
            @tap="onOrderTab(tab)"
          >
            <view class="w-10 h-10 rounded-full flex items-center justify-center bg-brand/10">
              <TIcon :name="tab.icon" v-bind="{ size: '40rpx', color: ICON_COLOR.brand }" />
            </view>
            <text class="text-xs text-slate-500 font-medium">{{ tab.label }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="flex flex-col gap-2.5 px-4 pt-3" :style="{ paddingBottom: contentPaddingBottom }">
      <view
        v-for="(group, gIdx) in menuGroups"
        :key="gIdx"
        class="bg-white rounded-xl overflow-hidden shadow-md"
      >
        <view
          v-for="(item, iIdx) in group"
          :key="item.label"
          class="flex items-center justify-between px-5"
          style="height: 104rpx"
          :class="iIdx < group.length - 1 ? 'border-b border-slate-50' : ''"
          @tap="onMenu(item)"
        >
          <view class="flex items-center gap-3.5">
            <view
              class="w-8.5 h-8.5 rounded-2 flex items-center justify-center shrink-0 bg-slate-50"
            >
              <TIcon :name="item.icon" v-bind="{ size: '36rpx', color: ICON_COLOR.default }" />
            </view>
            <text class="text-slate-900 font-medium text-sm">
              {{ item.label }}
            </text>
          </view>
          <TIcon name="chevron-right" v-bind="{ size: '28rpx', color: ICON_COLOR.subtle }" />
        </view>
      </view>
    </view>

    <AppTabBar />

    <LoginDrawer v-model:visible="showLoginDrawer" @success="onLoginSuccess" />
  </view>
</template>
