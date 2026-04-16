import type { OrderResponse, OrderItemResponse } from '@halo-dev/api-client';
import { translate } from '@/locales';

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

interface OrderStatusPreset {
  label: string;
  textClass: string;
  bgClass: string;
  heroBgClass: string;
  subtitle?: string;
}

const ORDER_STATUS_INFO_PRESETS = {
  CANCELLED: {
    label: 'order.status.cancelled',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-400',
    subtitle: 'order.status.cancelledSubtitle',
  },
  REFUNDED: {
    label: 'order.status.refunded',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-400',
    subtitle: 'order.status.refundedSubtitle',
  },
  PARTIAL_REFUNDED: {
    label: 'order.status.partialRefunded',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-100',
    heroBgClass: 'bg-amber-500',
    subtitle: 'order.status.partialRefundedSubtitle',
  },
  COMPLETED: {
    label: 'order.status.completed',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-100',
    heroBgClass: 'bg-emerald-500',
    subtitle: 'order.status.completedSubtitle',
  },
  PENDING_PAYMENT: {
    label: 'order.status.pendingPayment',
    textClass: 'text-brand',
    bgClass: 'bg-red-100',
    heroBgClass: 'bg-brand',
    subtitle: 'order.status.pendingPaymentSubtitle',
  },
  AUTHORIZING_PAYMENT: {
    label: 'order.status.authorizingPayment',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-blue-500',
    subtitle: 'order.status.authorizingPaymentSubtitle',
  },
  PAID: {
    label: 'order.status.paid',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-blue-500',
    subtitle: 'order.status.paidSubtitle',
  },
  PAID_NO_SHIPPING: {
    label: 'order.status.paid',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-blue-500',
    subtitle: 'order.status.paidNoShippingSubtitle',
  },
  PENDING_FULFILLMENT: {
    label: 'order.status.pendingFulfillment',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-100',
    heroBgClass: 'bg-slate-500',
    subtitle: 'order.status.pendingFulfillmentSubtitle',
  },
  WAITING_RECEIPT: {
    label: 'order.status.waitingReceipt',
    textClass: 'text-orange-700',
    bgClass: 'bg-orange-100',
    heroBgClass: 'bg-slate-500',
    subtitle: 'order.status.waitingReceiptSubtitle',
  },
  PAYMENT_FAILED: {
    label: 'order.status.paymentFailed',
    textClass: 'text-red-700',
    bgClass: 'bg-red-100',
    heroBgClass: 'bg-red-500',
    subtitle: 'order.status.paymentFailedSubtitle',
  },
  EXPIRED: {
    label: 'order.status.expired',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-400',
    subtitle: 'order.status.expiredSubtitle',
  },
  PROCESSING: {
    label: 'order.status.processing',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100',
    heroBgClass: 'bg-slate-500',
    subtitle: '',
  },
} satisfies Record<string, OrderStatusPreset>;

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
): OrderStatusPreset {
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
  let preset: OrderStatusPreset;

  if (order.status === 'CANCELLED' || order.paymentStatus === 'CANCELLED') {
    preset = ORDER_STATUS_INFO_PRESETS.CANCELLED;
  } else if (order.refundStatus === 'FULL' || order.paymentStatus === 'REFUNDED') {
    preset = ORDER_STATUS_INFO_PRESETS.REFUNDED;
  } else if (order.refundStatus === 'PARTIAL') {
    preset = ORDER_STATUS_INFO_PRESETS.PARTIAL_REFUNDED;
  } else if (order.status === 'ARCHIVED') {
    preset = ORDER_STATUS_INFO_PRESETS.COMPLETED;
  } else if (order.paymentStatus === 'PAID') {
    preset = resolvePaidOrderStatusInfo(order, orderRequiresShipping);
  } else {
    const paymentPresetKey = order.paymentStatus
      ? PAYMENT_STATUS_TO_PRESET[order.paymentStatus]
      : undefined;

    preset = paymentPresetKey
      ? ORDER_STATUS_INFO_PRESETS[paymentPresetKey]
      : ORDER_STATUS_INFO_PRESETS.PROCESSING;
  }

  return {
    ...preset,
    label: translate(preset.label),
    subtitle: preset.subtitle ? translate(preset.subtitle) : '',
  };
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
