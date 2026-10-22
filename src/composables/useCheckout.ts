import { computed, shallowReadonly, shallowRef, watch } from 'vue';
import type {
  CheckoutContextResponse,
  MpCheckoutSubmitRequest,
  PrepareCheckoutRequest,
  UserAddressResponse,
} from '@halo-dev/api-client';
import { checkoutApi } from '@/api/modules/checkout';
import { addressApi } from '@/api/modules/address';
import { sendRequest } from '@/hooks/useRequest';
import { useUserStore } from '@/store';
import {
  CheckoutAccountChangedError,
  CheckoutSubmissionUncertainError,
  getCheckoutBusinessDetail,
} from '@/helpers/checkout';

export class CheckoutNotReadyError extends Error {
  constructor(public reason: 'syncing' | 'selectAddress' | 'emptyItems') {
    super(reason);
  }
}

/** Own the quote, address and submission lifecycle for a single confirmation page. */
export function useCheckout() {
  const userStore = useUserStore();
  const owner = userStore.profile?.metadata?.name ?? '';
  const context = shallowRef<CheckoutContextResponse | null>(null);
  const selectedAddress = shallowRef<UserAddressResponse | null>(null);
  const syncing = shallowRef(false);
  const verified = shallowRef(false);
  const failed = shallowRef(false);
  const failureDetail = shallowRef<string | null>(null);
  const submitting = shallowRef(false);
  const uncertain = shallowRef(false);
  const completedOrder = shallowRef<{ orderCode: string; paymentStatus?: string } | null>(null);
  const accountChanged = shallowRef(false);
  const locked = computed(
    () => submitting.value || uncertain.value || !!completedOrder.value || accountChanged.value,
  );
  const isShippingRequired = computed(() => context.value?.isShippingRequired !== false);
  const hasAddress = computed(
    () => !isShippingRequired.value || !!(selectedAddress.value || context.value?.userAddress),
  );
  let basePayload: PrepareCheckoutRequest | null = null;
  let addresses: UserAddressResponse[] = [];
  let generation = 0;

  const isOwnerCurrent = () =>
    !accountChanged.value && owner === (userStore.profile?.metadata?.name ?? '');
  watch(
    () => userStore.profile?.metadata?.name,
    () => {
      accountChanged.value = true;
      generation++;
      context.value = null;
      selectedAddress.value = null;
      addresses = [];
      verified.value = false;
      failed.value = false;
      failureDetail.value = null;
      syncing.value = false;
      completedOrder.value = null;
      uncertain.value = false;
    },
    { flush: 'sync' },
  );

  async function reprice(selectedAddressId?: number, reloadAddresses = false) {
    if (!basePayload || locked.value || !isOwnerCurrent()) {
      return false;
    }
    const token = ++generation;
    syncing.value = true;
    verified.value = false;
    failed.value = false;
    failureDetail.value = null;
    try {
      if (reloadAddresses) {
        // Address-list availability does not decide whether the native checkout can proceed.
        const latest = await sendRequest(addressApi.getAddresses()).catch(() => null);
        if (token !== generation || !isOwnerCurrent()) {
          return false;
        }
        if (latest) {
          addresses = latest;
          selectedAddress.value =
            addresses.find((address) => address.id === selectedAddressId) ??
            addresses.find((address) => address.isDefault) ??
            addresses[0] ??
            null;
          selectedAddressId = selectedAddress.value?.id;
        }
      }
      const result = await checkoutApi.prepareCheckout({ ...basePayload, selectedAddressId });
      if (token !== generation || !isOwnerCurrent()) {
        return false;
      }
      context.value = result;
      selectedAddress.value =
        addresses.find((address) => address.id === result.selectedAddressId) ?? null;
      verified.value = true;
      return true;
    } catch (error) {
      if (token === generation && isOwnerCurrent()) {
        failed.value = true;
        failureDetail.value = getCheckoutBusinessDetail(error);
      }
      return false;
    } finally {
      if (token === generation) {
        syncing.value = false;
      }
    }
  }

  function initialize(payload: PrepareCheckoutRequest) {
    basePayload = payload;
    return reprice(payload.selectedAddressId, true);
  }

  function refresh() {
    return reprice(selectedAddress.value?.id ?? context.value?.selectedAddressId);
  }

  function syncAddress() {
    return reprice(selectedAddress.value?.id ?? context.value?.selectedAddressId, true);
  }

  function selectAddress(address: UserAddressResponse) {
    if (locked.value || !isOwnerCurrent()) {
      return Promise.resolve(false);
    }
    // Keep newly created addresses available even before the list has been refreshed.
    addresses = [...addresses.filter((item) => item.id !== address.id), address];
    selectedAddress.value = address;
    return reprice(address.id);
  }

  function buildSubmitItems(source: MpCheckoutSubmitRequest['source']) {
    const items = context.value?.items ?? [];
    if (source === 'CART') {
      return (basePayload?.items ?? []).flatMap((item) =>
        typeof item.cartItemId === 'number'
          ? [
              {
                cartItemId: item.cartItemId,
                quantity: item.quantity,
                selectedShippingRateId: item.selectedShippingRateId,
              },
            ]
          : [],
      );
    }
    return items.flatMap((item) =>
      typeof item.productVariant?.id === 'number'
        ? [
            {
              productVariantId: item.productVariant.id,
              quantity: item.quantity ?? 1,
              selectedShippingRateId: item.selectedShippingRateId,
            },
          ]
        : [],
    );
  }

  async function submit(remark: string) {
    if (!isOwnerCurrent()) {
      throw new CheckoutAccountChangedError();
    }
    if (locked.value) {
      return null;
    }
    if (syncing.value || !verified.value || !context.value) {
      throw new CheckoutNotReadyError('syncing');
    }
    if (!hasAddress.value) {
      throw new CheckoutNotReadyError('selectAddress');
    }
    const source = context.value.source === 'BUY_NOW' ? 'BUY_NOW' : 'CART';
    const items = buildSubmitItems(source);
    if (!items.length) {
      throw new CheckoutNotReadyError('emptyItems');
    }
    const payload: MpCheckoutSubmitRequest = {
      source,
      items,
      expectedPayableAmount: context.value.calculateResult!.payableAmount,
      customerNotes: remark || undefined,
    };
    if (isShippingRequired.value) {
      payload.selectedAddressId = selectedAddress.value?.id ?? context.value.selectedAddressId;
      if (!payload.selectedAddressId && context.value.userAddress) {
        payload.userAddress = context.value.userAddress;
      }
    }
    submitting.value = true;
    try {
      const result = await checkoutApi.submitOrder(payload, context.value.id!);
      if (!isOwnerCurrent()) {
        return null;
      }
      completedOrder.value = {
        orderCode: result.order!.orderCode!,
        paymentStatus: result.order?.paymentStatus,
      };
      return completedOrder.value;
    } catch (error) {
      if (!isOwnerCurrent()) {
        return null;
      }
      if (error instanceof CheckoutSubmissionUncertainError) {
        uncertain.value = true;
        return null;
      }
      // The server rejected creation. Refresh the quote before enabling another attempt.
      submitting.value = false;
      await refresh();
      throw error;
    } finally {
      submitting.value = false;
    }
  }

  return {
    context: shallowReadonly(context),
    selectedAddress: shallowReadonly(selectedAddress),
    syncing: shallowReadonly(syncing),
    verified: shallowReadonly(verified),
    failed: shallowReadonly(failed),
    failureDetail: shallowReadonly(failureDetail),
    submitting: shallowReadonly(submitting),
    uncertain: shallowReadonly(uncertain),
    completedOrder: shallowReadonly(completedOrder),
    accountChanged: shallowReadonly(accountChanged),
    locked,
    isShippingRequired,
    hasAddress,
    initialize,
    refresh,
    syncAddress,
    selectAddress,
    submit,
  };
}
