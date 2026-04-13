<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getLegalDocumentTitle, getLegalDocumentUrl, isLegalDocumentKey } from '@/helpers/legal';

const webViewUrl = ref('');
const emptyMessage = ref('当前页面暂未配置链接');

onLoad((options) => {
  const key = typeof options?.key === 'string' ? options.key : '';
  if (!isLegalDocumentKey(key)) {
    emptyMessage.value = '页面参数无效';
    uni.setNavigationBarTitle({ title: '网页详情' });
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
