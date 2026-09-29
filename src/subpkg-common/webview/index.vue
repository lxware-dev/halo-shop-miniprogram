<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getLegalDocumentTitle, getLegalDocumentUrl, isLegalDocumentKey } from '@/helpers/legal';
import { validHttpsResourceUrl } from '@/helpers/resource-url';

const webViewUrl = ref('');
const { t } = useI18n();
const emptyMessage = ref(t('webview.empty'));

onLoad((options) => {
  if (typeof options?.resourceUrl === 'string') {
    try {
      const resourceUrl = validHttpsResourceUrl(decodeURIComponent(options.resourceUrl));
      if (resourceUrl) {
        uni.setNavigationBarTitle({
          title: options.title ? decodeURIComponent(options.title) : t('order.virtual.resources'),
        });
        webViewUrl.value = resourceUrl;
        return;
      }
    } catch {
      // The route query is malformed.
    }
    emptyMessage.value = t('webview.invalidParams');
    uni.setNavigationBarTitle({ title: t('webview.title') });
    return;
  }

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
