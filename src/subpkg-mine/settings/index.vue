<script setup lang="ts">
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useFetch } from '@/hooks/useRequest';
import { userApi } from '@/api';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store';
import { formatImageUrlWithThumbnail } from '@/helpers/image';

const userStore = useUserStore();
const { data: detailedUser, send: refreshProfile } = useFetch(userApi.getProfile(), false);
const { logout } = useAuth();

const user = computed(() => detailedUser.value?.user ?? userStore.profile);

const displayName = computed(() => user.value?.spec?.displayName ?? '未登录');
const userAvatar = computed(() => user.value?.spec?.avatar ?? '');
const userId = computed(() => {
  const name = user.value?.metadata?.name ?? '';
  return name.length > 8 ? name.slice(0, 8).toUpperCase() : name.toUpperCase();
});

onLoad(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  void refreshProfile().catch(() => {});
});

function onLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出登录吗？',
    confirmText: '退出',
    confirmColor: '#ee2b2b',
    cancelText: '取消',
    success(res) {
      if (res.confirm) {
        logout();
      }
    },
  });
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="mt-3 bg-white px-4 py-6 flex flex-col items-center gap-4">
      <view
        class="w-20 h-20 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0"
      >
        <image
          v-if="userAvatar"
          :src="formatImageUrlWithThumbnail(userAvatar, 'S')"
          mode="aspectFill"
          class="w-full h-full"
        />
        <TIcon v-else name="user-filled" v-bind="{ size: '60rpx', color: '#94a3b8' }" />
      </view>
      <view class="flex flex-col items-center gap-1">
        <text class="text-slate-950 text-lg font-semibold leading-7">{{ displayName }}</text>
        <text class="text-slate-400 text-xs">ID · {{ userId }}</text>
      </view>
    </view>

    <view class="mt-3 bg-white mb-10">
      <view class="flex items-center justify-center h-14" @tap="onLogout">
        <text class="text-brand text-base font-medium">退出登录</text>
      </view>
    </view>
  </view>
</template>
