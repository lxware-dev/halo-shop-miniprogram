import { onScopeDispose, ref, shallowRef } from 'vue';
import type { OrderResponse } from '@halo-dev/api-client';
import { orderApi } from '@/api/modules/order';
import { sendRequest } from '@/hooks/useRequest';
import { resolvePaymentResult } from '@/helpers/payment';
import type { PaymentResult } from '@/helpers/payment';

export function usePaymentResult() {
  const order = ref<OrderResponse | null>(null);
  const result = shallowRef<PaymentResult>('pending');
  const checking = shallowRef(false);
  const queryFailed = shallowRef(false);
  let currentOrderCode = '';
  let active = true;
  let version = 0;

  function dispose() {
    active = false;
    version++;
  }
  onScopeDispose(dispose);

  async function check(orderCode: string, sessionCode?: string) {
    if (!orderCode || checking.value) {
      return;
    }
    const requestVersion = ++version;
    checking.value = true;
    queryFailed.value = false;
    result.value = 'pending';
    if (currentOrderCode !== orderCode) {
      order.value = null;
      currentOrderCode = orderCode;
    }
    const [orderResponse, sessionResponse] = await Promise.allSettled([
      sendRequest(orderApi.getOrder(orderCode)),
      sessionCode
        ? sendRequest(orderApi.getPaymentSessionStatus(sessionCode))
        : Promise.resolve(null),
    ]);
    if (!active || requestVersion !== version) {
      return;
    }
    if (orderResponse.status === 'fulfilled') {
      order.value = orderResponse.value;
    }
    result.value = resolvePaymentResult(
      orderResponse.status === 'fulfilled' ? orderResponse.value : null,
      sessionResponse.status === 'fulfilled' ? sessionResponse.value : null,
    );
    queryFailed.value =
      orderResponse.status === 'rejected' || sessionResponse.status === 'rejected';
    checking.value = false;
  }

  return { order, result, checking, queryFailed, check, dispose };
}
