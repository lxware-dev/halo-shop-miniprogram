<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { ICON_COLOR } from '@/helpers/icon';
import { authApi } from '@/api';
import { sendRequest } from '@/hooks/useRequest';
import type { LoginMethodProps, LoginMethodEmits } from '@/types/auth';
import { useI18n } from 'vue-i18n';

const props = defineProps<LoginMethodProps>();
const emit = defineEmits<LoginMethodEmits>();
const { t } = useI18n();

const email = ref('');
const code = ref('');
const loading = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
});

function startCountdown() {
  countdown.value = 60;
  timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(timer!);
      timer = null;
    }
  }, 1000);
}

async function sendCode() {
  if (!email.value.trim()) {
    uni.showToast({ title: t('login.enterEmail'), icon: 'none' });
    return;
  }
  if (countdown.value > 0) {
    return;
  }
  try {
    await sendRequest(authApi.sendCode({ target: email.value.trim(), type: 'email' }));
    startCountdown();
    uni.showToast({ title: t('login.codeSent'), icon: 'success' });
  } catch {
    uni.showToast({ title: t('login.codeSendFailed'), icon: 'none' });
  }
}

async function submit() {
  if (!props.agreed) {
    uni.showToast({ title: t('login.agreementRequired'), icon: 'none' });
    return;
  }
  if (!email.value.trim()) {
    uni.showToast({ title: t('login.enterEmail'), icon: 'none' });
    return;
  }
  if (!code.value.trim()) {
    uni.showToast({ title: t('login.enterCode'), icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    const result = await sendRequest(
      authApi.loginByEmail({
        email: email.value.trim(),
        code: code.value.trim(),
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
      <TIcon name="mail" v-bind="{ size: '36rpx', color: ICON_COLOR.muted }" />
      <input
        v-model="email"
        class="flex-1 h-full text-sm text-slate-950 bg-transparent"
        :placeholder="t('login.inputEmail')"
        placeholder-style="color: #94a3b8"
        type="text"
      />
    </view>
    <view
      class="h-12 flex items-center gap-2 border border-solid border-slate-200 rounded-2.5 px-4 bg-slate-50"
    >
      <TIcon name="secured" v-bind="{ size: '36rpx', color: ICON_COLOR.muted }" />
      <input
        v-model="code"
        class="flex-1 h-full text-sm text-slate-950 bg-transparent"
        :placeholder="t('login.inputEmailCode')"
        placeholder-style="color: #94a3b8"
        type="number"
        :maxlength="6"
      />
      <view
        class="shrink-0 px-3 py-1 rounded-full text-xs font-medium"
        :class="countdown > 0 ? 'text-slate-400' : 'text-brand'"
        @tap="sendCode"
      >
        {{ countdown > 0 ? `${countdown}s` : t('login.getCode') }}
      </view>
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
