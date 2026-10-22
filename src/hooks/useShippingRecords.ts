import { orderApi } from '@/api/modules/order';
import { loadShippingRecords } from '@/helpers/fulfillment';
import type { ShippingRecord } from '@/helpers/fulfillment';
import { sendRequest, useAsyncQuery } from '@/hooks/useRequest';

export function useShippingRecords() {
  return useAsyncQuery<ShippingRecord[], string>(
    (orderCode) =>
      loadShippingRecords(orderCode, (code) => sendRequest(orderApi.getOrderFulfillments(code))),
    { immediate: false },
  );
}
