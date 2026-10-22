import { ref, shallowRef, watch } from 'vue';
import type { FulfillmentUcResponse, OrderResponse } from '@halo-dev/api-client';

export interface OrderDetailData {
  orderData: OrderResponse;
  fulfillData: FulfillmentUcResponse[];
}

interface OrderDetailPageOptions {
  getAccountKey: () => string | null;
  guardAccess: () => boolean;
  request: (orderCode: string) => Promise<OrderDetailData>;
  canConfirm: (order: OrderResponse) => boolean;
  confirm: () => Promise<boolean>;
  markAsReceived: (orderCode: string) => Promise<unknown>;
  onConfirmed: () => void;
  onConfirmFailed: () => void;
}

export function useOrderDetailPage(options: OrderDetailPageOptions) {
  const orderCode = ref('');
  const data = shallowRef<OrderDetailData | null>(null);
  const error = shallowRef<unknown>(null);
  const loading = ref(false);
  const confirming = ref(false);
  let visible = false;
  let disposed = false;
  let revision = 0;
  let submitting = false;
  let refreshPending = false;
  let inFlight: Promise<void> | null = null;
  let activeRevision: number | null = null;

  function invalidate() {
    revision += 1;
    data.value = null;
    error.value = null;
  }

  function getScope() {
    const account = options.getAccountKey();
    return account && orderCode.value ? { account, orderCode: orderCode.value, revision } : null;
  }

  function isCurrent(scope: NonNullable<ReturnType<typeof getScope>>) {
    return (
      !disposed &&
      visible &&
      scope.revision === revision &&
      scope.account === options.getAccountKey() &&
      scope.orderCode === orderCode.value
    );
  }

  function hasAccess() {
    if (options.guardAccess()) {
      return true;
    }
    invalidate();
    refreshPending = false;
    return false;
  }

  function load(): Promise<void> {
    if (disposed || !visible || !hasAccess() || !getScope()) {
      return Promise.resolve();
    }
    if (submitting) {
      refreshPending = true;
      return Promise.resolve();
    }
    if (inFlight) {
      // A return or account change must read again after the obsolete request settles.
      refreshPending ||= activeRevision !== revision;
      return inFlight;
    }

    refreshPending = true;
    loading.value = true;
    const task = async () => {
      while (refreshPending) {
        refreshPending = false;
        if (!visible || disposed || submitting || !hasAccess()) {
          break;
        }
        const scope = getScope();
        if (!scope) {
          break;
        }
        activeRevision = scope.revision;
        data.value = null;
        error.value = null;
        try {
          const response = await options.request(scope.orderCode);
          if (isCurrent(scope)) {
            data.value = response;
          }
        } catch (err) {
          if (isCurrent(scope)) {
            error.value = err;
          }
        }
      }
    };
    inFlight = task().finally(() => {
      inFlight = null;
      activeRevision = null;
      loading.value = false;
      if (refreshPending && visible && !disposed && !submitting) {
        return load();
      }
    });
    return inFlight;
  }

  function setOrderCode(value: string) {
    const nextCode = value.trim();
    if (nextCode !== orderCode.value) {
      orderCode.value = nextCode;
      invalidate();
    }
  }

  function show() {
    visible = true;
    return load();
  }

  function hide() {
    visible = false;
    refreshPending = false;
    invalidate();
  }

  const stopAccountWatch = watch(
    options.getAccountKey,
    () => {
      invalidate();
      if (visible) {
        void load();
      }
    },
    { flush: 'sync' },
  );

  async function confirmReceive() {
    if (disposed || !visible || confirming.value || !hasAccess() || loading.value) {
      return;
    }
    const scope = getScope();
    if (!scope || !data.value || !options.canConfirm(data.value.orderData)) {
      return;
    }

    confirming.value = true;
    try {
      const accepted = await options.confirm();
      if (
        !accepted ||
        !isCurrent(scope) ||
        !hasAccess() ||
        loading.value ||
        !data.value ||
        !options.canConfirm(data.value.orderData)
      ) {
        return;
      }
      submitting = true;
      refreshPending = true;
      await options.markAsReceived(scope.orderCode);
      if (isCurrent(scope)) {
        options.onConfirmed();
      }
    } catch {
      if (isCurrent(scope)) {
        options.onConfirmFailed();
      }
    } finally {
      submitting = false;
      confirming.value = false;
      if (refreshPending && visible && !disposed) {
        await load();
      }
    }
  }

  function dispose() {
    disposed = true;
    hide();
    stopAccountWatch();
  }

  return {
    orderCode,
    data,
    error,
    loading,
    confirming,
    setOrderCode,
    show,
    hide,
    load,
    confirmReceive,
    dispose,
  };
}
