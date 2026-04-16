<script setup lang="ts">
import { computed } from 'vue';
import { useAppConfig } from '@/config';

const props = withDefaults(
  defineProps<{
    price: number;
    originalPrice?: number;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    size: 'md',
  },
);

const { currencySymbol } = useAppConfig().business;

const sizeMap = {
  sm: { symbol: 'text-xs', price: 'text-sm', original: 'text-xs' },
  md: { symbol: 'text-sm', price: 'text-lg', original: 'text-xs' },
  lg: { symbol: 'text-base', price: 'text-2xl', original: 'text-sm' },
};

const classes = computed(() => sizeMap[props.size]);
</script>

<template>
  <view class="flex items-baseline gap-0.5">
    <text class="text-brand font-bold" :class="classes.symbol">{{ currencySymbol }}</text>
    <text class="text-brand font-bold" :class="classes.price">{{ price.toFixed(2) }}</text>
    <text
      v-if="originalPrice && originalPrice > price"
      class="text-slate-400 line-through"
      :class="classes.original"
    >
      {{ currencySymbol }}{{ originalPrice.toFixed(2) }}
    </text>
  </view>
</template>
