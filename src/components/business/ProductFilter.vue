<script setup lang="ts">
import { ref, watch } from 'vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import type { FilterGroup, FilterValue } from '@/types/filter';

export type { FilterValue };

const props = defineProps<{
  visible: boolean;
  filterGroups?: FilterGroup[];
  initialValue?: FilterValue;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [value: FilterValue];
}>();

const selectedValues = ref<Record<string, string | number | undefined>>({});
const minPriceInput = ref('');
const maxPriceInput = ref('');

const expandedGroups = ref<Record<string, boolean>>({});

const animVisible = ref(false);
const entered = ref(false);

function initState() {
  const init = props.initialValue ?? {};
  const groupKeys = (props.filterGroups ?? []).map((g) => g.key);
  selectedValues.value = Object.fromEntries(groupKeys.map((key) => [key, init[key]]));
  minPriceInput.value = init.minPrice != null ? String(init.minPrice) : '';
  maxPriceInput.value = init.maxPrice != null ? String(init.maxPrice) : '';
  expandedGroups.value = Object.fromEntries(groupKeys.map((key) => [key, true]));
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      animVisible.value = true;
      setTimeout(() => {
        entered.value = true;
      }, 20);
      initState();
      return;
    }

    entered.value = false;
    setTimeout(() => {
      animVisible.value = false;
    }, 300);
  },
);

function close() {
  emit('update:visible', false);
}

function reset() {
  const cleared: Record<string, undefined> = {};
  (props.filterGroups ?? []).forEach((g) => {
    cleared[g.key] = undefined;
  });
  selectedValues.value = cleared;
  minPriceInput.value = '';
  maxPriceInput.value = '';
}

function confirm() {
  const result: FilterValue = { ...selectedValues.value };
  const min = Number.parseFloat(minPriceInput.value);
  const max = Number.parseFloat(maxPriceInput.value);
  if (!Number.isNaN(min) && min >= 0) {
    result.minPrice = min;
  }
  if (!Number.isNaN(max) && max >= 0) {
    result.maxPrice = max;
  }
  emit('confirm', result);
  close();
}

function selectOption(groupKey: string, value: string | number) {
  const current = selectedValues.value[groupKey];
  selectedValues.value = {
    ...selectedValues.value,
    [groupKey]: current === value ? undefined : value,
  };
}

function toggleGroup(key: string) {
  expandedGroups.value = {
    ...expandedGroups.value,
    [key]: !expandedGroups.value[key],
  };
}
</script>

<template>
  <view v-if="animVisible" class="fixed inset-0 z-100">
    <view
      class="absolute inset-0 transition-opacity duration-300 bg-black/40"
      :class="{ 'opacity-0': !entered }"
      @tap="close"
    />

    <view
      class="absolute top-0 bottom-0 right-0 flex flex-col bg-white w-4/5 shadow-overlay transition-transform duration-300 ease-slide"
      :class="{ 'translate-x-0': entered, 'translate-x-full': !entered }"
    >
      <view
        class="flex items-center justify-between px-4 py-3.5 shrink-0 border-b border-b-solid border-b-slate-100"
      >
        <text class="text-slate-950 text-base font-medium">筛选</text>
        <view class="p-1" @tap="close">
          <TIcon name="close" v-bind="{ size: '46rpx', color: '#94a3b8' }" />
        </view>
      </view>

      <scroll-view scroll-y class="flex-1 overflow-hidden">
        <view class="pb-4">
          <template v-for="group in filterGroups" :key="group.key">
            <view
              class="flex items-center justify-between px-4 py-3 bg-slate-50 mt-2"
              @tap="toggleGroup(group.key)"
            >
              <view class="flex items-center gap-1.5">
                <text class="text-slate-950 text-3.5 font-medium">{{ group.label }}</text>
                <view
                  v-if="selectedValues[group.key] != null"
                  class="w-1.5 h-1.5 rounded-full bg-brand"
                />
              </view>
              <TIcon
                name="chevron-down"
                v-bind="{
                  size: '28rpx',
                  color: '#94a3b8',
                  style: `transition: transform 0.2s ease; transform: rotate(${expandedGroups[group.key] ? '180deg' : '0deg'})`,
                }"
              />
            </view>

            <view v-if="expandedGroups[group.key]" class="px-4 pt-3 pb-1">
              <view class="flex flex-wrap gap-2">
                <view
                  v-for="option in group.options"
                  :key="option.value"
                  class="flex items-center justify-center px-3.5 py-2.5 rounded-1 w-[calc(50%-8rpx)] box-border"
                  :class="
                    selectedValues[group.key] === option.value
                      ? 'border border-solid border-brand bg-brand/10'
                      : 'border border-solid border-transparent bg-slate-100'
                  "
                  @tap="selectOption(group.key, option.value)"
                >
                  <text
                    class="text-sm font-medium text-center"
                    :class="
                      selectedValues[group.key] === option.value ? 'text-brand' : 'text-slate-950'
                    "
                  >
                    {{ option.label }}
                  </text>
                </view>
              </view>
            </view>
          </template>

          <view class="flex items-center justify-between px-4 py-3 bg-slate-50 mt-2">
            <view class="flex items-center gap-1.5">
              <text class="text-slate-950 text-sm font-medium">价格区间（元）</text>
              <view
                v-if="minPriceInput || maxPriceInput"
                class="w-1.5 h-1.5 rounded-full bg-brand"
              />
            </view>
          </view>

          <view class="flex items-center gap-2 px-4 pt-3 pb-2">
            <view class="h-9 flex-1 flex items-center bg-slate-100 rounded-1 px-3 overflow-hidden">
              <input
                v-model="minPriceInput"
                type="digit"
                placeholder="最低价"
                placeholder-style="color: #94a3b8; font-size: 28rpx"
                class="h-9 flex-1 text-sm text-slate-950 bg-transparent"
              />
            </view>

            <text class="text-slate-400 text-sm shrink-0">—</text>

            <view class="h-9 flex-1 flex items-center bg-slate-100 rounded-1 px-3 overflow-hidden">
              <input
                v-model="maxPriceInput"
                type="digit"
                placeholder="最高价"
                placeholder-style="color: #94a3b8; font-size: 28rpx"
                class="h-9 flex-1 text-sm text-slate-950 bg-transparent"
              />
            </view>
          </view>
        </view>
      </scroll-view>

      <view
        class="flex items-center gap-3 px-4 pt-4.5 shrink-0 bg-white border-t border-t-solid border-t-slate-100 pb-safe-xs"
      >
        <view
          class="w-22.5 h-12.5 flex items-center justify-center rounded-2 border border-solid border-slate-200 shrink-0"
          @tap="reset"
        >
          <text class="text-slate-600 text-base font-medium">重置</text>
        </view>

        <view
          class="flex flex-1 items-center justify-center bg-brand rounded-2 h-12.5 shadow-brand-btn"
          @tap="confirm"
        >
          <text class="text-white text-base font-medium">确定</text>
        </view>
      </view>
    </view>
  </view>
</template>
