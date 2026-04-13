<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { orderApi } from '@/api/modules/order';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { openLegalDocument } from '@/helpers/legal';
import { sendRequest, useQuery } from '@/hooks/useRequest';
import type {
  OrderResponse,
  PaymentMethodPublicResponse,
  PaymentInitiateResponse,
  WechatPayJsapiResponse,
} from '@halo-dev/api-client';

const orderCode = ref<string>('');
const { data: orderData, run: runOrder } = useQuery<OrderResponse, { orderCode: string }>(
  (params: { orderCode: string }) => orderApi.getOrder(params.orderCode),
  { immediate: false },
);
const payableAmount = computed(() => orderData.value?.totalAmount ?? 0);

onLoad(async (options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (options?.orderCode) {
    orderCode.value = options.orderCode;
  }
  if (orderCode.value) {
    try {
      await runOrder({ orderCode: orderCode.value });
    } catch {
      // Ignore and keep the amount at 0
    }
  }
  await loadPaymentMethods();
});

const paymentMethods = ref<PaymentMethodPublicResponse[]>([]);
const selectedMethodId = ref<number | null>(null);
const paying = ref(false);
const { run: runPaymentMethods } = useQuery<PaymentMethodPublicResponse[], { orderCode: string }>(
  (_params: { orderCode: string }) => orderApi.getPaymentMethods(),
  { immediate: false },
);

async function loadPaymentMethods() {
  if (!orderCode.value) {
    return;
  }
  try {
    const methods = await runPaymentMethods({ orderCode: orderCode.value });
    // WeChat Mini Program supports only WeChat Pay, so filter out other payment methods
    paymentMethods.value = (methods ?? []).filter((m) => m.provider === 'WECHAT_PAY' && m.enabled);
    selectedMethodId.value = paymentMethods.value[0]?.id ?? null;
  } catch {
    paymentMethods.value = [{ id: 1, name: '微信支付', provider: 'WECHAT_PAY', enabled: true }];
    selectedMethodId.value = 1;
  }
}

/**
 * Payment method metadata (icon / color / description)
 */
interface MethodMeta {
  bg: string;
  icon: string;
  desc: string;
  recommended?: boolean;
}

const METHOD_META: Record<string, MethodMeta> = {
  WECHAT_PAY: {
    bg: '#22c55e',
    icon: 'logo-wechatpay',
    desc: '使用微信钱包极速支付',
    recommended: true,
  },
};

const PROVIDER_ALIASES: Record<string, string> = {
  WECHAT: 'WECHAT_PAY',
  WECHATPAY: 'WECHAT_PAY',
};

function getMeta(provider: string | undefined): MethodMeta {
  const normalizedProvider = PROVIDER_ALIASES[provider ?? ''] ?? provider ?? '';
  return METHOD_META[normalizedProvider] ?? { bg: '#64748b', icon: 'wallet', desc: '在线支付' };
}

/**
 * Format amount
 */
const formattedAmount = computed(() =>
  payableAmount.value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
);

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollCount = 0;
const MAX_POLL = 15;
const POLL_INTERVAL = 2000;

function clearPollTimer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

onUnmounted(() => {
  clearPollTimer();
});

/**
 * Poll payment session status
 * PENDING -> continue polling; SUCCESS/SUCCEEDED -> go to the success page; any other terminal status -> failure page
 */
function startPolling(sessionCode: string) {
  pollCount = 0;
  poll();

  function poll() {
    if (pollCount >= MAX_POLL) {
      navigateToResult('fail');
      return;
    }

    pollTimer = setTimeout(async () => {
      pollCount++;
      try {
        const status = await sendRequest(orderApi.getPaymentSessionStatus(sessionCode));
        if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'AUTHORIZED') {
          navigateToResult('success');
        } else if (status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED') {
          navigateToResult('fail');
        } else {
          poll();
        }
      } catch {
        poll();
      }
    }, POLL_INTERVAL);
  }
}

function navigateToResult(status: 'success' | 'fail') {
  clearPollTimer();
  paying.value = false;
  uni.redirectTo({
    url: `/subpkg-trade/payment-result/index?status=${status}&orderCode=${orderCode.value}`,
  });
}

function extractWechatJsapiParams(
  response: PaymentInitiateResponse,
): WechatPayJsapiResponse | null {
  return response.payload?.payload?.wechatPay?.jsapi ?? null;
}

async function handlePay() {
  if (!selectedMethodId.value) {
    uni.showToast({ title: '请选择支付方式', icon: 'none' });
    return;
  }
  if (paying.value) {
    return;
  }

  paying.value = true;
  try {
    const response = await sendRequest(
      orderApi.initiatePayment(orderCode.value, {
        paymentMethodId: selectedMethodId.value,
        preferredResponseType: 'MINI_PROGRAM',
      }),
    );

    const sessionCode = response.sessionCode;
    const params = extractWechatJsapiParams(response);
    const paymentErrorMessage = response.payload?.errorMessage;

    if (
      !sessionCode ||
      !params?.package ||
      !params.timeStamp ||
      !params.nonceStr ||
      !params.paySign
    ) {
      paying.value = false;
      uni.showToast({
        title: paymentErrorMessage || '支付参数不完整，请稍后重试',
        icon: 'none',
      });
      return;
    }

    // In mock mode (package.prepay_id starts with mock_), skip real payment invocation and enter polling directly
    if (!params.package.includes('mock_')) {
      try {
        const provider = (await uni.getProvider({
          service: 'payment',
        })) as { provider: PlusPaymentPaymentChannel['id'][] };
        if (provider.provider.includes('wxpay')) {
          await new Promise((resolve, reject) => {
            uni.requestPayment({
              provider: 'wxpay',
              timeStamp: params.timeStamp,
              nonceStr: params.nonceStr,
              package: params.package,
              signType: params.signType ?? 'RSA',
              paySign: params.paySign,
              success: () => resolve(void 0),
              fail: (err) => reject(err),
            });
          });
        }
      } catch {
        // User canceled or payment failed
        navigateToResult('fail');
        return;
      }
    }

    // Poll the backend to confirm the payment result
    startPolling(sessionCode);
  } catch {
    paying.value = false;
    uni.showToast({ title: '发起支付失败，请重试', icon: 'none' });
  }
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-white">
    <view class="bg-white flex flex-col items-center px-4 py-10">
      <text class="text-slate-500 text-sm mb-2">待支付金额</text>

      <view class="flex items-end gap-1 mb-4">
        <text class="text-brand text-2xl font-bold leading-none">¥</text>
        <text class="text-brand text-4xl font-bold leading-none tracking-tighter">
          {{ formattedAmount }}
        </text>
      </view>

      <view v-if="orderCode" class="flex items-center bg-slate-50 rounded-1 px-3 py-1">
        <text class="text-slate-500 text-xs">订单编号: {{ orderCode }}</text>
      </view>
    </view>

    <view class="flex flex-col gap-4 px-4 pb-27.5">
      <text class="text-slate-950 text-sm font-medium">选择支付方式</text>

      <view v-if="paymentMethods.length === 0" class="flex items-center justify-center py-8">
        <text class="text-slate-400 text-sm">暂无可用支付方式</text>
      </view>

      <view v-else class="flex flex-col gap-3">
        <view
          v-for="method in paymentMethods"
          :key="method.id"
          class="flex items-center gap-4 bg-white border border-solid rounded-2 px-4 py-4"
          :class="selectedMethodId === method.id ? 'border-brand' : 'border-slate-100'"
          @tap="selectedMethodId = method.id ?? null"
        >
          <view
            class="flex items-center justify-center rounded-full shrink-0 w-6.5 h-6.5"
            :style="{ backgroundColor: getMeta(method.provider).bg }"
          >
            <TIcon
              :name="getMeta(method.provider).icon"
              v-bind="{ size: '28rpx', color: '#fff' }"
            />
          </view>

          <view class="flex-1 flex flex-col gap-0.5 min-w-0">
            <view class="flex items-center gap-2">
              <text class="text-slate-950 text-sm font-medium">{{ method.name }}</text>
              <view
                v-if="getMeta(method.provider).recommended"
                class="flex items-center bg-brand/10 rounded-0.5 px-1.5 py-0.5"
              >
                <text class="text-brand text-xs">推荐</text>
              </view>
            </view>
            <text class="text-slate-500 text-xs">{{ getMeta(method.provider).desc }}</text>
          </view>

          <view
            class="flex items-center justify-center shrink-0 rounded-full border-2 border-solid w-5 h-5"
            :style="
              selectedMethodId === method.id
                ? 'border-color: #ee2b2b; background-color: #ee2b2b'
                : 'border-color: #cbd5e1; background-color: transparent;'
            "
          >
            <view v-if="selectedMethodId === method.id" class="rounded-full bg-white w-2 h-2" />
          </view>
        </view>
      </view>

      <view
        class="flex items-center justify-center gap-3 rounded-2 border border-solid px-4 py-3.5 bg-brand/5"
        style="border-color: rgba(238, 43, 43, 0.1)"
      >
        <TIcon name="info-circle" v-bind="{ size: '30rpx', color: 'rgba(238,43,43,0.8)' }" />
        <view class="flex-1 flex flex-wrap items-center text-xs leading-relaxed">
          <text style="color: rgba(238, 43, 43, 0.8)">支付即代表您已阅读并同意</text>
          <text class="text-brand font-medium" @tap.stop="openLegalDocument('paymentAgreement')">
            《用户支付协议》
          </text>
          <text style="color: rgba(238, 43, 43, 0.8)">及</text>
          <text class="text-brand font-medium" @tap.stop="openLegalDocument('privacyPolicy')">
            《隐私政策》
          </text>
          <text style="color: rgba(238, 43, 43, 0.8)">。如有疑问，请咨询在线客服。</text>
        </view>
      </view>
    </view>

    <view
      class="fixed bottom-0 left-0 right-0 z-10 bg-white border-0 border-t border-solid border-slate-100 flex flex-col gap-3 px-4 pt-4.5 pb-safe"
    >
      <view
        class="flex items-center justify-center rounded-2 py-3.5 w-full bg-brand shadow-brand-btn"
        :class="paying || paymentMethods.length === 0 ? 'opacity-60' : ''"
        @tap="handlePay"
      >
        <text class="text-white text-base font-bold">
          {{ paying ? '支付处理中...' : `立即支付 ¥${formattedAmount}` }}
        </text>
      </view>
    </view>
  </view>
</template>
