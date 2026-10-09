import type {
  CdkUcResponse,
  CustomerDigitalResourceUcResponse,
  FulfillmentUcResponse,
} from '@halo-dev/api-client';

export interface VirtualDelivery {
  status: FulfillmentUcResponse['status'];
  completedAt?: string;
  items: {
    title: string;
    quantity: number;
    instructions?: string;
  }[];
}

export interface DeliveredCdk {
  key: string;
  title: string;
  cdk: CdkUcResponse;
}

export interface DeliveredResource {
  key: string;
  title: string;
  resource: CustomerDigitalResourceUcResponse;
}

/**
 * Pro returns CDKs and resources by order item, so the same content may appear in
 * multiple fulfillment records. Keep the delivery history intact and show each
 * purchased asset only once in the order-wide content section.
 */
export function collectVirtualFulfillment(fulfillments: FulfillmentUcResponse[]) {
  const deliveries: VirtualDelivery[] = [];
  const cdks: DeliveredCdk[] = [];
  const resources: DeliveredResource[] = [];
  const seenCdks = new Set<string>();
  const seenResources = new Set<string>();

  for (const fulfillment of fulfillments) {
    if (fulfillment.type !== 'VIRTUAL') {
      continue;
    }

    deliveries.push({
      status: fulfillment.status,
      completedAt: fulfillment.completedAt,
      items: (fulfillment.items ?? []).map((item) => ({
        title: item.orderItem?.itemTitle ?? '',
        quantity: item.quantity ?? 0,
        instructions: item.instructions,
      })),
    });

    if (fulfillment.status !== 'COMPLETED') {
      continue;
    }

    for (const item of fulfillment.items ?? []) {
      const title = item.orderItem?.itemTitle ?? '';
      const variantId = item.orderItem?.productVariantId ?? title;

      for (const cdk of item.cdks ?? []) {
        if (!cdk.code) {
          continue;
        }
        const key = `${variantId}:${cdk.code}:${cdk.secret ?? ''}`;
        if (!seenCdks.has(key)) {
          seenCdks.add(key);
          cdks.push({ key, title, cdk });
        }
      }

      for (const resource of item.digitalResources ?? []) {
        const identity = resource.publicId ?? resource.resourceUrl ?? resource.attachmentId;
        if (!identity) {
          continue;
        }
        const key = `${variantId}:${identity}`;
        if (!seenResources.has(key)) {
          seenResources.add(key);
          resources.push({ key, title, resource });
        }
      }
    }
  }

  return { deliveries, cdks, resources };
}
