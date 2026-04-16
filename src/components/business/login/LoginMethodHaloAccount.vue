<script setup lang="ts">
import { ref } from 'vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { ICON_COLOR } from '@/helpers/icon';
import { authApi } from '@/api';
import { sendRequest } from '@/hooks/useRequest';
import type { LoginMethodProps, LoginMethodEmits } from '@/types/auth';
import { useI18n } from 'vue-i18n';

const props = defineProps<LoginMethodProps>();
const emit = defineEmits<LoginMethodEmits>();
const { t } = useI18n();

const username = ref('');
const password = ref('');
const loading = ref(false);

async function submit() {
  if (!props.agreed) {
    uni.showToast({ title: t('login.agreementRequired'), icon: 'none' });
    return;
  }
  if (!username.value.trim()) {
    uni.showToast({ title: t('login.enterAccount'), icon: 'none' });
    return;
  }
  if (!password.value.trim()) {
    uni.showToast({ title: t('login.enterPassword'), icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    const result = await sendRequest(
      authApi.loginByHaloAccount({
        username: username.value.trim(),
        password: password.value.trim(),
      }),
    );
    emit('success', result);
  } catch {
    uni.showToast({ title: t('login.failed'), icon: 'none' });
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
      <TIcon name="user-circle" v-bind="{ size: '36rpx', color: ICON_COLOR.muted }" />
      <input
        v-model="username"
        class="flex-1 h-full text-sm text-slate-950 bg-transparent"
        :placeholder="t('login.inputAccount')"
        placeholder-style="color: #94a3b8"
        type="text"
      />
    </view>
    <view
      class="h-12 flex items-center gap-2 border border-solid border-slate-200 rounded-2.5 px-4 bg-slate-50"
    >
      <TIcon name="lock-on" v-bind="{ size: '36rpx', color: ICON_COLOR.muted }" />
      <input
        v-model="password"
        class="flex-1 h-full text-sm text-slate-950 bg-transparent"
        :placeholder="t('login.inputPassword')"
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
      <text class="text-white text-base font-bold">
        {{ loading ? t('login.loggingIn') : t('login.submit') }}
      </text>
    </view>
  </view>
</template>
