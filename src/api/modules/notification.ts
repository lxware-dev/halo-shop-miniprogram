import { alovaInst } from '@/utils/request';
import type { PageResponse } from '@/types/api';
import type { NotificationItem, NotificationCategory } from '@/types/notification';

export type { NotificationItem, NotificationCategory };

const api = alovaInst;

export const notificationApi = {
  getList: (params?: { page?: number; size?: number; category?: NotificationCategory }) =>
    api.Get<PageResponse<NotificationItem>>(
      '/apis/uc.api.ecommerce.halo.run/v1alpha1/notifications',
      { params },
    ),

  markRead: (id: number) =>
    api.Put<NotificationItem | null>(
      `/apis/uc.api.ecommerce.halo.run/v1alpha1/notifications/${id}/read`,
    ),

  markAllRead: () =>
    api.Put<{ success: boolean }>(
      '/apis/uc.api.ecommerce.halo.run/v1alpha1/notifications/read-all',
    ),
};
