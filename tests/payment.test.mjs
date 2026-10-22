import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// eslint-disable-next-line test/no-import-node-test -- This suite runs with node --test.
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

const SCRIPT_SETUP_PATTERN = /<script setup lang="ts">([\s\S]*?)<\/script>/;

function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
      setTimeout,
      clearTimeout,
      ...globals,
    },
  );
  return module.exports;
}

const payment = loadTypeScript('../src/helpers/payment.ts');
const orderHelpers = loadTypeScript('../src/helpers/order.ts', {
  '@/locales': { translate: (key) => key },
});
const pendingOrder = {
  orderCode: 'order-1',
  status: 'OPEN',
  paymentStatus: 'PENDING',
  payableAmount: 10,
};
const method = { id: 0, enabled: true, provider: 'WECHAT_PAY', scene: 'MINI_PROGRAM' };
const initiatedPayment = {
  sessionCode: 'session-1',
  payload: {
    payload: {
      wechatPay: {
        jsapi: {
          package: 'prepay_id=real',
          timeStamp: '123',
          nonceStr: 'nonce',
          paySign: 'sign',
        },
      },
    },
  },
};

function harness({
  getOrder = async () => pendingOrder,
  getMethods = async () => [method],
  initiate = async () => initiatedPayment,
  getStatus = async () => 'PENDING',
  requestPayment,
  redirectTo,
} = {}) {
  const calls = {
    orders: [],
    methods: [],
    initiations: [],
    redirects: [],
    paymentRequests: [],
    toasts: [],
    timers: [],
  };
  const dependencies = {
    vue,
    'vue-i18n': { useI18n: () => ({ t: (key) => key }) },
    '@/helpers/order': orderHelpers,
    '@/helpers/payment': payment,
    '@/hooks/useRequest': { sendRequest: (response) => response },
    '@/api/modules/order': {
      orderApi: {
        getOrder: (code) => {
          calls.orders.push(code);
          return getOrder(code);
        },
        getPaymentMethods: (code) => {
          calls.methods.push(code);
          return getMethods(code);
        },
        initiatePayment: (code, payload) => {
          calls.initiations.push({ code, payload });
          return initiate(code, payload);
        },
        getPaymentSessionStatus: (code) => getStatus(code),
      },
    },
  };
  const globals = {
    uni: {
      redirectTo: (options) => {
        calls.redirects.push(options.url);
        redirectTo?.(options);
      },
      showToast: (options) => calls.toasts.push(options),
      requestPayment: (options) => {
        calls.paymentRequests.push(options);
        requestPayment?.(options);
      },
    },
    setTimeout: (callback) => {
      calls.timers.push(callback);
      return calls.timers.length;
    },
    clearTimeout: () => {},
  };
  const { useOrderPayment } = loadTypeScript(
    '../src/composables/useOrderPayment.ts',
    dependencies,
    globals,
  );
  const { usePaymentResult } = loadTypeScript(
    '../src/composables/usePaymentResult.ts',
    dependencies,
    globals,
  );
  const scope = vue.effectScope();
  const page = scope.run(useOrderPayment);
  const resultPage = scope.run(usePaymentResult);
  return { page, resultPage, calls, dispose: () => scope.stop() };
}

async function flush() {
  await new Promise(setImmediate);
}

test('only backend completion confirms success; authorization remains pending', () => {
  for (const status of ['PENDING', 'AUTHORIZED', 'UNKNOWN', undefined]) {
    assert.equal(payment.resolvePaymentResult(null, status), 'pending');
  }
  assert.equal(payment.resolvePaymentResult(null, 'SUCCESS'), 'success');
  for (const status of ['FAILED', 'EXPIRED', 'CANCELLED']) {
    assert.equal(payment.resolvePaymentResult(null, status), 'fail');
    assert.equal(payment.resolvePaymentResult({ paymentStatus: status }), 'fail');
  }
  assert.equal(payment.resolvePaymentResult({ paymentStatus: 'PAID' }, 'FAILED'), 'success');
});

test('poll exhaustion and network failures remain pending, while terminal statuses stop polling', async () => {
  for (const readStatus of [
    async () => 'PENDING',
    async () => 'AUTHORIZED',
    async () => {
      throw new Error('offline');
    },
  ]) {
    let attempts = 0;
    const result = await payment.pollPaymentSession({
      readStatus: () => {
        attempts++;
        return readStatus();
      },
      wait: async () => {},
      isActive: () => true,
      maxAttempts: 3,
    });
    assert.equal(result, 'pending');
    assert.equal(attempts, 3);
  }
  let attempts = 0;
  const result = await payment.pollPaymentSession({
    readStatus: async () => (++attempts === 1 ? 'PENDING' : 'FAILED'),
    wait: async () => {},
    isActive: () => true,
    maxAttempts: 5,
  });
  assert.equal(result, 'fail');
  assert.equal(attempts, 2);
});

test('a disposed polling request cannot produce a result after it resolves', async () => {
  let active = true;
  let finish;
  const pending = payment.pollPaymentSession({
    readStatus: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    wait: async () => {},
    isActive: () => active,
  });
  await flush();
  active = false;
  finish('SUCCESS');
  assert.equal(await pending, null);
});

test('payment method loading errors clear selection and permit a real retry for the same order', async () => {
  let attempt = 0;
  const h = harness({
    getMethods: async () => {
      if (++attempt === 1) {
        throw new Error('offline');
      }
      return [method, { ...method, id: 2, scene: 'PC_WEB' }, { ...method, id: 3, enabled: false }];
    },
  });
  await h.page.load('order-1');
  assert.equal(h.page.loadError.value, 'methods');
  assert.equal(h.page.paymentMethods.value.length, 0);
  assert.equal(h.page.selectedMethodId.value, null);
  await h.page.pay();
  assert.equal(h.calls.initiations.length, 0);
  await h.page.load();
  assert.equal(h.page.loadError.value, null);
  assert.equal(h.page.paymentMethods.value.length, 1);
  assert.equal(h.page.selectedMethodId.value, 0);
  assert.equal(h.page.canPay.value, true);
  assert.deepEqual(h.calls.methods, ['order-1', 'order-1']);
  h.dispose();
});

test('order loading errors block payment and retry recovers', async () => {
  let attempt = 0;
  const h = harness({
    getOrder: async () => {
      if (++attempt === 1) {
        throw new Error('offline');
      }
      return pendingOrder;
    },
  });
  await h.page.load('order-1');
  assert.equal(h.page.loadError.value, 'order');
  assert.equal(h.page.canPay.value, false);
  assert.equal(h.calls.methods.length, 0);
  await h.page.load();
  assert.equal(h.page.canPay.value, true);
  h.dispose();
});

test('payment rechecks the order and never initiates a paid or closed order', async () => {
  for (const latest of [
    { ...pendingOrder, paymentStatus: 'PAID' },
    { ...pendingOrder, status: 'CANCELLED' },
  ]) {
    let attempt = 0;
    const h = harness({ getOrder: async () => (++attempt === 1 ? pendingOrder : latest) });
    await h.page.load('order-1');
    await h.page.pay();
    assert.equal(h.calls.orders.length, 2);
    assert.equal(h.calls.initiations.length, 0);
    assert.equal(h.page.canPay.value, false);
    if (latest.paymentStatus === 'PAID') {
      assert.equal(h.calls.redirects.length, 1);
    }
    h.dispose();
  }
});

test('repeated taps and method changes are blocked during the prepayment check', async () => {
  let finish;
  let attempt = 0;
  const h = harness({
    getOrder: () =>
      ++attempt === 1
        ? Promise.resolve(pendingOrder)
        : new Promise((resolve) => {
            finish = resolve;
          }),
    requestPayment: ({ fail }) => fail({ errMsg: 'cancel' }),
  });
  await h.page.load('order-1');
  const pending = h.page.pay();
  await h.page.pay();
  h.page.selectMethod(99);
  assert.equal(h.page.selectedMethodId.value, 0);
  assert.equal(h.calls.orders.length, 2);
  finish(pendingOrder);
  await pending;
  assert.equal(h.calls.initiations.length, 1);
  assert.equal(h.calls.initiations[0].payload.paymentMethodId, 0);
  assert.equal(h.calls.redirects[0].includes('sessionCode=session-1'), true);
  assert.equal(h.calls.redirects[0].includes('status=fail'), false);
  await h.page.pay();
  assert.equal(h.calls.initiations.length, 1);
  h.dispose();
});

test('unloading while payment initiation is in flight prevents payment UI and navigation', async () => {
  let finish;
  const h = harness({
    initiate: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await h.page.load('order-1');
  const pending = h.page.pay();
  await flush();
  h.dispose();
  finish(initiatedPayment);
  await pending;
  assert.equal(h.calls.paymentRequests.length, 0);
  assert.equal(h.calls.redirects.length, 0);
});

test('unloading cancels polling timers and ignores a late backend status', async () => {
  let finish;
  const h = harness({
    getStatus: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    requestPayment: ({ success }) => success(),
  });
  await h.page.load('order-1');
  const pending = h.page.pay();
  await flush();
  h.calls.timers.shift()();
  await flush();
  h.dispose();
  finish('SUCCESS');
  await pending;
  assert.equal(h.calls.redirects.length, 0);
});

test('result requery handles delayed confirmation, stale failed sessions and network errors', async () => {
  let paid = false;
  const h = harness({
    getOrder: async () => ({ ...pendingOrder, paymentStatus: paid ? 'PAID' : 'PENDING' }),
    getStatus: async () => (paid ? 'FAILED' : 'PENDING'),
  });
  await h.resultPage.check('order-1', 'session-1');
  assert.equal(h.resultPage.result.value, 'pending');
  paid = true;
  await h.resultPage.check('order-1', 'session-1');
  assert.equal(h.resultPage.result.value, 'success');
  h.dispose();
  const offline = harness({
    getOrder: async () => {
      throw new Error('offline');
    },
    getStatus: async () => {
      throw new Error('offline');
    },
  });
  await offline.resultPage.check('order-1', 'session-1');
  assert.equal(offline.resultPage.result.value, 'pending');
  assert.equal(offline.resultPage.checking.value, false);
  offline.dispose();
});

test('late result responses cannot update an unloaded page', async () => {
  let finish;
  const h = harness({
    getOrder: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = h.resultPage.check('order-1');
  h.dispose();
  finish({ ...pendingOrder, paymentStatus: 'PAID' });
  await pending;
  assert.equal(h.resultPage.result.value, 'pending');
});

test('a late payment-method response cannot replace a newer order selection', async () => {
  let finishOld;
  const h = harness({
    getMethods: (code) =>
      code === 'old-order'
        ? new Promise((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve([{ ...method, id: 8 }]),
  });
  const oldLoad = h.page.load('old-order');
  await flush();
  await h.page.load('new-order');
  finishOld([{ ...method, id: 99 }]);
  await oldLoad;
  assert.equal(h.page.orderCode.value, 'new-order');
  assert.equal(h.page.selectedMethodId.value, 8);
  h.dispose();
});

test('the result page ignores a success URL flag and queries backend status', async () => {
  let onLoad;
  const h = harness();
  const source = readFileSync(
    new URL('../src/subpkg-trade/payment-result/index.vue', import.meta.url),
    'utf8',
  );
  const script = source.match(SCRIPT_SETUP_PATTERN)?.[1];
  assert.ok(script);
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(script, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        ({
          vue,
          '@dcloudio/uni-app': {
            onLoad: (callback) => {
              onLoad = callback;
            },
            onUnload() {},
          },
          'vue-i18n': { useI18n: () => ({ t: (key) => key, locale: vue.ref('zh-CN') }) },
          '@tdesign/uniapp/icon/icon.vue': {},
          '@/helpers/auth': { guardCurrentPageAccess: () => true },
          '@/composables/usePaymentResult': { usePaymentResult: () => h.resultPage },
          '@/helpers/icon': { ICON_COLOR: {} },
          '@/utils/format': { getCurrencySymbol: () => '¥' },
        })[name],
    },
  );
  await onLoad({ orderCode: 'order-1', sessionCode: 'session-1', status: 'success' });
  assert.equal(h.resultPage.result.value, 'pending');
  assert.deepEqual(h.calls.orders, ['order-1']);
  h.dispose();
});

test('unloading during the polling delay settles without another status request', async () => {
  let statusRequests = 0;
  const h = harness({
    getStatus: async () => {
      statusRequests++;
      return 'PENDING';
    },
    requestPayment: ({ success }) => success(),
  });
  await h.page.load('order-1');
  const pending = h.page.pay();
  await flush();
  assert.equal(h.calls.timers.length, 1);
  h.dispose();
  await pending;
  assert.equal(statusRequests, 0);
  assert.equal(h.calls.redirects.length, 0);
});

test('failed result navigation preserves the session and retries navigation without another payment', async () => {
  for (const failureMode of ['callback', 'throw']) {
    let attempts = 0;
    const h = harness({
      requestPayment: ({ fail }) => fail({ errMsg: 'cancel' }),
      redirectTo: ({ fail }) => {
        if (++attempts !== 1) {
          return;
        }
        if (failureMode === 'throw') {
          throw new Error('Navigation unavailable');
        }
        fail({ errMsg: 'Navigation unavailable' });
      },
    });
    await h.page.load('order-1');
    await h.page.pay();
    assert.equal(h.page.resultNavigationFailed.value, true);
    assert.equal(h.page.redirecting.value, false);
    assert.equal(h.page.awaitingResult.value, true);
    assert.equal(h.page.canPay.value, false);
    await h.page.pay();
    assert.equal(h.calls.initiations.length, 1);
    h.page.viewPaymentResult();
    assert.equal(h.calls.redirects.length, 2);
    assert.equal(h.calls.redirects[0], h.calls.redirects[1]);
    assert.ok(h.calls.redirects[1].includes('sessionCode=session-1'));
    assert.equal(h.page.resultNavigationFailed.value, false);
    assert.equal(h.page.redirecting.value, true);
    h.dispose();
  }
});

test('a failed result refresh cannot reuse an older paid order as new confirmation', async () => {
  let offline = false;
  const h = harness({
    getOrder: async () => {
      if (offline) {
        throw new Error('offline');
      }
      return { ...pendingOrder, paymentStatus: 'PAID' };
    },
    getStatus: async () => {
      if (offline) {
        throw new Error('offline');
      }
      return 'FAILED';
    },
  });
  await h.resultPage.check('order-1', 'stale-session');
  assert.equal(h.resultPage.result.value, 'success');
  assert.equal(h.resultPage.queryFailed.value, false);
  offline = true;
  await h.resultPage.check('order-1', 'stale-session');
  assert.equal(h.resultPage.result.value, 'pending');
  assert.equal(h.resultPage.queryFailed.value, true);
  h.dispose();
});
