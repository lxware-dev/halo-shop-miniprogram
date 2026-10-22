import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { OrderResponse, PaymentMethodPublicResponse } from '@halo-dev/api-client';
import { orderApi } from '@/api/modules/order';
import { sendRequest } from '@/hooks/useRequest';
import { canPayNow } from '@/helpers/order';
import { miniProgramPaymentMethods, pollPaymentSession } from '@/helpers/payment';

export function useOrderPayment() {
  const { t } = useI18n();
  const orderCode = shallowRef('');
  const order = ref<OrderResponse | null>(null);
  const paymentMethods = ref<PaymentMethodPublicResponse[]>([]);
  const selectedMethodId = shallowRef<number | null>(null);
  const loading = shallowRef(false);
  const loadError = shallowRef<'order' | 'methods' | null>(null);
  const paying = shallowRef(false);
  const redirecting = shallowRef(false);
  const awaitingResult = shallowRef(false);
  const resultNavigationFailed = shallowRef(false);
  let pendingSessionCode: string | undefined;
  const isPayable = computed(() => !!order.value && canPayNow(order.value));
  const canPay = computed(
    () =>
      isPayable.value &&
      !loading.value &&
      !loadError.value &&
      !paying.value &&
      !redirecting.value &&
      !awaitingResult.value &&
      selectedMethodId.value !== null,
  );
  let active = true;
  let loadVersion = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let finishWait: (() => void) | null = null;

  function dispose() {
    active = false;
    loadVersion++;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    finishWait?.();
    finishWait = null;
  }
  onScopeDispose(dispose);

  function goToResult(sessionCode?: string) {
    if (!active) {
      return;
    }
    redirecting.value = true;
    awaitingResult.value = true;
    pendingSessionCode = sessionCode;
    resultNavigationFailed.value = false;
    const onNavigationFailed = () => {
      if (active) {
        redirecting.value = false;
        resultNavigationFailed.value = true;
      }
    };
    try {
      uni.redirectTo({
        url: `/subpkg-trade/payment-result/index?orderCode=${encodeURIComponent(orderCode.value)}${
          sessionCode ? `&sessionCode=${encodeURIComponent(sessionCode)}` : ''
        }`,
        fail: onNavigationFailed,
      });
    } catch {
      onNavigationFailed();
    }
  }

  function viewPaymentResult() {
    if (awaitingResult.value && !redirecting.value) {
      goToResult(pendingSessionCode);
    }
  }

  async function load(code = orderCode.value) {
    if (!code || paying.value || awaitingResult.value) {
      return;
    }
    orderCode.value = code;
    const version = ++loadVersion;
    loading.value = true;
    loadError.value = null;
    order.value = null;
    paymentMethods.value = [];
    selectedMethodId.value = null;
    let step: 'order' | 'methods' = 'order';
    try {
      const currentOrder = await sendRequest(orderApi.getOrder(code));
      if (!active || version !== loadVersion) {
        return;
      }
      order.value = currentOrder;
      if (currentOrder.paymentStatus === 'PAID') {
        goToResult();
        return;
      }
      if (!canPayNow(currentOrder)) {
        return;
      }
      step = 'methods';
      const methods = await sendRequest(orderApi.getPaymentMethods(code));
      if (!active || version !== loadVersion) {
        return;
      }
      paymentMethods.value = miniProgramPaymentMethods(methods ?? []);
      selectedMethodId.value = paymentMethods.value[0]?.id ?? null;
    } catch {
      if (active && version === loadVersion) {
        loadError.value = step;
      }
    } finally {
      if (active && version === loadVersion) {
        loading.value = false;
      }
    }
  }

  function selectMethod(id: number | undefined) {
    if (
      !paying.value &&
      !awaitingResult.value &&
      paymentMethods.value.some((method) => method.id === id)
    ) {
      selectedMethodId.value = id ?? null;
    }
  }

  async function confirmSession(sessionCode: string) {
    const result = await pollPaymentSession({
      readStatus: () => sendRequest(orderApi.getPaymentSessionStatus(sessionCode)),
      isActive: () => active,
      wait: () =>
        new Promise<void>((resolve) => {
          finishWait = resolve;
          pollTimer = setTimeout(() => {
            pollTimer = null;
            finishWait = null;
            resolve();
          }, 2000);
        }),
    });
    if (result !== null) {
      goToResult(sessionCode);
    }
  }

  async function pay() {
    if (!canPay.value) {
      return;
    }
    paying.value = true;
    try {
      // Recheck immediately before initiation: the order may have been paid elsewhere.
      const currentOrder = await sendRequest(orderApi.getOrder(orderCode.value));
      if (!active) {
        return;
      }
      order.value = currentOrder;
      if (currentOrder.paymentStatus === 'PAID') {
        goToResult();
        return;
      }
      if (!canPayNow(currentOrder)) {
        return;
      }
      const response = await sendRequest(
        orderApi.initiatePayment(orderCode.value, {
          paymentMethodId: selectedMethodId.value ?? undefined,
          preferredResponseType: 'MINI_PROGRAM',
        }),
      );
      if (!active) {
        return;
      }
      const sessionCode = response.sessionCode;
      const params = response.payload?.payload?.wechatPay?.jsapi;
      if (!sessionCode) {
        // Zero amount orders can complete without creating a payment session.
        goToResult();
        return;
      }
      if (!params?.package || !params.timeStamp || !params.nonceStr || !params.paySign) {
        uni.showToast({
          title: response.payload?.errorMessage || t('payment.invalidParams'),
          icon: 'none',
        });
        goToResult(sessionCode);
        return;
      }
      if (!params.package.includes('mock_')) {
        try {
          await new Promise<void>((resolve, reject) => {
            uni.requestPayment({
              provider: 'wxpay',
              timeStamp: params.timeStamp,
              nonceStr: params.nonceStr,
              package: params.package,
              signType: params.signType ?? 'RSA',
              paySign: params.paySign,
              success: () => resolve(),
              fail: reject,
            });
          });
        } catch {
          // Client callbacks cannot determine the backend payment outcome.
          goToResult(sessionCode);
          return;
        }
      }
      if (active) {
        await confirmSession(sessionCode);
      }
    } catch {
      if (active) {
        uni.showToast({ title: t('payment.initiateFailed'), icon: 'none' });
      }
    } finally {
      if (active) {
        paying.value = false;
      }
    }
  }

  return {
    orderCode,
    order,
    paymentMethods,
    selectedMethodId,
    loading,
    loadError,
    paying,
    redirecting,
    awaitingResult,
    resultNavigationFailed,
    isPayable,
    canPay,
    load,
    selectMethod,
    pay,
    viewPaymentResult,
    dispose,
  };
}
