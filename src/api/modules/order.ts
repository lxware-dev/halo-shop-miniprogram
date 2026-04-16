import { alovaInst } from '@/utils/request';
import type {
  OrderResponse,
  FulfillmentUcResponse,
  PaymentMethodPublicResponse,
  PaymentInitiateRequest,
  PaymentInitiateResponse,
} from '@halo-dev/api-client';
import type { PageResponse, PageQuery } from '@/types/api';

const api = alovaInst;

export interface OrderListQuery extends PageQuery {
  paymentStatuses?: string[];
  fulfillmentStatuses?: string[];
  statuses?: string[];
}

export const orderApi = {
  /**
   * Fetch the paginated order list for the current user
   */
  getOrders: (query?: OrderListQuery) =>
    api.Get<PageResponse<OrderResponse>>('/apis/uc.api.ecommerce.halo.run/v1alpha1/orders', {
      params: query,
    }),

  /**
   * Fetch order details
   */
  getOrder: (orderCode: string) =>
    api.Get<OrderResponse>(`/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/${orderCode}`),

  /**
   * Fetch order fulfillment info (logistics/tracking number, etc.)
   */
  getOrderFulfillments: (orderCode: string) =>
    api.Get<FulfillmentUcResponse[]>(
      `/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/${orderCode}/fulfillments`,
    ),

  /**
   * Fetch available payment methods in the current Mini Program environment
   */
  getPaymentMethods: () => {
    return api.Get<PaymentMethodPublicResponse[]>(
      `/apis/mp.api.ecommerce.halo.run/v1alpha1/payment-methods`,
    );
  },

  /**
   * Initiate order payment
   */
  initiatePayment: (orderCode: string, payload?: PaymentInitiateRequest) =>
    api.Post<PaymentInitiateResponse>(
      `/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/${orderCode}/initiate-payment`,
      payload ?? {},
    ),

  /**
   * Confirm receipt
   */
  markAsReceived: (orderCode: string) =>
    api.Post(`/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/${orderCode}/mark-as-received`, {}),

  /**
   * Query payment session status
   */
  getPaymentSessionStatus: (sessionCode: string) =>
    api.Get<string>(
      `/apis/uc.api.ecommerce.halo.run/v1alpha1/payment-sessions/${sessionCode}/status`,
    ),
};
