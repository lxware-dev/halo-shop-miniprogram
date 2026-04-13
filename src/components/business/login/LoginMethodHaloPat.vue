<script setup lang="ts">
import { ref } from 'vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { ICON_COLOR } from '@/helpers/icon';
import { authApi } from '@/api';
import { sendRequest } from '@/hooks/useRequest';
import type { LoginMethodProps, LoginMethodEmits } from '@/types/auth';

const props = defineProps<LoginMethodProps>();
const emit = defineEmits<LoginMethodEmits>();

const pat = ref('');
const loading = ref(false);

async function submit() {
  if (!props.agreed) {
    uni.showToast({ title: '请先阅读并同意相关协议', icon: 'none' });
    return;
  }
  if (!pat.value.trim()) {
    uni.showToast({ title: '请输入 Personal Access Token', icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    const result = await sendRequest(
      authApi.loginByHaloPat({
        pat: pat.value.trim(),
      }),
    );
    emit('success', result);
  } catch {
    uni.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <view class="flex flex-col gap-2.5">
    <view
      class="h-12 flex items-center gap-2 border border-solid border-slate-200 rounded-2.5 px-4 bg-slate-50"
    >
      <TIcon name="lock-on" v-bind="{ size: '36rpx', color: ICON_COLOR.muted }" />
      <input
        v-model="pat"
        class="flex-1 h-full text-sm text-slate-950 bg-transparent"
        placeholder="输入 Personal Access Token"
        placeholder-style="color: #94a3b8"
        type="text"
      />
    </view>
    <view
      class="w-full flex items-center justify-center rounded-full py-3.5"
      :class="agreed ? 'bg-brand' : 'bg-brand-muted'"
      :style="{ opacity: loading ? '0.7' : '1' }"
      @tap="submit"
    >
      <text class="text-white text-base font-bold">{{ loading ? '登录中…' : '登录' }}</text>
    </view>
  </view>
</template>
