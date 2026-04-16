<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import TTabBar from '@tdesign/uniapp/tab-bar/tab-bar.vue';
import TTabBarItem from '@tdesign/uniapp/tab-bar-item/tab-bar-item.vue';
import { useTabBar } from '@/composables/useTabBar';
import { useCart } from '@/hooks/useCart';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const tabs = computed(() => [
  { value: 'home', label: t('tab.home'), icon: 'home', path: '/pages/home/index' },
  { value: 'category', label: t('tab.category'), icon: 'view-list', path: '/pages/category/index' },
  { value: 'cart', label: t('tab.cart'), icon: 'cart', path: '/pages/cart/index' },
  { value: 'user', label: t('tab.user'), icon: 'user', path: '/pages/user/index' },
]);
const activeValue = ref<string>('home');
const { barBottom } = useTabBar();
const { totalCount } = useCart();
const tabBarStyle = computed(() => ({
  bottom: `${barBottom}px`,
}));
const tabsWithBadge = computed(() =>
  tabs.value.map((tab) => ({
    ...tab,
    badgeProps: tab.value === 'cart' && totalCount.value > 0 ? { count: totalCount.value } : {},
  })),
);

function getValueByPath(path: string) {
  const tab = tabs.value.find((t) => t.path === path);
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
  const tab = tabs.value.find((t) => t.value === value);
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
