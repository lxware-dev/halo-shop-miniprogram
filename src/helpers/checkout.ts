import type {
  CheckoutContextResponse,
  MpCheckoutSubmitRequest,
  OrderCreateResponse,
  PrepareCheckoutRequest,
} from '@halo-dev/api-client';

export class CheckoutAccountChangedError extends Error {
  constructor() {
    super('Checkout account changed');
  }
}

export class CheckoutSubmissionUncertainError extends Error {
  constructor() {
    super('Checkout submission result is uncertain');
  }
}

/** Only a structured client rejection can provide a user-facing business reason. */
export function getCheckoutBusinessDetail(error: unknown): string | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('status' in error) ||
    error.status !== 400 ||
    !('detail' in error) ||
    typeof error.detail !== 'string'
  ) {
    return null;
  }
  return error.detail.trim() || null;
}

export interface CheckoutRequest {
  path: string;
  data: PrepareCheckoutRequest | MpCheckoutSubmitRequest;
  owner: string;
}

interface PreparedCheckout {
  owner: string;
  context: CheckoutContextResponse;
  submission?: Promise<OrderCreateResponse>;
}

/** Keep one submission result for each prepared checkout, including uncertain results. */
export function createCheckoutClient(options: {
  owner: () => string;
  request: (request: CheckoutRequest) => Promise<unknown>;
}) {
  const prepared = new Map<string, PreparedCheckout>();
  const base = '/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-';

  async function prepareCheckout(
    payload: PrepareCheckoutRequest,
  ): Promise<CheckoutContextResponse> {
    const owner = options.owner();
    if (!owner) {
      throw new CheckoutAccountChangedError();
    }
    const context = (await options.request({
      path: `${base}/prepare`,
      data: payload,
      owner,
    })) as CheckoutContextResponse;
    if (owner !== options.owner()) {
      throw new CheckoutAccountChangedError();
    }
    const amount = context?.calculateResult?.payableAmount;
    if (!context?.id || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid checkout response');
    }
    // An existing submission must survive another response using the same context id.
    if (!prepared.get(context.id)?.submission) {
      prepared.set(context.id, { owner, context });
    }
    if (prepared.size > 20) {
      prepared.delete(prepared.keys().next().value!);
    }
    return context;
  }

  function submitOrder(
    payload: MpCheckoutSubmitRequest,
    contextId: string,
  ): Promise<OrderCreateResponse> {
    const checkout = prepared.get(contextId);
    if (!checkout) {
      return Promise.reject(new Error('Review checkout before submitting'));
    }
    if (checkout.owner !== options.owner()) {
      return Promise.reject(new CheckoutAccountChangedError());
    }
    if (checkout.submission) {
      return checkout.submission;
    }
    if (payload.expectedPayableAmount !== checkout.context.calculateResult?.payableAmount) {
      return Promise.reject(Object.assign(new Error('Checkout amount changed'), { status: 400 }));
    }
    checkout.submission = Promise.resolve().then(async () => {
      try {
        if (checkout.owner !== options.owner()) {
          throw new CheckoutAccountChangedError();
        }
        const result = (await options.request({
          path: `${base}/submit`,
          data: payload,
          owner: checkout.owner,
        })) as OrderCreateResponse;
        if (checkout.owner !== options.owner() || !result?.order?.orderCode) {
          throw new CheckoutSubmissionUncertainError();
        }
        return result;
      } catch (error) {
        if (
          error instanceof CheckoutAccountChangedError ||
          (typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            typeof error.status === 'number' &&
            error.status >= 400 &&
            error.status < 500)
        ) {
          checkout.submission = undefined;
          throw error;
        }
        // A timeout or 5xx can happen after creation; never repeat this POST automatically.
        throw new CheckoutSubmissionUncertainError();
      }
    });
    return checkout.submission;
  }

  return { prepareCheckout, submitOrder };
}
