<script setup lang="ts">
import { computed } from 'vue';
import { useDrawer } from '@/composables/useDrawer';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import type { SpecDefinitionPayload } from '@halo-dev/api-client';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import { ICON_COLOR } from '@/helpers/icon';

const props = withDefaults(
  defineProps<{
    // whether it is shown
    visible: boolean;
    // current SKU image (top preview)
    coverImage?: string;
    // fallback product image when neither the SKU nor the spec value has an image
    fallbackCoverImage?: string;
    // currently displayed price (string, already formatted, e.g. "299.00")
    price?: string;
    // current variant stock (-1 means unlimited)
    stock?: number;
    // whether inventory is tracked
    trackInventory?: boolean;
    // selected spec text, e.g. "Cream White, M"
    selectedText?: string;
    // spec definition list
    specDefinition?: SpecDefinitionPayload[];
    // selected spec map, key=spec name, value=spec value
    selectedSpecs?: Record<string, string>;
    // unavailable spec value map, key=spec name, value=disabled value Set
    disabledSpecValues?: Record<string, Set<string>>;
    // quantity
    quantity?: number;
    // max selectable quantity (defaults to stock; 0 means unlimited)
    maxQuantity?: number;
  }>(),
  {
    coverImage: '',
    fallbackCoverImage: '',
    price: '0.00',
    stock: -1,
    trackInventory: false,
    selectedText: '',
    specDefinition: () => [],
    selectedSpecs: () => ({}),
    disabledSpecValues: () => ({}),
    quantity: 1,
    maxQuantity: 0,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:selectedSpecs': [value: Record<string, string>];
  'update:quantity': [value: number];
}>();

const { show, panelTranslate } = useDrawer(() => props.visible);

function close() {
  emit('update:visible', false);
}

function isDisabled(specName: string, value: string): boolean {
  return props.disabledSpecValues[specName]?.has(value) ?? false;
}

function selectSpec(specName: string, value: string) {
  if (isDisabled(specName, value)) {
    return;
  }
  emit('update:selectedSpecs', { ...props.selectedSpecs, [specName]: value });
}

function isSelected(specName: string, value: string) {
  return props.selectedSpecs[specName] === value;
}

const selectedSpecImage = computed(() => {
  for (const specDef of props.specDefinition) {
    const selectedValue = props.selectedSpecs[specDef.name ?? ''];
    if (!selectedValue) {
      continue;
    }
    const matchedValue = specDef.values?.find((value) => value.value === selectedValue);
    if (matchedValue?.imageUrl) {
      return matchedValue.imageUrl;
    }
  }
  return '';
});

const displayCoverImage = computed(
  () => props.coverImage || selectedSpecImage.value || props.fallbackCoverImage,
);

const effectiveMax = computed(() => {
  if (props.maxQuantity > 0) {
    return props.maxQuantity;
  }
  if (props.stock != null && props.stock >= 0) {
    return props.stock;
  }
  return 999;
});

function decrement() {
  if (props.quantity <= 1) {
    return;
  }
  emit('update:quantity', props.quantity - 1);
}

function increment() {
  if (props.quantity >= effectiveMax.value) {
    return;
  }
  emit('update:quantity', props.quantity + 1);
}

function onQuantityInput(e: any) {
  const raw = e.detail.value as string;
  const num = Number.parseInt(raw, 10);
  if (Number.isNaN(num) || num < 1) {
    return;
  }
  const clamped = Math.min(num, effectiveMax.value);
  emit('update:quantity', clamped);
}

function onQuantityBlur(e: any) {
  const raw = e.detail.value as string;
  const num = Number.parseInt(raw, 10);
  if (Number.isNaN(num) || num < 1) {
    emit('update:quantity', 1);
  } else {
    emit('update:quantity', Math.min(num, effectiveMax.value));
  }
}
</script>

<template>
  <view v-if="show" class="fixed inset-0 z-50 flex flex-col justify-end" @touchmove.stop.prevent>
    <view class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" @tap="close" />

    <view
      class="max-h-80vh relative bg-white w-full flex flex-col rounded-t-[40rpx] transition-transform duration-300 ease-drawer"
      :style="{ transform: panelTranslate }"
      @tap.stop
    >
      <view class="flex items-center justify-center pt-3 pb-1 shrink-0">
        <view class="bg-slate-200 rounded-full w-10 h-1" />
      </view>

      <view class="flex items-start gap-4 px-4 p-3 shrink-0">
        <view class="shrink-0">
          <view class="bg-white rounded-2 p-1 shadow-image">
            <image
              :src="formatImageUrlWithThumbnail(displayCoverImage, 'S')"
              mode="aspectFill"
              class="w-24 h-24 block rounded-1.5 bg-slate-100"
            />
          </view>
        </view>

        <view class="flex flex-col gap-1 flex-1 pt-2">
          <view class="flex items-baseline gap-0.5">
            <text class="text-brand text-sm font-medium">¥</text>
            <text class="text-brand text-2xl font-bold leading-none">{{ price }}</text>
          </view>
          <text v-if="trackInventory && stock >= 0" class="text-slate-500 text-xs">
            库存 {{ stock }} 件
          </text>
          <text v-if="selectedText" class="text-slate-950 text-xs font-medium">
            已选：{{ selectedText }}
          </text>
        </view>

        <view class="shrink-0 pt-2" @tap="close">
          <TIcon name="close" v-bind="{ size: '44rpx', color: ICON_COLOR.muted }" />
        </view>
      </view>

      <scroll-view scroll-y class="flex-1 overflow-auto" @touchmove.stop>
        <view class="px-4 py-2 flex flex-col gap-4">
          <view v-for="specDef in specDefinition" :key="specDef.id" class="flex flex-col gap-3">
            <text class="text-slate-950 text-base font-medium">{{ specDef.name }}</text>
            <view class="flex flex-wrap gap-2">
              <view
                v-for="val in specDef.values"
                :key="val.value"
                class="px-4.5 py-2.5 rounded-2 border border-solid text-sm font-medium relative overflow-hidden"
                :class="
                  isDisabled(specDef.name ?? '', val.value ?? '')
                    ? 'bg-slate-50 border-transparent text-slate-300 cursor-not-allowed'
                    : isSelected(specDef.name ?? '', val.value ?? '')
                      ? 'bg-brand/10 border-brand/20 text-brand'
                      : 'bg-slate-100 border-transparent text-slate-700'
                "
                @tap="selectSpec(specDef.name ?? '', val.value ?? '')"
              >
                {{ val.value }}
              </view>
            </view>
          </view>

          <view class="flex items-center justify-between py-2">
            <text class="text-slate-950 text-base font-medium">购买数量</text>
            <view class="flex items-center bg-slate-100 rounded-2 overflow-hidden">
              <view
                class="h-6 w-6 px-1 flex items-center justify-center"
                :class="quantity <= 1 ? 'opacity-30' : ''"
                @tap="decrement"
              >
                <view class="w-3.5 h-0.5 bg-slate-500 rounded-full" />
              </view>
              <view class="w-12 h-10 flex items-center justify-center">
                <input
                  type="number"
                  :value="String(quantity)"
                  class="w-full h-full text-center text-slate-950 text-base font-medium bg-transparent"
                  @input="onQuantityInput"
                  @blur="onQuantityBlur"
                  @tap.stop
                />
              </view>
              <view
                class="h-6 w-6 px-1 flex items-center justify-center"
                :class="quantity >= effectiveMax ? 'opacity-30' : ''"
                @tap="increment"
              >
                <view class="relative w-3.5 h-3.5">
                  <view
                    class="absolute bg-slate-500 rounded-full top-1/2 left-0 right-0 h-0.5 -translate-y-1/2"
                  />
                  <view
                    class="absolute bg-slate-500 rounded-full left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2"
                  />
                </view>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="shrink-0 px-4 pt-4.5 border-t border-solid border-slate-50 pb-safe">
        <slot>
          <view class="bg-brand rounded-full py-3.5 flex items-center justify-center" @tap="close">
            <text class="text-white text-base font-bold">确认</text>
          </view>
        </slot>
      </view>
    </view>
  </view>
</template>
