import { computed, readonly, shallowRef } from 'vue';
import type { OrderResponse } from '@halo-dev/api-client';
import { useI18n } from 'vue-i18n';
import { orderApi } from '@/api/modules/order';
import { canCancelOrder } from '@/helpers/order';
import { sendRequest } from '@/hooks/useRequest';

interface OrderCancellationOptions {
  onCancelled: (orderCode: string) => void;
  refresh: () => Promise<unknown>;
}

export function useOrderCancellation(options: OrderCancellationOptions) {
  const { t } = useI18n();
  const pendingOrderCode = shallowRef<string | null>(null);
  const submitting = shallowRef(false);
  const busy = computed(() => pendingOrderCode.value !== null);

  function confirmCancellation() {
    return new Promise<boolean>((resolve) => {
      uni.showModal({
        title: t('order.cancelTitle'),
        content: t('order.cancelContent'),
        confirmText: t('order.cancelConfirm'),
        cancelText: t('order.keepOrder'),
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
  }

  async function reconcile() {
    try {
      await options.refresh();
    } catch {
      // Request errors are reported by the shared request layer. Keep the confirmed
      // cancellation visible even if refreshing the list fails.
    }
  }

  async function cancel(order: OrderResponse) {
    const code = order.orderCode;
    if (busy.value || !code || !canCancelOrder(order)) {
      return;
    }

    pendingOrderCode.value = code;
    try {
      if (!(await confirmCancellation())) {
        return;
      }
      if (!canCancelOrder(order)) {
        await reconcile();
        return;
      }

      submitting.value = true;
      try {
        await sendRequest(orderApi.cancelOrder(code));
      } catch {
        // The server checks ownership and payment state again. Refresh after a
        // rejection or an uncertain network result so stale payment actions disappear.
        await reconcile();
        return;
      }

      options.onCancelled(code);
      uni.showToast({ title: t('order.cancelSuccess'), icon: 'success' });
      await reconcile();
    } finally {
      submitting.value = false;
      pendingOrderCode.value = null;
    }
  }

  return {
    pendingOrderCode: readonly(pendingOrderCode),
    submitting: readonly(submitting),
    busy,
    cancel,
  };
}
