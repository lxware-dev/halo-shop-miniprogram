import { alovaInst } from '@/utils/request';
import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';

const base = '/apis/uc.api.ecommerce.halo.run/v1alpha1/coupons';

export const couponApi = {
  listMine: () => alovaInst.Get<CustomerCouponResponse[]>(`${base}/-/mine`),
  listClaimable: () => alovaInst.Get<CouponResponse[]>(`${base}/-/claimable`),
  claim: (id: number) =>
    alovaInst.Post<void>(`${base}/${id}/claim`, undefined, {
      meta: { handledErrorStatuses: [400, 404] },
    }),
};
