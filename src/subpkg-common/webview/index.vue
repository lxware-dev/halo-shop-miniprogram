<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getLegalDocumentTitle, getLegalDocumentUrl, isLegalDocumentKey } from '@/helpers/legal';

const webViewUrl = ref('');
const { t } = useI18n();
const emptyMessage = ref(t('webview.empty'));

onLoad((options) => {
  const key = typeof options?.key === 'string' ? options.key : '';
  if (!isLegalDocumentKey(key)) {
    emptyMessage.value = t('webview.invalidParams');
    uni.setNavigationBarTitle({ title: t('webview.title') });
    return;
  }

  uni.setNavigationBarTitle({ title: getLegalDocumentTitle(key) });
  webViewUrl.value = getLegalDocumentUrl(key);
});
</script>

<template>
  <web-view v-if="webViewUrl" :src="webViewUrl" />
  <view v-else class="min-h-screen bg-bg-page flex items-center justify-center px-8">
    <text class="text-slate-400 text-sm text-center leading-6">
      {{ emptyMessage }}
    </text>
  </view>
</template>
