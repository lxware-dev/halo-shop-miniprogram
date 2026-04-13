export type NotificationCategory = 'logistics' | 'promotion' | 'system' | 'refund';

export interface NotificationItem {
  id: number;
  category: NotificationCategory;
  title: string;
  content: string;
  time: string;
  isRead: boolean;
}
