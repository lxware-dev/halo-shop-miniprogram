import type { CartItemResponse, ProductVariantResponse } from '@halo-dev/api-client';

type QuantityLimits = Pick<ProductVariantResponse, 'trackInventory' | 'stock' | 'maxPerOrder'>;

/** maxPerUser is cumulative; the API does not expose the customer's remaining allowance. */
export function getQuantityLimit(limits: QuantityLimits | null | undefined, maximum = 999) {
  if (!limits) {
    return 0;
  }
  let limit = maximum;
  if (limits.trackInventory === true) {
    limit = Math.min(limit, Number.isFinite(limits.stock) ? Math.max(0, limits.stock!) : 0);
  }
  if (limits.maxPerOrder != null && Number.isFinite(limits.maxPerOrder)) {
    // Pro treats only null as unlimited; a configured zero/negative cap permits no purchase.
    limit = Math.min(limit, Math.max(0, limits.maxPerOrder));
  }
  return Math.floor(limit);
}

export function getCartQuantityLimit(item: CartItemResponse, maximum = 999) {
  return getQuantityLimit(
    {
      ...item.productVariant,
      maxPerOrder: item.maxPerOrder ?? item.productVariant?.maxPerOrder,
    },
    maximum,
  );
}

export function clampQuantity(value: unknown, maximum: number) {
  const quantity = Number(value);
  const integer = Number.isSafeInteger(quantity) ? quantity : 1;
  // An unavailable variant keeps a readable positive quantity; purchase actions reject it.
  return Math.max(1, Math.min(integer, maximum));
}

export function isQuantityAllowed(quantity: number, maximum: number) {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= maximum;
}
