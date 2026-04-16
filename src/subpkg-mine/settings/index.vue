<script setup lang="ts">
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { useFetch } from '@/hooks/useRequest';
import { userApi } from '@/api';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store';
import { formatImageUrlWithThumbnail } from '@/helpers/image';

const userStore = useUserStore();
const { data: detailedUser, send: refreshProfile } = useFetch(userApi.getProfile(), false);
const { logout } = useAuth();
const { t } = useI18n();

const user = computed(() => detailedUser.value?.user ?? userStore.profile);

const displayName = computed(() => user.value?.spec?.displayName ?? t('user.notLoggedIn'));
const userAvatar = computed(() => user.value?.spec?.avatar ?? '');
const userId = computed(() => {
  const name = user.value?.metadata?.name ?? '';
  return name.length > 20 ? `${name.slice(0, 20)}...` : name;
});

const isAvatarSaving = ref(false);

onLoad(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  void refreshProfile().catch(() => {});
});

onShow(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  void refreshProfile().catch(() => {});
});

function navigateToNicknamePage() {
  uni.navigateTo({ url: '/subpkg-mine/profile-name/index' });
}

// #ifdef MP-WEIXIN
async function onChooseAvatar(e: any) {
  if (isAvatarSaving.value) {
    return;
  }

  const avatarUrl = (e as { detail?: { avatarUrl?: string } }).detail?.avatarUrl;
  if (!avatarUrl) {
    return;
  }

  isAvatarSaving.value = true;
  try {
    const result = await userApi.uploadAvatar(avatarUrl);
    userStore.setProfile(result);
    await refreshProfile().catch(() => {});
    uni.showToast({ title: t('settings.avatarUpdated'), icon: 'success' });
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : t('settings.avatarUpdateFailed'),
      icon: 'none',
    });
  } finally {
    isAvatarSaving.value = false;
  }
}
// #endif
function onLogout() {
  uni.showModal({
    title: t('settings.logoutTitle'),
    content: t('settings.logoutContent'),
    confirmText: t('settings.logoutConfirm'),
    confirmColor: '#ee2b2b',
    cancelText: t('common.cancel'),
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
    <view
      class="flex flex-col gap-2 mx-4 mt-4 overflow-hidden rounded-3 border border-solid border-slate-100 bg-white"
    >
      <view class="flex items-center justify-between p-3">
        <text class="text-base text-slate-900">{{ $t('settings.avatar') }}</text>
        <view
          class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 w-11 h-11"
        >
          <image
            v-if="userAvatar"
            :src="formatImageUrlWithThumbnail(userAvatar, 'S')"
            mode="aspectFill"
            class="w-full h-full"
          />
          <TIcon v-else name="user-filled" v-bind="{ size: '44rpx', color: '#94a3b8' }" />

          <!-- #ifdef MP-WEIXIN -->
          <button
            open-type="chooseAvatar"
            class="absolute inset-0 opacity-0 m-0 p-0 rounded-full after:hidden"
            @chooseavatar="onChooseAvatar"
          />
          <!-- #endif -->
        </view>
      </view>

      <view class="flex p-3 items-center justify-between" @tap="navigateToNicknamePage">
        <text class="text-base text-slate-900">{{ $t('settings.nickname') }}</text>
        <view class="flex items-center gap-2 max-w-52 min-w-0">
          <text class="truncate text-right text-base text-slate-400">{{ displayName }}</text>
          <TIcon name="chevron-right" v-bind="{ size: '24rpx', color: '#94a3b8' }" />
        </view>
      </view>

      <view class="flex items-center justify-between p-3">
        <text class="text-base text-slate-900">{{ $t('settings.accountId') }}</text>
        <text class="max-w-52 truncate text-right text-base text-slate-400">{{ userId }}</text>
      </view>
    </view>

    <view class="mx-4 mt-3 overflow-hidden rounded-3 bg-white mb-10">
      <view class="flex items-center justify-center h-14" @tap="onLogout">
        <text class="text-brand text-base font-medium">{{ $t('settings.logout') }}</text>
      </view>
    </view>
  </view>
</template>
