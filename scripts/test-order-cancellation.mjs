import assert from 'node:assert/strict';
import process from 'node:process';
import { createServer } from 'vite';
import { faker } from '@faker-js/faker/locale/zh_CN';

const runtime = { modal: null, toasts: [], requests: [], errors: [], send: async () => undefined };
globalThis.orderCancellationTest = runtime;
globalThis.uni = {
  showModal: (options) => {
    runtime.modal = options;
  },
  showToast: (options) => {
    runtime.toasts.push(options);
  },
};

const stubs = {
  request: `export const alovaInst = { Post: (url, body, options) => {
    const test = globalThis.orderCancellationTest;
    test.requests.push({ url, body, meta: options?.meta });
    return { meta: { ...options?.meta, skipAuthInit: true }, send: () => test.send(url, body) };
  } };`,
  auth: 'export const useAuth = () => ({ init: async () => {} });',
  locales: 'export const translate = (key) => key;',
  i18n: 'export const useI18n = () => ({ t: (key) => key });',
  alova: 'export const createAlova = (options) => options;',
  adapter: 'export default () => ({}); export const uniappMockResponse = () => {};',
  config: `export const useAppConfig = () => ({ halo: { baseURL: 'http://127.0.0.1:8090' } });`,
  store: 'export const useUserStore = () => ({});',
  session:
    'export const ensureSessionInitialized = async () => {}; export const refreshSession = async () => {};',
  error:
    'export const showErrorToast = (message) => globalThis.orderCancellationTest.errors.push(message);',
  mocks: 'export default [];',
};
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: [
      { find: '@/utils/request', replacement: 'virtual:cancellation-request' },
      { find: '@/hooks/useAuth', replacement: 'virtual:cancellation-auth' },
      { find: '@/locales', replacement: 'virtual:cancellation-locales' },
      { find: 'vue-i18n', replacement: 'virtual:cancellation-i18n' },
      { find: /^alova$/, replacement: 'virtual:cancellation-alova' },
      { find: '@alova/adapter-uniapp', replacement: 'virtual:cancellation-adapter' },
      { find: '@/config', replacement: 'virtual:cancellation-config' },
      { find: '@/store', replacement: 'virtual:cancellation-store' },
      { find: '@/services/session', replacement: 'virtual:cancellation-session' },
      { find: '@/utils/error', replacement: 'virtual:cancellation-error' },
      { find: '@/mock/index', replacement: 'virtual:cancellation-mocks' },
      { find: '@', replacement: `${process.cwd()}/src` },
    ],
  },
  plugins: [
    {
      name: 'order-cancellation-test-stubs',
      resolveId(id) {
        if (id.startsWith('virtual:cancellation-')) {
          return id;
        }
      },
      load(id) {
        return stubs[id.replace('virtual:cancellation-', '')];
      },
    },
  ],
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

try {
  const { canCancelOrder } = await vite.ssrLoadModule('/src/helpers/order.ts');
  const { useOrderCancellation } = await vite.ssrLoadModule(
    '/src/composables/useOrderCancellation.ts',
  );
  // Exercise the real response policy: only cancellation opts into rejecting missing endpoints.
  const { alovaInst: requestPolicy } = await vite.ssrLoadModule('/src/utils/request.ts');
  const respond = requestPolicy.responded.onSuccess;
  const missing = { statusCode: 404, data: { title: 'Not Found' } };
  assert.equal(await respond({ statusCode: 202 }, { meta: { rejectNotFound: true } }), undefined);
  assert.equal(await respond(missing, {}), undefined);
  await assert.rejects(
    respond(missing, { meta: { rejectNotFound: true } }),
    (error) => error === missing.data,
  );
  assert.equal(runtime.errors.at(-1), 'common.requestError');
  const unpaid = () => ({ orderCode: 'TEST/ORDER', status: 'OPEN', paymentStatus: 'PENDING' });
  for (const status of ['OPEN', 'ARCHIVED', 'CANCELLED']) {
    for (const paymentStatus of [
      'PENDING',
      'AUTHORIZING',
      'PAID',
      'REFUNDED',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
    ]) {
      assert.equal(
        canCancelOrder({ status, paymentStatus }),
        status === 'OPEN' && ['PENDING', 'AUTHORIZING'].includes(paymentStatus),
      );
    }
  }

  function harness(refresh = async () => {}) {
    runtime.modal = null;
    runtime.requests = [];
    runtime.toasts = [];
    runtime.send = async () => undefined; // Halo Pro returns 202 with an empty body.
    const accepted = [];
    let refreshCount = 0;
    const workflow = useOrderCancellation({
      onCancelled: (code) => {
        accepted.push(code);
      },
      refresh: async () => {
        refreshCount++;
        await refresh();
      },
    });
    return { ...workflow, accepted, refreshCount: () => refreshCount };
  }

  let flow = harness();
  await flow.cancel({ ...unpaid(), paymentStatus: 'PAID' });
  await flow.cancel({ ...unpaid(), orderCode: undefined });
  assert.equal(runtime.modal, null);
  assert.equal(runtime.requests.length, 0);

  for (const dismiss of [
    () => runtime.modal.success({ confirm: false }),
    () => runtime.modal.fail(),
  ]) {
    flow = harness();
    const result = flow.cancel(unpaid());
    assert.equal(flow.busy.value, true);
    const originalModal = runtime.modal;
    await flow.cancel(unpaid());
    assert.equal(
      runtime.modal,
      originalModal,
      'Repeated taps must not create a second confirmation',
    );
    dismiss();
    await result;
    assert.equal(runtime.requests.length, 0);
    assert.equal(flow.busy.value, false);
  }

  const sending = deferred();
  const requestStarted = deferred();
  const refreshing = deferred();
  const refreshStarted = deferred();
  flow = harness(async () => {
    refreshStarted.resolve();
    await refreshing.promise;
  });
  runtime.send = () => {
    requestStarted.resolve();
    return sending.promise;
  };
  let result = flow.cancel(unpaid());
  runtime.modal.success({ confirm: true });
  await requestStarted.promise;
  assert.equal(flow.submitting.value, true);
  await flow.cancel(unpaid());
  assert.deepEqual(runtime.requests, [
    {
      url: '/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/TEST%2FORDER/cancel',
      body: {},
      meta: { rejectNotFound: true },
    },
  ]);
  sending.resolve();
  await refreshStarted.promise;
  await flow.cancel(unpaid());
  assert.equal(runtime.requests.length, 1, 'Lock must remain active while reconciling the order');
  assert.deepEqual(flow.accepted, ['TEST/ORDER']);
  assert.equal(runtime.toasts[0].title, 'order.cancelSuccess');
  refreshing.resolve();
  await result;
  assert.equal(flow.busy.value, false);
  assert.equal(flow.submitting.value, false);

  for (const failure of [new Error('Order already paid'), new Error('Connection lost')]) {
    flow = harness();
    runtime.send = async () => {
      throw failure;
    };
    result = flow.cancel(unpaid());
    runtime.modal.success({ confirm: true });
    await result;
    assert.equal(
      flow.refreshCount(),
      1,
      'Rejections and uncertain network results must reload state',
    );
    assert.deepEqual(flow.accepted, []);
    assert.deepEqual(runtime.toasts, []);
    assert.equal(flow.busy.value, false);
  }

  flow = harness();
  const changedOrder = unpaid();
  result = flow.cancel(changedOrder);
  changedOrder.paymentStatus = 'PAID';
  runtime.modal.success({ confirm: true });
  await result;
  assert.equal(runtime.requests.length, 0);
  assert.equal(flow.refreshCount(), 1);

  flow = harness(async () => {
    throw new Error('Refresh unavailable');
  });
  result = flow.cancel({ ...unpaid(), paymentStatus: 'AUTHORIZING' });
  runtime.modal.success({ confirm: true });
  await result;
  assert.deepEqual(flow.accepted, ['TEST/ORDER']);
  assert.equal(runtime.toasts.length, 1);
  assert.equal(flow.busy.value, false);

  const [{ default: checkout }, { default: mock }] = await Promise.all([
    vite.ssrLoadModule('/src/mock/modules/checkout.mock.ts'),
    vite.ssrLoadModule('/src/mock/modules/order.mock.ts'),
  ]);
  const routes = {
    detail: '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}',
    cancel: '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/cancel',
    pay: '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/initiate-payment',
    status: '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/payment-sessions/{sessionCode}/status',
    list: '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders',
    fulfillments: '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/fulfillments',
  };
  const call = (route, orderCode) => mock.data[routes[route]]({ params: { orderCode } });
  const createOrder = () =>
    checkout.data['[POST]/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/submit']({
      data: { source: 'BUY_NOW', items: [{ productVariantId: 11, quantity: 1 }] },
    }).order.orderCode;

  const code = createOrder();
  const session = call('pay', code);
  assert.equal(
    mock.data[routes.status]({ params: { sessionCode: session.sessionCode } }),
    'PENDING',
  );
  call('cancel', code);
  const cancelled = call('detail', code);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.paymentStatus, 'CANCELLED');
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(
      mock.data[routes.status]({ params: { sessionCode: session.sessionCode } }),
      'CANCELLED',
    );
  }
  assert.equal(cancelled.paidAt, undefined);
  assert.deepEqual(call('fulfillments', code), []);
  assert.throws(() => call('pay', code), /不可支付/);
  assert.throws(() => call('cancel', code), /未支付/);
  const pending = mock.data[routes.list]({
    query: { page: 0, size: 100, statuses: ['OPEN'], paymentStatuses: ['PENDING', 'AUTHORIZING'] },
  });
  assert.equal(
    pending.content.some((order) => order.orderCode === code),
    false,
  );
  const all = mock.data[routes.list]({ query: { page: 0, size: 100 } });
  assert.equal(all.content.find((order) => order.orderCode === code).status, 'CANCELLED');

  for (const fixture of ['MOCK-PENDING-PAYMENT', 'MOCK-AUTHORIZING-PAYMENT']) {
    call('cancel', fixture);
    assert.equal(call('detail', fixture).status, 'CANCELLED');
  }
  assert.throws(() => call('cancel', 'MOCK-PAID'), /未支付/);
  assert.throws(() => call('cancel', 'UNKNOWN-ORDER'), /不存在/);
  const paidCode = createOrder();
  const originalArrayElement = faker.helpers.arrayElement;
  let paidSession;
  try {
    faker.helpers.arrayElement = (items) =>
      items.length === 2 && items[0] === 'SUCCESS' && items[1] === 'FAILED'
        ? 'SUCCESS'
        : originalArrayElement.call(faker.helpers, items);
    paidSession = call('pay', paidCode);
  } finally {
    faker.helpers.arrayElement = originalArrayElement;
  }
  mock.data[routes.status]({ params: { sessionCode: paidSession.sessionCode } });
  mock.data[routes.status]({ params: { sessionCode: paidSession.sessionCode } });
  assert.equal(call('detail', paidCode).paymentStatus, 'PAID');
  assert.throws(() => call('cancel', paidCode), /未支付/);
  const cancelledList = mock.data[routes.list]({
    query: { page: 0, size: 100, statuses: ['CANCELLED'] },
  });
  assert.ok(cancelledList.content.some((order) => order.orderCode === code));
  assert.ok(cancelledList.content.every((order) => order.status === 'CANCELLED'));
  assert.equal(
    cancelledList.content.some((order) => order.orderCode === paidCode),
    false,
  );

  console.log(
    'Order cancellation confirmation, concurrency, payment races and Mock lifecycle passed.',
  );
} finally {
  await vite.close();
  delete globalThis.orderCancellationTest;
  delete globalThis.uni;
}
