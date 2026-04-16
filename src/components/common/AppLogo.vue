<script setup lang="ts">
import { computed } from 'vue';
import { useAppConfig } from '@/config';
import { formatShareImageUrl } from '@/helpers/image';

const props = withDefaults(
  defineProps<{
    width?: string;
  }>(),
  {
    width: '160rpx',
  },
);

const logoUrl = computed(() => formatShareImageUrl(useAppConfig().app.logo));
const logoStyle = computed(() => ({
  width: props.width,
}));
</script>

<template>
  <image v-if="logoUrl" :src="logoUrl" :style="logoStyle" mode="widthFix" />
</template>
