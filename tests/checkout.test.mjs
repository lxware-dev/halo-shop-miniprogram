import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// eslint-disable-next-line test/no-import-node-test -- Use the existing Node TypeScript transpilation test style.
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

const require = createRequire(import.meta.url);
const SCRIPT_SETUP_PATTERN = /<script setup lang="ts">([\s\S]*?)<\/script>/;
function loadTs(path, dependencies = {}, globals = {}, extra = '') {
  const module = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll(
    'import.meta.env',
    '({})',
  );
  runInNewContext(
    ts.transpileModule(`${source}\n${extra}`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => dependencies[name] ?? require(name),
      Promise,
      Error,
      Number,
      ...globals,
    },
  );
  return module.exports;
}
const helper = loadTs('../src/helpers/checkout.ts');
const payload = { source: 'BUY_NOW', items: [{ productVariantId: 7, quantity: 2 }] };
const submitPayload = (context) => ({
  ...payload,
  expectedPayableAmount: context.calculateResult.payableAmount,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const quote = (id = 'quote', amount = 10, addressId = 1) => ({
  id,
  source: 'BUY_NOW',
  selectedAddressId: addressId,
  isShippingRequired: true,
  items: [{ productVariant: { id: 7 }, quantity: 2, selectedShippingRateId: 11 }],
  calculateResult: { payableAmount: amount },
});

function clientHarness(submit = async () => ({ order: { orderCode: 'order-1' } })) {
  let owner = 'alice';
  const calls = [];
  const client = helper.createCheckoutClient({
    owner: () => owner,
    request: async (input) => {
      calls.push(input);
      return input.path.endsWith('/prepare') ? quote() : submit(input);
    },
  });
  return {
    client,
    calls,
    setOwner: (value) => {
      owner = value;
    },
  };
}

test('normal checkout preserves native MP request fields and only uses prepare/submit endpoints', async () => {
  const h = clientHarness();
  const context = await h.client.prepareCheckout(payload);
  const result = await h.client.submitOrder(submitPayload(context), context.id);
  assert.equal(result.order.orderCode, 'order-1');
  assert.deepEqual(
    h.calls.map((call) => call.path),
    [
      '/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/prepare',
      '/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/submit',
    ],
  );
  assert.deepEqual(h.calls[0].data, payload);
  assert.deepEqual(h.calls[1].data, submitPayload(context));
});

test('concurrent and completed submissions share exactly one promise and one POST', async () => {
  const pending = deferred();
  const h = clientHarness(() => pending.promise);
  const context = await h.client.prepareCheckout(payload);
  const first = h.client.submitOrder(submitPayload(context), context.id);
  const second = h.client.submitOrder(submitPayload(context), context.id);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(h.calls.length, 2);
  pending.resolve({ order: { orderCode: 'once' } });
  assert.equal((await first).order.orderCode, 'once');
  assert.equal(h.client.submitOrder(submitPayload(context), context.id), first);
  assert.equal(h.calls.length, 2);
});

for (const outcome of ['timeout', 'server-error', 'missing-order-code']) {
  test(`${outcome} keeps the submission uncertain and never repeats creation`, async () => {
    const h = clientHarness(async () => {
      if (outcome === 'timeout') {
        throw new Error('Timeout');
      }
      if (outcome === 'server-error') {
        throw Object.assign(new Error('Server unavailable'), { status: 503 });
      }
      return { order: {} };
    });
    const context = await h.client.prepareCheckout(payload);
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(
        h.client.submitOrder(submitPayload(context), context.id),
        helper.CheckoutSubmissionUncertainError,
      );
    }
    assert.equal(h.calls.length, 2);
  });
}

test('an explicit 400 allows another attempt, while a changed amount never submits', async () => {
  let attempts = 0;
  const h = clientHarness(async () => {
    if (++attempts === 1) {
      throw Object.assign(new Error('Validation failed'), { status: 400 });
    }
    return { order: { orderCode: 'retry' } };
  });
  const context = await h.client.prepareCheckout(payload);
  await assert.rejects(
    h.client.submitOrder({ ...submitPayload(context), expectedPayableAmount: 9 }, context.id),
  );
  assert.equal(attempts, 0);
  await assert.rejects(
    h.client.submitOrder(submitPayload(context), context.id),
    (error) => error.status === 400,
  );
  assert.equal(
    (await h.client.submitOrder(submitPayload(context), context.id)).order.orderCode,
    'retry',
  );
  assert.equal(attempts, 2);
});

test('an account change between scheduling and sending prevents the POST', async () => {
  const h = clientHarness();
  const context = await h.client.prepareCheckout(payload);
  const pending = h.client.submitOrder(submitPayload(context), context.id);
  h.setOwner('bob');
  await assert.rejects(pending, helper.CheckoutAccountChangedError);
  assert.equal(h.calls.length, 1);
});

test('an account change during submission keeps an old-account success uncertain', async () => {
  const result = deferred();
  const h = clientHarness(() => result.promise);
  const context = await h.client.prepareCheckout(payload);
  const pending = h.client.submitOrder(submitPayload(context), context.id);
  await Promise.resolve();
  h.setOwner('bob');
  result.resolve({ order: { orderCode: 'alice-order' } });
  await assert.rejects(pending, helper.CheckoutSubmissionUncertainError);
  h.setOwner('alice');
  await assert.rejects(
    h.client.submitOrder(submitPayload(context), context.id),
    helper.CheckoutSubmissionUncertainError,
  );
  assert.equal(h.calls.length, 2);
});

function checkoutHarness({ prepare, submit, getAddresses } = {}) {
  const scope = vue.effectScope();
  const store = vue.reactive({ profile: { metadata: { name: 'alice' } } });
  const calls = { quotes: [], submissions: [], addresses: 0 };
  let serial = 0;
  const client = helper.createCheckoutClient({
    owner: () => store.profile?.metadata?.name ?? '',
    request: async (input) => {
      if (input.path.endsWith('/prepare')) {
        calls.quotes.push(input.data);
        return prepare
          ? prepare(input.data)
          : quote(`quote-${++serial}`, 10, input.data.selectedAddressId);
      }
      calls.submissions.push(input.data);
      return submit
        ? submit(input.data)
        : { order: { orderCode: 'created-order', paymentStatus: 'PENDING' } };
    },
  });
  const feature = loadTs('../src/composables/useCheckout.ts', {
    vue,
    '@/api/modules/checkout': { checkoutApi: client },
    '@/api/modules/address': {
      addressApi: {
        getAddresses: () => {
          calls.addresses++;
          return getAddresses ? getAddresses() : [{ id: 1, isDefault: true }, { id: 2 }];
        },
      },
    },
    '@/hooks/useRequest': { sendRequest: async (result) => result },
    '@/store': { useUserStore: () => store },
    '@/helpers/checkout': helper,
  });
  const checkout = scope.run(() => feature.useCheckout());
  return { checkout, calls, store, scope, feature };
}

test('address changes reprice and submit the server-confirmed address and amount', async (t) => {
  const h = checkoutHarness({
    prepare: async (input) =>
      quote(
        `address-${input.selectedAddressId}`,
        input.selectedAddressId === 2 ? 15 : 10,
        input.selectedAddressId,
      ),
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  await h.checkout.selectAddress({ id: 2 });
  await h.checkout.submit('leave at door');
  assert.equal(h.calls.submissions[0].selectedAddressId, 2);
  assert.equal(h.calls.submissions[0].expectedPayableAmount, 15);
  assert.equal(h.calls.submissions[0].customerNotes, 'leave at door');
  assert.equal(h.calls.submissions[0].items[0].selectedShippingRateId, 11);
});

test('a late address quote cannot replace the newer selection or clear its pending state', async (t) => {
  const requests = [deferred(), deferred()];
  let count = 0;
  const h = checkoutHarness({
    prepare: () => (++count === 1 ? quote('initial') : requests[count - 2].promise),
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  const old = h.checkout.selectAddress({ id: 2 });
  const latest = h.checkout.selectAddress({ id: 3 });
  requests[0].resolve(quote('old', 20, 2));
  await old;
  assert.equal(h.checkout.syncing.value, true);
  await assert.rejects(h.checkout.submit(''), (error) => error.reason === 'syncing');
  requests[1].resolve(quote('latest', 30, 3));
  await latest;
  assert.equal(h.checkout.context.value.id, 'latest');
  assert.equal(h.checkout.selectedAddress.value.id, 3);
  assert.equal(h.checkout.verified.value, true);
});

test('an old address-list response cannot overwrite a selection made while it was loading', async (t) => {
  const addresses = deferred();
  let count = 0;
  const h = checkoutHarness({
    getAddresses: () => (++count === 1 ? [{ id: 1 }] : addresses.promise),
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  const reload = h.checkout.syncAddress();
  const selection = h.checkout.selectAddress({ id: 3 });
  await selection;
  addresses.resolve([{ id: 1 }]);
  await reload;
  assert.equal(h.checkout.selectedAddress.value.id, 3);
  assert.equal(h.calls.quotes.at(-1).selectedAddressId, 3);
});

test('deleted addresses choose a valid default and a failed reprice blocks submission until retry', async (t) => {
  let fail = false;
  const h = checkoutHarness({
    getAddresses: () => [{ id: 2, isDefault: true }],
    prepare: async (input) => {
      if (fail) {
        throw new Error('Offline');
      }
      return quote('valid', 12, input.selectedAddressId);
    },
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize({ ...payload, selectedAddressId: 99 });
  assert.equal(h.checkout.selectedAddress.value.id, 2);
  fail = true;
  await h.checkout.selectAddress({ id: 3 });
  assert.equal(h.checkout.failed.value, true);
  assert.equal(h.checkout.verified.value, false);
  await assert.rejects(h.checkout.submit(''), (error) => error.reason === 'syncing');
  fail = false;
  await h.checkout.refresh();
  assert.equal(h.checkout.verified.value, true);
  assert.equal(h.checkout.selectedAddress.value.id, 3);
});

test('duplicate page submissions lock address changes and background repricing', async (t) => {
  const result = deferred();
  const h = checkoutHarness({ submit: () => result.promise });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  const first = h.checkout.submit('');
  await h.checkout.submit('');
  await h.checkout.selectAddress({ id: 2 });
  await h.checkout.syncAddress();
  await h.checkout.refresh();
  assert.equal(h.checkout.locked.value, true);
  assert.equal(h.calls.quotes.length, 1);
  assert.equal(h.calls.addresses, 1);
  result.resolve({ order: { orderCode: 'created-order' } });
  await first;
  assert.equal(h.calls.submissions.length, 1);
  assert.equal(h.checkout.completedOrder.value.orderCode, 'created-order');
});

test('an account switch clears the quote, suppresses pending responses, and requires a new checkout', async (t) => {
  const late = deferred();
  const h = checkoutHarness({ prepare: () => late.promise });
  t.after(() => h.scope.stop());
  const initialization = h.checkout.initialize(payload);
  await Promise.resolve();
  h.store.profile = { metadata: { name: 'bob' } };
  late.resolve(quote('alice-quote'));
  await initialization;
  assert.equal(h.checkout.accountChanged.value, true);
  assert.equal(h.checkout.context.value, null);
  assert.equal(h.checkout.selectedAddress.value, null);
  assert.equal(h.checkout.verified.value, false);
  await assert.rejects(h.checkout.submit(''), helper.CheckoutAccountChangedError);
  assert.equal(h.calls.submissions.length, 0);
});

test('explicit creation rejection refreshes pricing before permitting a retry', async (t) => {
  let attempts = 0;
  const h = checkoutHarness({
    submit: async () => {
      if (++attempts === 1) {
        throw Object.assign(new Error('Validation failed'), { status: 400 });
      }
      return { order: { orderCode: 'retried-order' } };
    },
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  await assert.rejects(h.checkout.submit(''), (error) => error.status === 400);
  assert.equal(h.calls.quotes.length, 2);
  assert.equal(h.checkout.verified.value, true);
  await h.checkout.submit('');
  assert.equal(h.checkout.completedOrder.value.orderCode, 'retried-order');
});

function confirmationPage(
  checkoutHarness,
  { redirectThrows = false, pageDepth = 1, backFails = false } = {},
) {
  const calls = { navigations: [], redirects: [], toasts: [], backs: 0 };
  let show;
  const source = readFileSync(
    new URL('../src/subpkg-trade/confirm/index.vue', import.meta.url),
    'utf8',
  ).match(SCRIPT_SETUP_PATTERN)[1];
  const module = { exports: {} };
  const dependencies = {
    vue,
    '@dcloudio/uni-app': {
      onLoad() {},
      onShow: (callback) => {
        show = callback;
      },
    },
    'vue-i18n': { useI18n: () => ({ t: (key) => key }) },
    '@/config': { useAppConfig: () => ({ business: {} }) },
    '@/helpers/auth': {
      guardCurrentPageAccess: () => true,
      navigateToPage: (url) => calls.navigations.push(url),
    },
    '@/helpers/icon': {},
    '@/utils/format': {},
    '@/helpers/order': {},
    '@/helpers/image': {},
    '@/composables/useCheckout': {
      ...checkoutHarness.feature,
      useCheckout: () => checkoutHarness.checkout,
    },
  };
  runInNewContext(
    ts.transpileModule(
      `${source}\nmodule.exports = { handleSubmit, goSelectAddress, goModifyCheckout, pricingFailureText, loading, hasInitialized };`,
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => dependencies[name] ?? (name.endsWith('.vue') ? {} : require(name)),
      uni: {
        showToast: (options) => calls.toasts.push(options.title),
        redirectTo: (options) => {
          calls.redirects.push(options.url);
          if (redirectThrows) {
            throw new Error('Navigation failed');
          }
        },
        navigateBack: (options) => {
          calls.backs++;
          if (backFails) {
            options.fail();
          }
        },
      },
      getCurrentPages: () => Array.from({ length: pageDepth }).fill({}),
    },
  );
  module.exports.loading.value = false;
  module.exports.hasInitialized.value = true;
  return { page: module.exports, calls, onShow: () => show() };
}

for (const redirectThrows of [false, true]) {
  test(`successful creation remains final when navigation ${redirectThrows ? 'throws' : 'leaves the page mounted'}`, async (t) => {
    const h = checkoutHarness();
    t.after(() => h.scope.stop());
    await h.checkout.initialize(payload);
    const page = confirmationPage(h, { redirectThrows });
    await page.page.handleSubmit();
    assert.equal(h.checkout.completedOrder.value.orderCode, 'created-order');
    assert.deepEqual(page.calls.redirects, ['/subpkg-trade/payment/index?orderCode=created-order']);
    page.onShow();
    page.page.goSelectAddress();
    await page.page.handleSubmit();
    assert.equal(h.calls.submissions.length, 1);
    assert.equal(h.calls.quotes.length, 1);
    assert.deepEqual(page.calls.navigations, [
      '/subpkg-trade/order-detail/index?orderCode=created-order',
    ]);
    assert.deepEqual(page.calls.toasts, []);
  });
}

test('zero-payable already-paid orders open the successful result directly', async (t) => {
  const h = checkoutHarness({
    prepare: async () => ({ ...quote('free', 0), isShippingRequired: false }),
    submit: async () => ({ order: { orderCode: 'free-order', paymentStatus: 'PAID' } }),
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  const page = confirmationPage(h);
  await page.page.handleSubmit();
  assert.equal(h.calls.submissions[0].expectedPayableAmount, 0);
  assert.equal(h.calls.submissions[0].selectedAddressId, undefined);
  assert.deepEqual(page.calls.redirects, [
    '/subpkg-trade/payment-result/index?status=success&orderCode=free-order',
  ]);
});

test('uncertain results offer order review without repricing or submitting again', async (t) => {
  const h = checkoutHarness({
    submit: async () => {
      throw new Error('Timeout');
    },
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  const page = confirmationPage(h);
  await page.page.handleSubmit();
  assert.equal(h.checkout.uncertain.value, true);
  page.onShow();
  await page.page.handleSubmit();
  assert.deepEqual(page.calls.navigations, ['/subpkg-trade/order-list/index']);
  assert.equal(h.calls.submissions.length, 1);
  assert.equal(h.calls.quotes.length, 1);
});

function requestHarness({ initialize, refresh } = {}) {
  const toasts = [];
  const store = {
    credential: 'alice-token',
    profile: { metadata: { name: 'alice' } },
    expiresAt: null,
  };
  const options = loadTs('../src/utils/request.ts', {
    alova: { createAlova: (config) => config },
    '@alova/adapter-uniapp': { __esModule: true, default: () => ({}) },
    '@alova/mock': { createAlovaMockAdapter() {} },
    '@/config': { useAppConfig: () => ({ halo: {} }) },
    '@/store': { useUserStore: () => store },
    '@/utils/date': { isTimeExpired: () => true },
    '@/utils/error': { showErrorToast: (message) => toasts.push(message) },
    '@/services/session': {
      ensureSessionInitialized: async () => initialize?.(store),
      refreshSession: async () => refresh?.(store),
    },
    '@/mock/index': {},
    '@/locales': { translate: (key) => key },
    '@/helpers/checkout': helper,
  }).alovaInst;
  return { store, options, toasts };
}

test('transport rechecks checkout ownership after session initialization and auth refresh', async () => {
  const h = requestHarness({
    initialize: (store) => {
      store.profile.metadata.name = 'bob';
    },
    refresh: (store) => {
      store.profile.metadata.name = 'bob';
    },
  });
  const method = {
    meta: { checkoutOwner: 'alice' },
    config: {},
    send: () => h.options.beforeRequest(method),
  };
  h.store.credential = '';
  await assert.rejects(h.options.beforeRequest(method), helper.CheckoutAccountChangedError);
  h.store.credential = 'alice-token';
  h.store.profile.metadata.name = 'alice';
  let clearCalls = 0;
  h.store.clearCredential = () => {
    clearCalls++;
  };
  await assert.rejects(
    h.options.responded.onSuccess(
      {
        statusCode: 401,
        header: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
        data: { status: 401 },
      },
      method,
    ),
    helper.CheckoutAccountChangedError,
  );
  assert.equal(method.config.headers, undefined);
  assert.equal(clearCalls, 0);
});

test('checkout transport preserves actual HTTP failures even when the response body omits or misstates status', async () => {
  const h = requestHarness();
  const method = { meta: { checkoutOwner: 'alice' }, config: {} };
  for (const status of [400, 404, 503]) {
    await assert.rejects(
      h.options.responded.onSuccess({ statusCode: status, data: { status: 400 } }, method),
      (error) => error.status === status,
    );
  }
  await assert.rejects(
    h.options.responded.onSuccess({ statusCode: 400, data: undefined }, method),
    (error) => error.status === 400,
  );
});

test('cart checkout preserves explicit shipping choices without matching quote items by index', async (t) => {
  const h = checkoutHarness({
    prepare: async (input) => ({
      ...quote('cart-quote', 45, input.selectedAddressId),
      source: 'CART',
      items: [
        { productVariant: { id: 7 }, quantity: 2, selectedShippingRateId: 11 },
        { productVariant: { id: 8 }, quantity: 1, selectedShippingRateId: 12 },
      ],
    }),
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize({
    source: 'CART',
    items: [
      { cartItemId: 50, quantity: 2 },
      { cartItemId: 60, quantity: 1, selectedShippingRateId: 55 },
    ],
  });
  await h.checkout.submit('');
  assert.equal(h.calls.submissions[0].source, 'CART');
  assert.equal(h.calls.submissions[0].items[0].cartItemId, 50);
  assert.equal(h.calls.submissions[0].items[1].cartItemId, 60);
  assert.equal(h.calls.submissions[0].items[0].selectedShippingRateId, undefined);
  assert.equal(h.calls.submissions[0].items[1].selectedShippingRateId, 55);
});

test('shipping checkout accepts a server inline address and rejects missing addresses', async (t) => {
  let inline = true;
  const h = checkoutHarness({
    getAddresses: () => [],
    prepare: async () => ({
      ...quote('inline-address'),
      selectedAddressId: undefined,
      userAddress: inline ? { firstName: 'Test', streetAddress: 'Test street' } : undefined,
    }),
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  await h.checkout.submit('');
  assert.equal(h.calls.submissions[0].userAddress.streetAddress, 'Test street');
  const missing = checkoutHarness({
    getAddresses: () => [],
    prepare: async () => ({
      ...quote('missing-address'),
      selectedAddressId: undefined,
    }),
  });
  t.after(() => missing.scope.stop());
  inline = false;
  await missing.checkout.initialize(payload);
  await assert.rejects(missing.checkout.submit(''), (error) => error.reason === 'selectAddress');
  assert.equal(missing.calls.submissions.length, 0);
});

test('an unavailable address list still allows native preparation and digital checkout', async (t) => {
  const h = checkoutHarness({
    getAddresses: async () => {
      throw new Error('Address service unavailable');
    },
    prepare: async () => ({ ...quote('digital'), isShippingRequired: false }),
  });
  t.after(() => h.scope.stop());
  assert.equal(await h.checkout.initialize(payload), true);
  assert.equal(h.checkout.verified.value, true);
  await h.checkout.submit('');
  assert.equal(h.calls.submissions.length, 1);
});

test('address-list failure still requests a new physical quote and never reuses an old price on rejection', async (t) => {
  let offline = false;
  const h = checkoutHarness({
    getAddresses: async () => {
      if (offline) {
        throw new Error('Address service unavailable');
      }
      return [{ id: 1 }];
    },
    prepare: async () => {
      if (offline) {
        throw Object.assign(new Error('Address is invalid'), { status: 400 });
      }
      return quote('initial-price');
    },
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  offline = true;
  await h.checkout.syncAddress();
  assert.equal(h.calls.quotes.length, 2);
  assert.equal(h.checkout.verified.value, false);
  assert.equal(h.checkout.failed.value, true);
  await assert.rejects(h.checkout.submit(''), (error) => error.reason === 'syncing');
  assert.equal(h.calls.submissions.length, 0);
});

test('late authentication failures from the previous checkout account preserve the new login', async () => {
  let refreshes = 0;
  let cleared = 0;
  const h = requestHarness({
    refresh: () => {
      refreshes++;
    },
  });
  h.store.profile.metadata.name = 'bob';
  h.store.clearCredential = () => {
    cleared++;
  };
  h.store.clearLoginState = () => {
    cleared++;
  };
  const method = { meta: { checkoutOwner: 'alice' }, config: {} };
  for (const status of [401, 403]) {
    await assert.rejects(
      h.options.responded.onSuccess(
        {
          statusCode: status,
          header: {
            'WWW-Authenticate':
              status === 401 ? 'Bearer error="invalid_token"' : 'Bearer error="insufficient_scope"',
          },
          data: { status },
        },
        method,
      ),
      helper.CheckoutAccountChangedError,
    );
  }
  assert.equal(refreshes, 0);
  assert.equal(cleared, 0);
});

const maxPerUserProblem = {
  detail: 'ID 为 79 的产品规格每个客户累计最多购买 5 件。',
  instance: 'http://localhost:8091/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/prepare',
  status: 400,
  title: '请求参数有误',
  requestId: '84ad6719-695',
  timestamp: '2026-10-22T09:38:21.640731Z',
};

test('a native prepare business 400 stays readable and blocks submission until a valid quote', async (t) => {
  const transport = requestHarness();
  const method = { meta: { checkoutOwner: 'alice' }, config: {} };
  let rejected = true;
  const h = checkoutHarness({
    prepare: async () => {
      if (rejected) {
        return transport.options.responded.onSuccess(
          { statusCode: 400, data: maxPerUserProblem },
          method,
        );
      }
      return quote('after-edit', 0);
    },
  });
  t.after(() => h.scope.stop());
  assert.equal(await h.checkout.initialize(payload), false);
  const page = confirmationPage(h);
  assert.equal(h.checkout.context.value, null);
  assert.equal(h.checkout.failed.value, true);
  assert.equal(h.checkout.verified.value, false);
  assert.equal(page.page.pricingFailureText.value, maxPerUserProblem.detail);
  await Promise.resolve();
  assert.equal(page.page.pricingFailureText.value, maxPerUserProblem.detail);
  await page.page.handleSubmit();
  assert.equal(h.calls.submissions.length, 0);
  assert.deepEqual(page.calls.toasts, []);
  assert.deepEqual(transport.toasts, []);
  rejected = false;
  assert.equal(await h.checkout.refresh(), true);
  assert.equal(h.checkout.failureDetail.value, null);
  assert.equal(h.checkout.failed.value, false);
  assert.equal(h.checkout.verified.value, true);
  assert.equal(h.checkout.context.value.calculateResult.payableAmount, 0);
});

test('checkout business reasons never come from network errors, internal 5xx or malformed payloads', async (t) => {
  for (const error of [
    new Error('Internal connection string and credentials'),
    { ...maxPerUserProblem, status: 503, detail: 'org.postgresql.Driver internal failure' },
    { ...maxPerUserProblem, status: 401 },
    { ...maxPerUserProblem, status: 403 },
    { status: 400, message: 'Internal exception message' },
    { ...maxPerUserProblem, detail: { password: 'do not show' } },
    { ...maxPerUserProblem, detail: '   ' },
  ]) {
    const h = checkoutHarness({
      prepare: async () => {
        throw error;
      },
    });
    t.after(() => h.scope.stop());
    await h.checkout.initialize(payload);
    assert.equal(h.checkout.failureDetail.value, null);
    assert.equal(confirmationPage(h).page.pricingFailureText.value, 'checkout.pricingFailed');
    assert.equal(h.checkout.verified.value, false);
  }
});

test('an older rejected quote cannot overwrite a later successful quote with its business reason', async (t) => {
  const late = deferred();
  let requests = 0;
  const h = checkoutHarness({
    prepare: async () => (++requests === 2 ? late.promise : quote(`quote-${requests}`)),
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  const old = h.checkout.selectAddress({ id: 2 });
  await h.checkout.selectAddress({ id: 3 });
  late.reject(maxPerUserProblem);
  await old;
  assert.equal(h.checkout.context.value.id, 'quote-3');
  assert.equal(h.checkout.verified.value, true);
  assert.equal(h.checkout.failed.value, false);
  assert.equal(h.checkout.failureDetail.value, null);
});

test('account changes clear existing business reasons and ignore another account late rejection', async (t) => {
  const late = deferred();
  let requests = 0;
  const h = checkoutHarness({
    prepare: async () => {
      if (++requests === 1) {
        throw maxPerUserProblem;
      }
      return late.promise;
    },
  });
  t.after(() => h.scope.stop());
  await h.checkout.initialize(payload);
  assert.equal(h.checkout.failureDetail.value, maxPerUserProblem.detail);
  const pending = h.checkout.refresh();
  assert.equal(h.checkout.failureDetail.value, null);
  h.store.profile = { metadata: { name: 'bob' } };
  late.reject(maxPerUserProblem);
  await pending;
  assert.equal(h.checkout.accountChanged.value, true);
  assert.equal(h.checkout.failed.value, false);
  assert.equal(h.checkout.failureDetail.value, null);
});

test('checkout HTTP 5xx never toast backend detail even if its body falsely claims a business 400', async () => {
  const h = requestHarness();
  const method = { meta: { checkoutOwner: 'alice' }, config: {} };
  await assert.rejects(
    h.options.responded.onSuccess(
      { statusCode: 503, data: { ...maxPerUserProblem, detail: 'Internal SQL credentials' } },
      method,
    ),
    (error) => error.status === 503 && helper.getCheckoutBusinessDetail(error) === null,
  );
  assert.deepEqual(h.toasts, []);
  await assert.rejects(h.options.responded.onError(new Error('Private network diagnostics')));
  assert.deepEqual(h.toasts, ['common.networkError']);
});

test('a failed checkout can return to its previous editor with a cart fallback', async (t) => {
  const h = checkoutHarness();
  t.after(() => h.scope.stop());
  for (const options of [{ pageDepth: 2 }, { pageDepth: 1 }, { pageDepth: 2, backFails: true }]) {
    const page = confirmationPage(h, options);
    page.page.goModifyCheckout();
    assert.equal(page.calls.backs, options.pageDepth > 1 ? 1 : 0);
    assert.deepEqual(
      page.calls.navigations,
      options.pageDepth === 1 || options.backFails ? ['/pages/cart/index'] : [],
    );
  }
  await h.checkout.initialize(payload);
  await h.checkout.submit('');
  const page = confirmationPage(h, { pageDepth: 2 });
  page.page.goModifyCheckout();
  assert.equal(page.calls.backs, 0);
  assert.deepEqual(page.calls.navigations, []);
});
