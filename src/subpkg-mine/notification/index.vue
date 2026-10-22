<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import AppEmpty from '@/components/common/AppEmpty.vue';
import { guardCurrentPageAccess } from '@/helpers/auth';

const { t } = useI18n();

onLoad(() => {
  uni.setNavigationBarTitle({ title: t('notification.title') });
  guardCurrentPageAccess();
});

function backToAccount() {
  uni.switchTab({ url: '/pages/user/index' });
}
</script>

<template>
  <view class="flex items-center justify-center min-h-screen bg-bg-page">
    <AppEmpty
      :text="t('notification.unavailable')"
      :cta-text="t('notification.backToAccount')"
      @cta="backToAccount"
    />
  </view>
</template>
