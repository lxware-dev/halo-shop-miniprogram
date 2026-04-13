import type { OrderResponse, OrderItemResponse } from '@halo-dev/api-client';

/**
 * Whether the order requires logistics delivery
 * - If any item explicitly requires shipping, the order is considered to require logistics
 * - For backward compatibility, missing shippingRequired defaults to requiring shipping
 */
export function requiresShipping(order: OrderResponse): boolean {
  const items = order.items ?? [];
  if (!items.length) {
    return false;
  }
  return items.some((item) => item.productVariantSnapshot?.shippingRequired !== false);
}

/**
 * Display metadata for order status
 * - textClass/bgClass: for list badges (light background + dark text)
 * - heroBgClass: for detail-page status banners (solid dark background with white text)
 */
export interface OrderStatusInfo {
  label: string;
  // UnoCSS text color class (used for badges)
  textClass: string;
  // UnoCSS background color class (light, used for badge backgrounds)
  bgClass: string;
  // UnoCSS background color class (solid dark, used for detail-page hero banners)
  heroBgClass: string;
  // Subtitle used only on the order detail page
  subtitle?: string;
}

const ORDER_STATUS_INFO_PRESETS = {
  CANCELLED: {
    label: '已取消',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-400',
    subtitle: '订单已取消',
  },
  REFUNDED: {
    label: '已退款',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-400',
    subtitle: '订单已退款',
  },
  PARTIAL_REFUNDED: {
    label: '部分退款',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-100',
    heroBgClass: 'bg-amber-500',
    subtitle: '订单存在部分退款，请留意售后状态',
  },
  COMPLETED: {
    label: '已完成',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-100',
    heroBgClass: 'bg-emerald-500',
    subtitle: '交易已完成，感谢您的购买',
  },
  PENDING_PAYMENT: {
    label: '待付款',
    textClass: 'text-brand',
    bgClass: 'bg-red-100',
    heroBgClass: 'bg-brand',
    subtitle: '请尽快完成支付，超时将自动取消',
  },
  AUTHORIZING_PAYMENT: {
    label: '支付处理中',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-blue-500',
    subtitle: '正在确认支付结果，请稍候',
  },
  PAID: {
    label: '已支付',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-blue-500',
    subtitle: '订单已支付',
  },
  PAID_NO_SHIPPING: {
    label: '已支付',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-blue-500',
    subtitle: '订单已支付，无需物流配送',
  },
  PENDING_FULFILLMENT: {
    label: '待发货',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-slate-500',
    subtitle: '商家正在处理您的订单',
  },
  WAITING_RECEIPT: {
    label: '待收货',
    textClass: 'text-orange-700',
    bgClass: 'bg-orange-100',
    heroBgClass: 'bg-slate-500',
    subtitle: '商家已发货，请留意物流动态',
  },
  PAYMENT_FAILED: {
    label: '支付失败',
    textClass: 'text-red-700',
    bgClass: 'bg-red-100',
    heroBgClass: 'bg-red-500',
    subtitle: '支付未成功，请重新下单或稍后再试',
  },
  EXPIRED: {
    label: '已关闭',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-400',
    subtitle: '订单支付已过期',
  },
  PROCESSING: {
    label: '处理中',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-500',
    subtitle: '',
  },
} satisfies Record<string, OrderStatusInfo>;

type OrderStatusPresetKey = keyof typeof ORDER_STATUS_INFO_PRESETS;

const PAYMENT_STATUS_TO_PRESET: Partial<
  Record<NonNullable<OrderResponse['paymentStatus']>, OrderStatusPresetKey>
> = {
  PENDING: 'PENDING_PAYMENT',
  AUTHORIZING: 'AUTHORIZING_PAYMENT',
  FAILED: 'PAYMENT_FAILED',
  EXPIRED: 'EXPIRED',
};

const PAID_FULFILLMENT_STATUS_TO_PRESET: Partial<
  Record<NonNullable<OrderResponse['fulfillmentStatus']>, OrderStatusPresetKey>
> = {
  PENDING: 'PENDING_FULFILLMENT',
  PROCESSING: 'WAITING_RECEIPT',
  FULFILLED: 'WAITING_RECEIPT',
};

function resolvePaidOrderStatusInfo(
  order: OrderResponse,
  orderRequiresShipping: boolean,
): OrderStatusInfo {
  if (!orderRequiresShipping) {
    return ORDER_STATUS_INFO_PRESETS.PAID_NO_SHIPPING;
  }

  const fulfillmentPresetKey = order.fulfillmentStatus
    ? PAID_FULFILLMENT_STATUS_TO_PRESET[order.fulfillmentStatus]
    : undefined;

  return fulfillmentPresetKey
    ? ORDER_STATUS_INFO_PRESETS[fulfillmentPresetKey]
    : ORDER_STATUS_INFO_PRESETS.PAID;
}

/**
 * Derive display labels and colors from order status / payment status / fulfillment status,
 * while supporting both order list (badge style) and order detail (subtitle + heroBgClass) scenarios
 */
export function getOrderStatusInfo(order: OrderResponse): OrderStatusInfo {
  const orderRequiresShipping = requiresShipping(order);

  if (order.status === 'CANCELLED' || order.paymentStatus === 'CANCELLED') {
    return ORDER_STATUS_INFO_PRESETS.CANCELLED;
  }
  if (order.refundStatus === 'FULL' || order.paymentStatus === 'REFUNDED') {
    return ORDER_STATUS_INFO_PRESETS.REFUNDED;
  }
  if (order.refundStatus === 'PARTIAL') {
    return ORDER_STATUS_INFO_PRESETS.PARTIAL_REFUNDED;
  }
  if (order.status === 'ARCHIVED') {
    return ORDER_STATUS_INFO_PRESETS.COMPLETED;
  }

  if (order.paymentStatus === 'PAID') {
    return resolvePaidOrderStatusInfo(order, orderRequiresShipping);
  }

  const paymentPresetKey = order.paymentStatus
    ? PAYMENT_STATUS_TO_PRESET[order.paymentStatus]
    : undefined;

  return paymentPresetKey
    ? ORDER_STATUS_INFO_PRESETS[paymentPresetKey]
    : ORDER_STATUS_INFO_PRESETS.PROCESSING;
}

/**
 * Whether to show the "Pay Now" button
 */
export function canPayNow(order: OrderResponse): boolean {
  return order.paymentStatus === 'PENDING' && order.status === 'OPEN';
}

/**
 * Whether to show the "Cancel Order" button
 */
export function canCancelOrder(order: OrderResponse): boolean {
  return order.paymentStatus === 'PENDING' && order.status === 'OPEN';
}

/**
 * Whether to show the "View Logistics" button
 */
export function canViewLogistics(order: OrderResponse): boolean {
  return (
    requiresShipping(order) &&
    order.paymentStatus === 'PAID' &&
    (order.fulfillmentStatus === 'PROCESSING' || order.fulfillmentStatus === 'FULFILLED')
  );
}

/**
 * Whether to show the "Confirm Receipt" button
 */
export function canConfirmReceive(order: OrderResponse): boolean {
  return (
    requiresShipping(order) &&
    order.paymentStatus === 'PAID' &&
    (order.fulfillmentStatus === 'PROCESSING' || order.fulfillmentStatus === 'FULFILLED') &&
    order.status === 'OPEN'
  );
}

/**
 * Whether to show the "Buy Again" button
 */
export function canBuyAgain(order: OrderResponse): boolean {
  return (
    order.status === 'ARCHIVED' ||
    order.status === 'CANCELLED' ||
    order.paymentStatus === 'REFUNDED' ||
    order.paymentStatus === 'CANCELLED'
  );
}

/**
 * Get display text for product specs
 *
 * @param specValues spec value array (productVariantSnapshot?.specValues or productVariant?.specValues)
 * @param format display "Name: Value" for 'name-value', or value only for 'value-only' (default: 'name-value')
 */
export function getSpecText(
  specValues: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  format: 'name-value' | 'value-only' = 'name-value',
): string {
  if (!specValues?.length) {
    return '';
  }
  if (format === 'value-only') {
    return specValues
      .map((sv) => sv.value)
      .filter(Boolean)
      .join('；');
  }
  return specValues.map((sv) => [sv.name, sv.value].filter(Boolean).join('：')).join('；') || '';
}

/**
 * Get the first N products for order display (default: 3)
 *
 * @param order order
 * @param limit max count (default: 3)
 * @returns the first N products for order display
 */
export function getDisplayItems(order: OrderResponse, limit = 3): OrderItemResponse[] {
  return (order.items ?? []).slice(0, limit);
}
