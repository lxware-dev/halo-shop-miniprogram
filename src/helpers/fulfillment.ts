import type {
  FulfillmentItemResponse,
  FulfillmentLabelResponse,
  FulfillmentUcResponse,
} from '@halo-dev/api-client';

const HTTP_TRACKING_URL_REGEXP = /^https?:\/\/\S+$/i;

const FULFILLMENT_STATUS_KEYS: Record<NonNullable<FulfillmentUcResponse['status']>, string> = {
  PENDING: 'logistics.fulfillmentStatus.pending',
  READY: 'logistics.fulfillmentStatus.ready',
  PROCESSING: 'logistics.fulfillmentStatus.processing',
  SHIPPED: 'logistics.fulfillmentStatus.shipped',
  COMPLETED: 'logistics.fulfillmentStatus.completed',
  FAILED: 'logistics.fulfillmentStatus.failed',
  CANCELLED: 'logistics.fulfillmentStatus.cancelled',
};

const LABEL_STATUS_KEYS: Record<NonNullable<FulfillmentLabelResponse['status']>, string> = {
  PENDING: 'logistics.labelStatus.pending',
  SHIPPED: 'logistics.labelStatus.shipped',
  DELIVERED: 'logistics.labelStatus.delivered',
  CANCELED: 'logistics.labelStatus.canceled',
};

export interface ShippingRecord {
  key: string;
  statusKey: string;
  completedAt?: string;
  items: FulfillmentItemResponse[];
  labels: FulfillmentLabelResponse[];
}

export function getFulfillmentStatusKey(status?: string): string {
  return (
    FULFILLMENT_STATUS_KEYS[status as keyof typeof FULFILLMENT_STATUS_KEYS] ?? 'logistics.unknown'
  );
}

export function getShippingLabelStatusKey(status?: string): string {
  return LABEL_STATUS_KEYS[status as keyof typeof LABEL_STATUS_KEYS] ?? 'logistics.unknown';
}

export function getShippingRecords(
  fulfillments: FulfillmentUcResponse[] | null | undefined,
): ShippingRecord[] {
  return (fulfillments ?? [])
    .filter((fulfillment) => fulfillment.type === 'SHIPPING')
    .map((fulfillment, index) => ({
      key: `shipping-${index}`,
      statusKey: getFulfillmentStatusKey(fulfillment.status),
      completedAt: fulfillment.completedAt,
      // Items belong to the fulfillment. The API does not associate them with individual labels.
      items: fulfillment.items ?? [],
      labels: fulfillment.labels ?? [],
    }));
}

export function findShippingLabel(
  fulfillments: FulfillmentUcResponse[] | null | undefined,
): FulfillmentLabelResponse | undefined {
  return getShippingRecords(fulfillments)
    .flatMap((record) => record.labels)
    .find((label) => label.carrier?.trim() || label.trackingNumber?.trim());
}

export function getTrackingUrl(label: FulfillmentLabelResponse): string | undefined {
  const value = label.trackingUrl?.trim();
  return value && HTTP_TRACKING_URL_REGEXP.test(value) ? value : undefined;
}

export async function loadShippingRecords(
  orderCode: string,
  request: (orderCode: string) => Promise<FulfillmentUcResponse[]>,
): Promise<ShippingRecord[]> {
  if (!orderCode.trim()) {
    throw new Error('Order code is required');
  }
  return getShippingRecords(await request(orderCode));
}
