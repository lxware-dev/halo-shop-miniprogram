<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import TTabBar from '@tdesign/uniapp/tab-bar/tab-bar.vue';
import TTabBarItem from '@tdesign/uniapp/tab-bar-item/tab-bar-item.vue';
import { useTabBar } from '@/composables/useTabBar';
import { useCart } from '@/hooks/useCart';

const tabs = [
  { value: 'home', label: '首页', icon: 'home', path: '/pages/home/index' },
  { value: 'category', label: '分类', icon: 'view-list', path: '/pages/category/index' },
  { value: 'cart', label: '购物车', icon: 'cart', path: '/pages/cart/index' },
  { value: 'user', label: '我的', icon: 'user', path: '/pages/user/index' },
];
const activeValue = ref<string>('home');
const { barBottom } = useTabBar();
const { totalCount } = useCart();
const tabBarStyle = computed(() => ({
  bottom: `${barBottom}px`,
}));
const tabsWithBadge = computed(() =>
  tabs.map((tab) => ({
    ...tab,
    badgeProps: tab.value === 'cart' && totalCount.value > 0 ? { count: totalCount.value } : {},
  })),
);

function getValueByPath(path: string) {
  const tab = tabs.find((t) => t.path === path);
  return tab?.value ?? 'home';
}

onShow(() => {
  const pages = getCurrentPages();
  const current = pages.at(-1);
  if (current) {
    const route = `/${current.route}`;
    activeValue.value = getValueByPath(route);
  }
});

function handleChange(e: { value: string }) {
  const { value } = e;
  const tab = tabs.find((t) => t.value === value);
  if (tab && tab.value !== activeValue.value) {
    activeValue.value = tab.value;
    uni.switchTab({ url: tab.path });
  }
}
</script>

<template>
  <TTabBar
    :value="activeValue"
    shape="round"
    theme="tag"
    :split="false"
    :fixed="true"
    :style="tabBarStyle"
    :custom-style="{
      ...tabBarStyle,
    }"
    @change="handleChange"
  >
    <TTabBarItem
      v-for="tab in tabsWithBadge"
      :key="tab.value"
      :value="tab.value"
      :icon="tab.icon"
      :badge-props="tab.badgeProps"
    >
      {{ tab.label }}
    </TTabBarItem>
  </TTabBar>
</template>
