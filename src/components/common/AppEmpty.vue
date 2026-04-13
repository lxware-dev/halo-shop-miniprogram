<script setup lang="ts">
import { formatImageUrlWithThumbnail } from '@/helpers/image';

const props = withDefaults(
  defineProps<{
    text?: string;
    subtext?: string;
    image?: string;
    ctaText?: string;
    ctaUrl?: string;
  }>(),
  {
    text: '暂无数据',
    type: 'generic',
  },
);

const emit = defineEmits<{
  cta: [];
}>();

function onCta() {
  if (props.ctaUrl) {
    uni.navigateTo({ url: props.ctaUrl });
  } else {
    emit('cta');
  }
}
</script>

<template>
  <view class="flex flex-col items-center gap-5 py-16 px-8">
    <image
      v-if="image"
      :src="formatImageUrlWithThumbnail(image, 'S')"
      class="w-24 h-24"
      mode="aspectFit"
    />

    <view class="flex flex-col items-center gap-2 text-center">
      <text class="text-slate-700 text-base font-medium">{{ text }}</text>
      <text v-if="subtext" class="text-slate-400 text-xs leading-relaxed px-4">{{ subtext }}</text>
    </view>

    <view
      v-if="ctaText"
      class="flex items-center justify-center px-8 py-2.5 rounded-full bg-brand shadow-sm active:opacity-75"
      @tap="onCta"
    >
      <text class="text-white text-sm font-medium">{{ ctaText }}</text>
    </view>
  </view>
</template>
