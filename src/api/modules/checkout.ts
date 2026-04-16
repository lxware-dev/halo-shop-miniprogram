import { alovaInst } from '@/utils/request';
import type {
  CheckoutContextResponse,
  MpCheckoutSubmitRequest,
  OrderCreateResponse,
  PrepareCheckoutRequest,
} from '@halo-dev/api-client';

const api = alovaInst;

export const checkoutApi = {
  /**
   * Prepare the checkout context
   */
  prepareCheckout: (payload: PrepareCheckoutRequest) =>
    api.Post<CheckoutContextResponse>(
      `/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/prepare`,
      payload,
    ),

  /**
   * Submit checkout from Mini Program
   */
  submitOrder: (payload: MpCheckoutSubmitRequest) =>
    api.Post<OrderCreateResponse>(
      `/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/submit`,
      payload,
    ),
};
