<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { userApi } from '@/api';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { useFetch } from '@/hooks/useRequest';
import { useUserStore } from '@/store';

const userStore = useUserStore();
const { data: detailedUser, send: refreshProfile } = useFetch(userApi.getProfile(), false);

const user = computed(() => detailedUser.value?.user ?? userStore.profile);
const nickname = ref('');
const submitting = ref(false);

onLoad(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }

  nickname.value = user.value?.spec?.displayName ?? '';
  void refreshUserProfile();
});

async function refreshUserProfile() {
  try {
    await refreshProfile();
    nickname.value = user.value?.spec?.displayName ?? '';
  } catch {
    // ignore
  }
}

async function handleSave() {
  if (submitting.value) {
    return;
  }

  const trimmedName = nickname.value.trim();
  if (!trimmedName) {
    uni.showToast({ title: '请输入昵称', icon: 'none' });
    return;
  }

  if (trimmedName === (user.value?.spec?.displayName ?? '')) {
    uni.navigateBack();
    return;
  }

  submitting.value = true;
  try {
    const result = await userApi
      .updateProfile({
        displayName: trimmedName,
      })
      .send();
    userStore.setProfile(result);
    uni.showToast({ title: '昵称已更新', icon: 'success' });
    setTimeout(() => {
      uni.navigateBack();
    }, 500);
  } catch {
    uni.showToast({ title: '昵称更新失败，请重试', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="min-h-screen bg-bg-page px-4 pt-3">
    <view class="overflow-hidden rounded-3 bg-white">
      <!-- #ifdef MP-WEIXIN -->
      <input
        v-model="nickname"
        type="nickname"
        class="h-14 px-4 text-base text-slate-900"
        maxlength="24"
        placeholder="请输入昵称"
        placeholder-style="color: #94a3b8"
        confirm-type="done"
      />
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <input
        v-model="nickname"
        type="text"
        class="h-14 px-4 text-base text-slate-900"
        maxlength="24"
        placeholder="请输入昵称"
        placeholder-style="color: #94a3b8"
        confirm-type="done"
      />
      <!-- #endif -->
    </view>

    <text class="mt-3 px-1 block text-xs leading-5 text-slate-400">
      微信小程序内可直接使用系统提供的昵称填写能力。
    </text>

    <view class="mt-5">
      <view
        class="flex items-center justify-center rounded-full py-3 shadow-brand-btn bg-brand"
        :class="submitting ? 'opacity-60' : ''"
        @tap="handleSave"
      >
        <text class="text-base font-medium text-white">
          {{ submitting ? '保存中...' : '保存昵称' }}
        </text>
      </view>
    </view>
  </view>
</template>
