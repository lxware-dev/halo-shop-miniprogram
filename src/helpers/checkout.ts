import type {
  CheckoutContextResponse,
  MpCheckoutSubmitRequest,
  OrderCreateResponse,
  PrepareCheckoutRequest,
} from '@halo-dev/api-client';
import { normalizeCouponIds } from '@/helpers/coupon';

export interface CheckoutPromotionSelection {
  discountCode?: string;
  customerCouponIds: number[];
}

export interface CheckoutRequest {
  path: string;
  method: 'POST';
  data: object;
  owner: string;
  handleValidationError?: boolean;
}

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

interface PreparedCheckout {
  owner: string;
  context: CheckoutContextResponse;
  submission?: Promise<OrderCreateResponse>;
}

function acceptedSelection(context: CheckoutContextResponse): CheckoutPromotionSelection {
  return {
    discountCode: context.calculateResult?.discountCode || undefined,
    customerCouponIds: normalizeCouponIds(
      (context.calculateResult?.appliedCoupons ?? []).flatMap((coupon) =>
        coupon.customerCouponId ? [coupon.customerCouponId] : [],
      ),
    ),
  };
}

/** Keep checkout on the native MP contract; promotion payloads are currently Mock-only. */
export function createCheckoutClient(options: {
  request: (request: CheckoutRequest) => Promise<unknown>;
  owner: () => string;
  promotionsEnabled: boolean;
}) {
  const prepared = new Map<string, PreparedCheckout>();
  const base = '/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-';

  async function prepareCheckout(
    payload: PrepareCheckoutRequest,
    input: {
      contextId?: string;
      selection?: CheckoutPromotionSelection;
      handleValidationError?: boolean;
    } = {},
  ): Promise<CheckoutContextResponse> {
    const owner = options.owner();
    const previous = input.contextId ? prepared.get(input.contextId) : undefined;
    if (previous && previous.owner !== owner) {
      throw new CheckoutAccountChangedError();
    }
    const selection = {
      discountCode: input.selection?.discountCode?.trim() || undefined,
      customerCouponIds: normalizeCouponIds(input.selection?.customerCouponIds ?? []),
    };
    if (
      !options.promotionsEnabled &&
      (selection.discountCode || selection.customerCouponIds.length)
    ) {
      throw new Error('Native MP promotions are unavailable until Halo Pro #670 is implemented');
    }
    const context = (await options.request({
      path: `${base}/prepare`,
      method: 'POST',
      data: options.promotionsEnabled ? { ...payload, ...selection } : payload,
      owner,
      handleValidationError: input.handleValidationError,
    })) as CheckoutContextResponse;
    if (owner !== options.owner()) {
      throw new CheckoutAccountChangedError();
    }
    const amount = context?.calculateResult?.payableAmount;
    if (!context?.id || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid checkout response');
    }
    prepared.set(context.id, { owner, context });
    if (prepared.size > 20) {
      prepared.delete(prepared.keys().next().value!);
    }
    return context;
  }

  async function submitOrder(
    payload: MpCheckoutSubmitRequest,
    contextId?: string,
  ): Promise<OrderCreateResponse> {
    const checkout = contextId ? prepared.get(contextId) : undefined;
    if (!checkout) {
      throw new Error('Review checkout before submitting');
    }
    if (checkout.owner !== options.owner()) {
      throw new CheckoutAccountChangedError();
    }
    if (checkout.submission) {
      return checkout.submission;
    }
    if (payload.expectedPayableAmount !== checkout.context.calculateResult?.payableAmount) {
      throw Object.assign(new Error('Please review the updated checkout amount.'), {
        status: 400,
        title: 'Price changed',
      });
    }
    const data = options.promotionsEnabled
      ? { ...payload, ...acceptedSelection(checkout.context) }
      : payload;
    checkout.submission = Promise.resolve().then(async () => {
      try {
        const result = (await options.request({
          path: `${base}/submit`,
          method: 'POST',
          data,
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
          // A definite validation failure did not create an order.
          checkout.submission = undefined;
          throw error;
        }
        // Network failures and 5xx responses may arrive after the order was created.
        throw new CheckoutSubmissionUncertainError();
      }
    });
    return checkout.submission;
  }

  return {
    prepareCheckout,
    submitOrder,
    supportsPromotions: (id?: string) =>
      options.promotionsEnabled && !!id && prepared.get(id)?.owner === options.owner(),
  };
}
