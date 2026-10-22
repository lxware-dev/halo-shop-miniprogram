import type { OrderResponse } from '@halo-dev/api-client';

const SERVER_TIMESTAMP_REGEXP =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export interface OrderReceiptTimes {
  autoConfirmAt?: string;
  confirmAt?: string;
}

function getServerTimestamp(value?: string): string | undefined {
  const timestamp = value?.trim();
  const match = timestamp ? SERVER_TIMESTAMP_REGEXP.exec(timestamp) : null;
  if (!timestamp || !match || !Number.isFinite(Date.parse(timestamp))) {
    return;
  }
  const calendarDate = new Date(`${match[1]}T00:00:00Z`);
  if (calendarDate.toISOString().slice(0, 10) !== match[1]) {
    return;
  }
  return timestamp;
}

export function canConfirmOrderReceipt(
  order: OrderResponse | null | undefined,
  orderRequiresShipping: boolean,
): boolean {
  return !!(
    orderRequiresShipping &&
    order?.status === 'OPEN' &&
    order.paymentStatus === 'PAID' &&
    order.fulfillmentStatus === 'FULFILLED' &&
    !getServerTimestamp(order.confirmAt)
  );
}

export function getOrderReceiptTimes(
  order: OrderResponse | null | undefined,
  orderRequiresShipping: boolean,
): OrderReceiptTimes {
  if (!order || !orderRequiresShipping) {
    return {};
  }
  const confirmAt = getServerTimestamp(order.confirmAt);
  if (confirmAt) {
    return { confirmAt };
  }
  if (!canConfirmOrderReceipt(order, orderRequiresShipping)) {
    return {};
  }
  const autoConfirmAt = getServerTimestamp(order.autoConfirmAt);
  return autoConfirmAt ? { autoConfirmAt } : {};
}
