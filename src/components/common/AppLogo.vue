<script setup lang="ts">
import { computed } from 'vue';
import { useAppConfig } from '@/config';
import { formatShareImageUrl } from '@/helpers/image';

const props = withDefaults(
  defineProps<{
    width?: string;
  }>(),
  {},
);
const appConfig = useAppConfig();
const logoUrl = computed(() => formatShareImageUrl(appConfig.app.logo));
const logoStyle = computed(() => ({
  width: props.width || appConfig.app.logoWidth || '160rpx',
}));
</script>

<template>
  <image v-if="logoUrl" :src="logoUrl" :style="logoStyle" mode="widthFix" />
</template>
