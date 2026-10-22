import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { CheckoutContextResponse, PrepareCheckoutRequest } from '@halo-dev/api-client';
import { checkoutApi } from '@/api/modules/checkout';
import { normalizeCouponIds } from '@/helpers/coupon';
import { isHaloProblem } from '@/utils/error';

export interface PromotionSelection {
  discountCode?: string;
  customerCouponIds: number[];
}

export function useCheckoutPromotions(
  basePayload: Ref<PrepareCheckoutRequest | null>,
  onContext: (context: CheckoutContextResponse) => void,
  initial?: { context: CheckoutContextResponse; selection: PromotionSelection },
) {
  const context = ref<CheckoutContextResponse | null>(initial?.context ?? null);
  const syncing = ref(false);
  const verified = ref(!!initial);
  const failed = ref(false);
  const error = ref<unknown>(null);
  const selection = ref<PromotionSelection>(initial?.selection ?? { customerCouponIds: [] });
  const supported = computed(() => checkoutApi.supportsPromotions(context.value?.id));
  let generation = 0;
  let addressId = basePayload.value?.selectedAddressId;

  async function prepare(
    next: PromotionSelection,
    recoverValidationError = false,
  ): Promise<boolean> {
    if (!basePayload.value) {
      return false;
    }
    const token = ++generation;
    const canRecover = recoverValidationError && verified.value;
    syncing.value = true;
    verified.value = false;
    failed.value = false;
    error.value = null;
    try {
      const result = await checkoutApi.prepareCheckout(
        {
          ...basePayload.value,
          selectedAddressId: addressId,
        },
        {
          contextId: context.value?.id,
          selection: {
            discountCode: next.discountCode?.trim() || undefined,
            customerCouponIds: normalizeCouponIds(next.customerCouponIds),
          },
          handleValidationError: recoverValidationError,
        },
      );
      if (token !== generation) {
        return false;
      }
      if (
        !result?.calculateResult ||
        !Number.isFinite(result.calculateResult.payableAmount) ||
        (result.calculateResult.payableAmount ?? -1) < 0
      ) {
        throw new Error('Invalid checkout response');
      }
      const requestedCode = next.discountCode?.trim();
      if (
        checkoutApi.supportsPromotions(result.id) &&
        requestedCode &&
        result.calculateResult.discountCode?.toUpperCase() !== requestedCode.toUpperCase()
      ) {
        throw new Error('Discount code was not applied');
      }
      context.value = result;
      selection.value = checkoutApi.supportsPromotions(result.id)
        ? {
            discountCode: result.calculateResult.discountCode || undefined,
            customerCouponIds: normalizeCouponIds(
              (result.calculateResult.appliedCoupons ?? []).flatMap((coupon) =>
                coupon.customerCouponId ? [coupon.customerCouponId] : [],
              ),
            ),
          }
        : { customerCouponIds: [] };
      verified.value = true;
      onContext(result);
      return true;
    } catch (problem) {
      if (token === generation) {
        if (canRecover && isHaloProblem(problem) && problem.status === 400) {
          // Reprice the accepted selection before allowing checkout to continue.
          const recoveryToken = generation + 1;
          await prepare(selection.value);
          if (generation === recoveryToken) {
            error.value = problem;
          }
        } else {
          failed.value = true;
          error.value = problem;
        }
      }
      return false;
    } finally {
      if (token === generation) {
        syncing.value = false;
      }
    }
  }

  function refresh(selectedAddressId?: number) {
    addressId = selectedAddressId;
    return prepare(selection.value);
  }

  function apply(next: PromotionSelection) {
    if (!supported.value || syncing.value) {
      return Promise.resolve(false);
    }
    return prepare(next, next.discountCode?.trim() !== selection.value.discountCode);
  }

  return { context, syncing, verified, failed, error, selection, supported, refresh, apply };
}
