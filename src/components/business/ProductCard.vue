<script setup lang="ts">
import AppPrice from '@/components/common/AppPrice.vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import type { ProductResponse } from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import { ICON_COLOR } from '@/helpers/icon';
import { isExternalProduct } from '@/helpers/product';

/**
 * showAddCart defaults to true; pass :show-add-cart="false" to hide the add-to-cart button
 */
defineProps<{
  product: ProductResponse;
  /**
   * Whether to show the add-to-cart button; defaults to true
   */
  showAddCart?: boolean;
}>();

const emit = defineEmits<{
  select: [product: ProductResponse];
  addCart: [product: ProductResponse];
}>();
</script>

<template>
  <view
    class="h-full flex flex-col rounded-2 overflow-hidden bg-white border border-solid border-gray-200 shadow-card"
    @tap="emit('select', product)"
  >
    <view class="w-full overflow-hidden bg-slate-100 aspect-square">
      <image
        v-if="product.coverImageUrl"
        :src="formatImageUrlWithThumbnail(product.coverImageUrl, 'S')"
        mode="aspectFill"
        class="w-full h-full"
        lazy-load
      />
      <view v-else class="flex items-center justify-center w-full h-full">
        <TIcon name="image" v-bind="{ size: '68rpx', color: ICON_COLOR.subtle }" />
      </view>
    </view>

    <view class="flex flex-1 flex-col gap-1.5 p-2.5">
      <text class="text-slate-900 text-sm leading-normal font-medium line-clamp-2">
        {{ product.title }}
      </text>

      <view class="mt-auto flex items-center justify-between pt-0.5">
        <AppPrice :price="product.minPrice ?? 0" :original-price="product.minOriginalPrice" />

        <view
          v-if="showAddCart !== false && !isExternalProduct(product)"
          class="w-6 h-6 rounded-full flex p-1 items-center justify-center bg-brand/10 shrink-0"
          @tap.stop="emit('addCart', product)"
        >
          <TIcon name="cart-add" v-bind="{ size: '28rpx', color: ICON_COLOR.brand }" />
        </view>
      </view>
    </view>
  </view>
</template>
