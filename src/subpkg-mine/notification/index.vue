<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onReachBottom } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { useI18n } from 'vue-i18n';
import { notificationApi } from '@/api/modules/notification';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { usePagePullRefresh } from '@/hooks/usePullRefresh';
import { sendRequest, useInfiniteQuery } from '@/hooks/useRequest';
import type { PageResponse } from '@/types/api';
import type { NotificationItem, NotificationCategory } from '@/api/modules/notification';
import { getPageResponseHasMore } from '@/utils/page';

type TabKey = 'all' | 'logistics' | 'promotion';

interface Tab {
  key: TabKey;
  label: string;
}

const { t } = useI18n();

const tabs = computed<Tab[]>(() => [
  { key: 'all', label: t('notification.tab.all') },
  { key: 'logistics', label: t('notification.tab.logistics') },
  { key: 'promotion', label: t('notification.tab.promotion') },
]);

const activeTab = ref<TabKey>('all');

const tabCategoryMap: Record<TabKey, NotificationCategory | undefined> = {
  all: undefined,
  logistics: 'logistics',
  promotion: 'promotion',
};

const PAGE_SIZE = 20;
const {
  list: notifications,
  loading,
  hasMore,
  run: runNotifications,
  loadMore: loadMoreNotifications,
} = useInfiniteQuery<
  PageResponse<NotificationItem>,
  NotificationItem,
  { category?: NotificationCategory }
>(
  (page: number, size: number, params: { category?: NotificationCategory }) =>
    notificationApi.getList({ page, size, category: params.category }),
  {
    pageSize: PAGE_SIZE,
    immediate: false,
    getItems: (res) => res.content ?? [],
    getHasMore: (res) => getPageResponseHasMore(res, PAGE_SIZE),
  },
);
const isLastPage = computed(() => !hasMore.value);

async function refreshNotifications() {
  await runNotifications({ category: tabCategoryMap[activeTab.value] });
}

onMounted(() => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  void refreshNotifications();
});

onReachBottom(() => {
  loadMoreNotifications();
});

function onTabChange(key: TabKey) {
  if (activeTab.value === key) {
    return;
  }
  activeTab.value = key;
  void refreshNotifications();
}

usePagePullRefresh(async () => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  await refreshNotifications();
});

const unreadCount = computed(() => notifications.value.filter((n) => !n.isRead).length);

async function markAllRead() {
  if (unreadCount.value === 0) {
    return;
  }
  const result = await sendRequest(notificationApi.markAllRead());
  if (result?.success !== false) {
    notifications.value.forEach((n) => {
      n.isRead = true;
    });
  }
}

async function onItemTap(item: NotificationItem) {
  if (!item.isRead) {
    const result = await sendRequest(notificationApi.markRead(item.id));
    if (result) {
      item.isRead = true;
    }
  }
}

interface IconConfig {
  bgColor: string;
  iconName: string;
  iconColor: string;
}

function getIconConfig(category: NotificationCategory): IconConfig {
  const configMap: Record<NotificationCategory, IconConfig> = {
    logistics: { bgColor: '#3b82f6', iconName: 'cart', iconColor: '#ffffff' },
    promotion: { bgColor: '#ee2b2b', iconName: 'discount', iconColor: '#ffffff' },
    system: { bgColor: '#e2e8f0', iconName: 'notification-filled', iconColor: '#64748b' },
    refund: { bgColor: '#ffedd5', iconName: 'money-circle', iconColor: '#f97316' },
  };
  return (
    configMap[category] ?? { bgColor: '#e2e8f0', iconName: 'notification', iconColor: '#64748b' }
  );
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="bg-white border-b border-b-solid border-b-slate-100 sticky top-0 z-10">
      <view class="flex items-stretch px-4">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="flex-1 flex flex-col items-center pt-3 pb-3.5 relative"
          @tap="onTabChange(tab.key)"
        >
          <text
            class="text-sm line-height-tight text-center"
            :class="activeTab === tab.key ? 'text-brand' : 'text-slate-500'"
          >
            {{ tab.label }}
          </text>
          <view
            v-if="activeTab === tab.key"
            class="w-full h-0.5 absolute bottom-0 left-1/2 -translate-x-1/2 bg-brand rounded-full"
          />
        </view>
      </view>
    </view>

    <view class="flex flex-col flex-1 mt-0.5">
      <view class="flex items-center justify-between px-4 py-2 bg-bg-page">
        <text class="text-slate-500 text-base line-height-tight tracking-widest">
          {{ t('notification.recent') }}
        </text>
        <text
          class="text-sm"
          :class="unreadCount > 0 ? 'text-brand' : 'text-slate-300'"
          @tap="markAllRead"
        >
          {{ t('notification.markAllRead') }}
        </text>
      </view>

      <view class="flex flex-col gap-0.5">
        <view
          v-for="item in notifications"
          :key="item.id"
          class="bg-white flex gap-4 items-start px-4 py-4"
          @tap="onItemTap(item)"
        >
          <view class="relative shrink-0">
            <view
              class="flex items-center justify-center rounded-2 w-12 h-12"
              :style="{ backgroundColor: getIconConfig(item.category).bgColor }"
            >
              <TIcon
                :name="getIconConfig(item.category).iconName"
                v-bind="{ size: '40rpx', color: getIconConfig(item.category).iconColor }"
              />
            </view>
            <view
              v-if="!item.isRead"
              class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand border-2 border-solid border-white"
            />
          </view>

          <view class="flex-1 flex flex-col gap-1 min-w-0">
            <view class="flex items-start justify-between">
              <text class="text-slate-950 text-sm font-medium flex-1 mr-2">
                {{ item.title }}
              </text>
              <text class="text-slate-400 text-xs shrink-0 mt-0.5">
                {{ item.time }}
              </text>
            </view>
            <text class="text-slate-500 text-sm line-clamp-2">
              {{ item.content }}
            </text>
          </view>
        </view>
      </view>

      <view v-if="loading" class="flex justify-center items-center py-5">
        <text class="text-slate-400 text-xs">{{ t('common.loading') }}</text>
      </view>

      <view
        v-if="!loading && isLastPage && notifications.length > 0"
        class="flex flex-col items-center justify-center py-12 opacity-40"
      >
        <TIcon name="image" v-bind="{ size: '54rpx', color: '#0f172a' }" />
        <text class="text-slate-950 text-sm leading-none mt-2">{{ t('notification.noMore') }}</text>
      </view>

      <view
        v-if="!loading && notifications.length === 0"
        class="flex flex-col items-center justify-center py-15"
      >
        <TIcon name="notification" v-bind="{ size: '96rpx', color: '#cbd5e1' }" />
        <text class="text-slate-400 text-sm mt-3">{{ t('notification.empty') }}</text>
      </view>
    </view>
  </view>
</template>
