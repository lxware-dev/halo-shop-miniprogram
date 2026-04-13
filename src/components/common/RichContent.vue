<script setup lang="ts">
import { computed } from 'vue';
import { htmlToContentBlocks } from '@/utils/rich-text';

const props = defineProps<{
  html: string;
  className?: string;
}>();

const blocks = computed(() => htmlToContentBlocks(props.html));

const allImages = computed(() =>
  blocks.value
    .filter((b) => b.type === 'image')
    .map((b) => (b as { type: 'image'; src: string }).src),
);

function previewImage(src: string) {
  if (!allImages.value.length) {
    return;
  }
  uni.previewImage({
    urls: allImages.value,
    current: src,
  });
}
</script>

<template>
  <view :class="className">
    <template v-for="(block, idx) in blocks" :key="idx">
      <rich-text v-if="block.type === 'rich'" :nodes="block.nodes" class="block w-full" />
      <image
        v-else-if="block.type === 'image'"
        :src="block.src"
        mode="widthFix"
        class="block w-full"
        :alt="block.alt"
        @tap="previewImage(block.src)"
      />
    </template>
  </view>
</template>
