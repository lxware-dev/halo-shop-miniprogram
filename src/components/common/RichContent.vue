<script setup lang="ts">
import { computed } from 'vue';
import { htmlToContentBlocks } from '@/utils/rich-text';
import { formatImageUrl } from '@/helpers/image';

const props = defineProps<{
  html: string;
  className?: string;
}>();

const DEFAULT_MEDIA_WRAPPER_STYLE = 'display:flex;flex-direction:column;align-items:center;';

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
  const urls = allImages.value.map((img) => formatImageUrl(img));
  const current = formatImageUrl(src);
  uni.previewImage({
    urls,
    current,
  });
}

function getMediaWrapperStyle(block: { wrapperStyle?: string }) {
  return block.wrapperStyle?.trim() || DEFAULT_MEDIA_WRAPPER_STYLE;
}
</script>

<template>
  <view class="flex flex-col gap-2" :class="className">
    <template v-for="(block, idx) in blocks" :key="idx">
      <rich-text v-if="block.type === 'rich'" :nodes="block.nodes" class="block w-full" />
      <view
        v-else-if="block.type === 'image'"
        class="w-full"
        :class="block.wrapperClass"
        :style="getMediaWrapperStyle(block)"
      >
        <image
          :src="block.src"
          mode="widthFix"
          :alt="block.alt"
          class="block max-w-full"
          @tap="previewImage(block.src)"
        />
      </view>
      <view
        v-else-if="block.type === 'video'"
        class="w-full"
        :class="block.wrapperClass"
        :style="getMediaWrapperStyle(block)"
      >
        <video :src="block.src" :poster="block.poster" controls class="w-full" />
      </view>
    </template>
  </view>
</template>
