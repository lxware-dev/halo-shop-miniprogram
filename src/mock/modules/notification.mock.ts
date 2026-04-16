import { defineMock } from '@alova/mock';
import type { PageResponse } from '@/types/api';
import type { NotificationItem, NotificationCategory } from '@/types/notification';

const NOTIFICATIONS: NotificationItem[] = [
  {
    id: 1,
    category: 'logistics',
    title: '订单物流通知',
    content: '您的订单 [20231024...] 已由顺丰快递发出，请注意查收，预计明日到达。',
    time: '10:30',
    isRead: false,
  },
  {
    id: 2,
    category: 'promotion',
    title: '限时秒杀提醒',
    content: '您关注的商品：【秋季新款】极简羊绒大衣，即将开始限时秒杀，仅限今日！',
    time: '昨天',
    isRead: true,
  },
  {
    id: 3,
    category: 'system',
    title: '系统升级公告',
    content: '为了提供更好的服务，我们将于10月28日凌晨进行系统升级维护，届时服务暂停2小时。',
    time: '周三',
    isRead: true,
  },
  {
    id: 4,
    category: 'refund',
    title: '退款成功通知',
    content: '您的售后申请 [REF-9021] 已完成，退款金额 ¥129.00 将在3-5个工作日内到账。',
    time: '10-20',
    isRead: true,
  },
  {
    id: 5,
    category: 'logistics',
    title: '包裹派送中',
    content: '您的包裹 [SF1234567890] 正在派送中，快递员将在今日为您配送，请保持手机畅通。',
    time: '10-18',
    isRead: true,
  },
  {
    id: 6,
    category: 'promotion',
    title: '双11活动预告',
    content: '双11大促即将开启，提前加购心仪商品，活动当天享受全场5折起优惠！',
    time: '10-15',
    isRead: true,
  },
];

const CATEGORY_MAP: Record<string, NotificationCategory | undefined> = {
  logistics: 'logistics',
  promotion: 'promotion',
  system: 'system',
  refund: 'refund',
};

const mockNotifications = [...NOTIFICATIONS];

export default defineMock({
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/notifications': ({ query }) => {
    const page = Number(query?.page ?? 0);
    const size = Number(query?.size ?? 20);
    const category = query?.category as string | undefined;
    const filteredCategory = category ? CATEGORY_MAP[category] : undefined;

    const filtered = filteredCategory
      ? mockNotifications.filter((n) => n.category === filteredCategory)
      : mockNotifications;

    const offset = page * size;
    const content = filtered.slice(offset, offset + size);

    return {
      content,
      totalElements: filtered.length,
      totalPages: Math.ceil(filtered.length / size),
      number: page,
      size,
      first: page === 0,
      last: offset + size >= filtered.length,
      empty: content.length === 0,
      numberOfElements: content.length,
    } satisfies PageResponse<NotificationItem>;
  },

  '[PUT]/apis/uc.api.ecommerce.halo.run/v1alpha1/notifications/{id}/read': ({ params }) => {
    const id = Number(params.id);
    const item = mockNotifications.find((n) => n.id === id);
    if (item) {
      item.isRead = true;
    }
    return item ?? null;
  },

  '[PUT]/apis/uc.api.ecommerce.halo.run/v1alpha1/notifications/read-all': () => {
    mockNotifications.forEach((n) => {
      n.isRead = true;
    });
    return { success: true };
  },
});
