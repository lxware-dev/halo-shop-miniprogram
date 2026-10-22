import type { OrderResponse, PaymentMethodPublicResponse } from '@halo-dev/api-client';

export type PaymentResult = 'success' | 'fail' | 'pending';

const FAILED_STATUSES = new Set(['FAILED', 'EXPIRED', 'CANCELLED']);

/** Only a backend terminal status can confirm the payment outcome. */
export function resolvePaymentResult(
  order: OrderResponse | null,
  sessionStatus?: string | null,
): PaymentResult {
  if (order?.paymentStatus === 'PAID' || sessionStatus === 'SUCCESS') {
    return 'success';
  }
  if (FAILED_STATUSES.has(sessionStatus ?? '') || FAILED_STATUSES.has(order?.paymentStatus ?? '')) {
    return 'fail';
  }
  return 'pending';
}

export function miniProgramPaymentMethods(methods: PaymentMethodPublicResponse[]) {
  return methods.filter(
    (method) =>
      method.provider === 'WECHAT_PAY' &&
      method.enabled === true &&
      typeof method.id === 'number' &&
      (!method.scene || method.scene === 'MINI_PROGRAM'),
  );
}

interface PollPaymentOptions {
  readStatus: () => Promise<string>;
  wait: () => Promise<void>;
  isActive: () => boolean;
  maxAttempts?: number;
}

/** Exhaustion and transport errors leave the payment unconfirmed. */
export async function pollPaymentSession({
  readStatus,
  wait,
  isActive,
  maxAttempts = 15,
}: PollPaymentOptions): Promise<PaymentResult | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait();
    if (!isActive()) {
      return null;
    }
    try {
      const status = await readStatus();
      if (!isActive()) {
        return null;
      }
      const result = resolvePaymentResult(null, status);
      if (result !== 'pending') {
        return result;
      }
    } catch {
      if (!isActive()) {
        return null;
      }
    }
  }
  return isActive() ? 'pending' : null;
}
