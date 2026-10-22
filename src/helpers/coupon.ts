import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';

export function getCouponScopeMessage(coupon: CouponResponse | CustomerCouponResponse) {
  if (coupon.scope && coupon.scope !== 'ALL') {
    return 'coupon.scopeHint';
  }
  // Wallet snapshots do not expose product/category exclusions in the native contract.
  if ('couponName' in coupon) {
    return 'coupon.eligibilityHint';
  }
  const offer = coupon as CouponResponse;
  return offer.excludeSaleItems ||
    offer.excludedProductIds?.length ||
    offer.excludedCategoryIds?.length
    ? 'coupon.scopeWithExclusions'
    : 'coupon.allProducts';
}

export function getCouponValue(coupon: CouponResponse | CustomerCouponResponse, locale = 'zh-CN') {
  const value = coupon.discountValue ?? 0;
  return coupon.calculationType === 'PERCENTAGE' && locale.startsWith('zh')
    ? Number(((100 - value) / 10).toFixed(2)).toString()
    : Number(value.toFixed(2)).toString();
}

export function isCouponExpiring(coupon: CustomerCouponResponse, now = Date.now()) {
  const expiry = coupon.expiresAt ? Date.parse(coupon.expiresAt) : Number.NaN;
  return getCouponStatus(coupon, now) === 'AVAILABLE' && expiry - now <= 3 * 86400000;
}

export function getCouponStatus(coupon: CustomerCouponResponse, now = Date.now()) {
  if (coupon.status === 'USED') {
    return 'USED';
  }
  const expiry = coupon.expiresAt ? Date.parse(coupon.expiresAt) : Number.NaN;
  if (coupon.status === 'EXPIRED' || (Number.isFinite(expiry) && expiry <= now)) {
    return 'EXPIRED';
  }
  return coupon.status === 'AVAILABLE' ? 'AVAILABLE' : 'UNKNOWN';
}

export function normalizeCouponIds(ids: number[]) {
  return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
}
