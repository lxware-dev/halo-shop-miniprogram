import { defineMock } from '@alova/mock';
import type { CouponResponse, CustomerCouponResponse, CalculateResult } from '@halo-dev/api-client';
import { getCouponStatus, normalizeCouponIds } from '@/helpers/coupon';

const day = 86400000;
const now = Date.now();
export const mockCouponOffers: CouponResponse[] = [
  {
    id: 10,
    name: '新客满减券',
    calculationType: 'AMOUNT',
    discountValue: 20,
    minOrderAmount: 100,
    scope: 'ALL',
    validDays: 30,
    perCustomerLimit: 1,
    combineWithCoupons: false,
    combineWithOrderDiscount: false,
    description: '满 100 元减 20 元',
  },
  {
    id: 11,
    name: '全店九折券',
    calculationType: 'PERCENTAGE',
    discountValue: 10,
    maxDiscountAmount: 30,
    scope: 'ALL',
    validDays: 7,
    perCustomerLimit: 1,
    combineWithCoupons: true,
    combineWithOrderDiscount: true,
  },
];
export const mockWallet: CustomerCouponResponse[] = [
  {
    id: 1,
    couponId: 20,
    couponName: '满 100 减 15',
    calculationType: 'AMOUNT',
    discountValue: 15,
    minOrderAmount: 100,
    scope: 'ALL',
    combineWithCoupons: true,
    combineWithOrderDiscount: true,
    status: 'AVAILABLE',
    expiresAt: new Date(now + 7 * day).toISOString(),
  },
  {
    id: 2,
    couponId: 21,
    couponName: '满 10000 减 100',
    calculationType: 'AMOUNT',
    discountValue: 100,
    minOrderAmount: 10000,
    scope: 'ALL',
    combineWithCoupons: false,
    combineWithOrderDiscount: false,
    status: 'AVAILABLE',
    expiresAt: new Date(now + day).toISOString(),
  },
  {
    id: 3,
    couponId: 22,
    couponName: '不可叠加优惠券',
    calculationType: 'AMOUNT',
    discountValue: 5,
    scope: 'ALL',
    combineWithCoupons: false,
    combineWithOrderDiscount: false,
    status: 'AVAILABLE',
    expiresAt: new Date(now + 14 * day).toISOString(),
  },
  {
    id: 4,
    couponName: '已使用的优惠券',
    calculationType: 'AMOUNT',
    discountValue: 10,
    status: 'USED',
    usedAt: new Date(now - day).toISOString(),
    expiresAt: new Date(now + day).toISOString(),
  },
  {
    id: 5,
    couponName: '已过期的优惠券',
    calculationType: 'AMOUNT',
    discountValue: 10,
    status: 'AVAILABLE',
    expiresAt: new Date(now - day).toISOString(),
  },
];

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400, title: 'Bad Request', detail: message });
}

export function applyMockPromotions(
  base: CalculateResult,
  code?: string,
  ids: number[] = [],
): CalculateResult {
  const result = {
    ...base,
    appliedCoupons: [],
    rejectedCoupons: [],
    couponDiscountAmount: 0,
    discountId: undefined,
    discountName: undefined,
    discountCode: undefined,
    discountAmount: 0,
  } as CalculateResult;
  const subtotal = base.saleTotalAmount ?? 0;
  const normalizedCode = code?.trim().toUpperCase();
  if (normalizedCode) {
    if (normalizedCode !== 'SAVE10') {
      badRequest('优惠码无效或已过期');
    }
    result.discountId = 1;
    result.discountName = '九折优惠';
    result.discountCode = normalizedCode;
    result.discountAmount = Number((subtotal * 0.1).toFixed(2));
  }
  const valid: CustomerCouponResponse[] = [];
  for (const id of normalizeCouponIds(ids)) {
    const coupon = mockWallet.find((item) => item.id === id);
    const reasonCode = !coupon
      ? 'notFound'
      : getCouponStatus(coupon) === 'EXPIRED'
        ? 'couponExpired'
        : getCouponStatus(coupon) !== 'AVAILABLE'
          ? 'notAvailable'
          : (coupon.minOrderAmount ?? 0) > subtotal
            ? 'minOrderAmountNotMet'
            : normalizedCode && !coupon.combineWithOrderDiscount
              ? 'incompatibleWithDiscount'
              : undefined;
    if (reasonCode) {
      result.rejectedCoupons!.push({
        customerCouponId: id,
        couponName: coupon?.couponName,
        reasonCode,
      });
    } else if (coupon) {
      valid.push(coupon);
    }
  }
  const exclusive = valid.find((coupon) => !coupon.combineWithCoupons);
  for (const coupon of valid) {
    if (exclusive && coupon !== exclusive) {
      result.rejectedCoupons!.push({
        customerCouponId: coupon.id,
        couponName: coupon.couponName,
        reasonCode: 'incompatibleWithOtherCoupons',
      });
      continue;
    }
    const raw =
      coupon.calculationType === 'PERCENTAGE'
        ? (subtotal * (coupon.discountValue ?? 0)) / 100
        : (coupon.discountValue ?? 0);
    const remaining = Math.max(
      subtotal - (result.discountAmount ?? 0) - (result.couponDiscountAmount ?? 0),
      0,
    );
    const amount = Number(
      Math.max(0, Math.min(raw, coupon.maxDiscountAmount ?? raw, remaining)).toFixed(2),
    );
    result.appliedCoupons!.push({
      customerCouponId: coupon.id,
      couponName: coupon.couponName,
      discountAmount: amount,
    });
    result.couponDiscountAmount = Number(((result.couponDiscountAmount ?? 0) + amount).toFixed(2));
  }
  result.payableAmount = Number(
    (
      subtotal +
      (base.shippingFeeAmount ?? 0) -
      (result.discountAmount ?? 0) -
      (result.couponDiscountAmount ?? 0)
    ).toFixed(2),
  );
  return result;
}

export function consumeMockCoupons(ids: number[], orderCode: string) {
  for (const coupon of mockWallet) {
    if (coupon.id && ids.includes(coupon.id)) {
      coupon.status = 'USED';
      coupon.usedAt = new Date().toISOString();
    }
  }
  return orderCode;
}

export default defineMock({
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/coupons/-/mine': () =>
    mockWallet.map((coupon) => ({ ...coupon })),
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/coupons/-/claimable': () =>
    mockCouponOffers.filter((offer) => !mockWallet.some((coupon) => coupon.couponId === offer.id)),
  '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/coupons/{id}/claim': ({ params }) => {
    const offer = mockCouponOffers.find((item) => item.id === Number(params.id));
    if (!offer || mockWallet.some((item) => item.couponId === offer.id)) {
      return {
        status: 400,
        statusText: 'Bad Request',
        body: { status: 400, title: 'Bad Request', detail: '已达到领取次数上限' },
      };
    }
    const id = Math.max(...mockWallet.map((item) => item.id ?? 0)) + 1;
    mockWallet.push({
      ...offer,
      id,
      couponId: offer.id,
      couponName: offer.name,
      status: 'AVAILABLE',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (offer.validDays ?? 7) * day).toISOString(),
    });
    return { status: 204, statusText: 'No Content', body: '' };
  },
});
