<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LoginPanel from '@/components/business/LoginPanel.vue';
import { useAuth } from '@/hooks/useAuth';
import { redirectAfterLogin } from '@/helpers/auth';
import { useUserStore } from '@/store';
import { isAnonymousUser } from '@/store/modules/user';

const redirectUrl = ref('');
const forceMethods = ref(false);
const redirecting = ref(false);
const userStore = useUserStore();
const { syncProfile } = useAuth();

function handleLoginSuccess() {
  if (redirecting.value) {
    return;
  }
  redirecting.value = true;
  redirectAfterLogin(redirectUrl.value);
}

onLoad(async (options) => {
  redirectUrl.value = decodeURIComponent(options?.redirect ?? '');
  forceMethods.value = options?.forceMethods === '1';

  if (forceMethods.value || !userStore.isLoggedIn) {
    return;
  }

  try {
    const user = await syncProfile();
    if (isAnonymousUser(user)) {
      userStore.clearLoginState();
      return;
    }
    handleLoginSuccess();
  } catch {
    userStore.clearLoginState();
  }
});
</script>

<template>
  <view class="min-h-screen bg-white">
    <LoginPanel :force-methods="forceMethods" mode="page" @success="handleLoginSuccess" />
  </view>
</template>
