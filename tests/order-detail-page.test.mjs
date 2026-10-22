import assert from 'node:assert/strict';
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test';
import { ref, watch } from 'vue';
import { useOrderDetailPage } from '../src/hooks/useOrderDetailPage.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function detail(fulfillmentStatus = 'FULFILLED', extra = {}) {
  return {
    orderData: { status: 'OPEN', paymentStatus: 'PAID', fulfillmentStatus, ...extra },
    fulfillData: [],
  };
}

function setup(t, overrides = {}) {
  const account = ref('A');
  const calls = { request: [], prompt: 0, receipt: [], success: 0, failure: 0, guard: 0 };
  let allowed = true;
  const page = useOrderDetailPage({
    getAccountKey: () => account.value,
    guardAccess: () => {
      calls.guard += 1;
      return allowed && !!account.value;
    },
    request: async (code) => {
      calls.request.push({ code, account: account.value });
      return overrides.request ? overrides.request(code) : detail();
    },
    canConfirm: (order) => order.fulfillmentStatus === 'FULFILLED' && !order.confirmAt,
    confirm: () => {
      calls.prompt += 1;
      return overrides.confirm ? overrides.confirm() : Promise.resolve(true);
    },
    markAsReceived: async (code) => {
      calls.receipt.push(code);
      return overrides.markAsReceived?.(code);
    },
    onConfirmed: () => (calls.success += 1),
    onConfirmFailed: () => (calls.failure += 1),
  });
  t.after(page.dispose);
  page.setOrderCode('ORDER-1');
  return { page, account, calls, denyAccess: () => (allowed = false) };
}

test('loads only from show, coalesces repeated loads, and refreshes server fields after returning', async (t) => {
  const first = deferred();
  const latest = detail('FULFILLED', { autoConfirmAt: '2026-11-05T08:00:00Z' });
  let count = 0;
  const { page, calls } = setup(t, {
    request: () => (++count === 1 ? first.promise : Promise.resolve(latest)),
  });
  assert.equal(calls.request.length, 0);
  const initial = page.show();
  assert.strictEqual(page.load(), initial);
  assert.strictEqual(page.show(), initial);
  assert.equal(calls.request.length, 1);
  first.resolve(detail('PARTIAL'));
  await initial;
  assert.equal(page.data.value.orderData.fulfillmentStatus, 'PARTIAL');

  page.hide();
  await page.show();
  assert.equal(calls.request.length, 2);
  assert.strictEqual(page.data.value, latest);
  assert.equal(page.data.value.orderData.autoConfirmAt, '2026-11-05T08:00:00Z');
});

test('a failed return refresh exposes retry instead of keeping stale actionable order data', async (t) => {
  let fail = false;
  const requestError = new Error('Unavailable');
  const { page } = setup(t, {
    request: async () => {
      if (fail) {
        throw requestError;
      }
      return detail();
    },
  });
  await page.show();
  page.hide();
  fail = true;
  await page.show();
  assert.equal(page.data.value, null);
  assert.strictEqual(page.error.value, requestError);
  assert.equal(page.loading.value, false);
  fail = false;
  await page.load();
  assert.equal(page.error.value, null);
  assert.equal(page.data.value.orderData.fulfillmentStatus, 'FULFILLED');
});

test('checks access again for show, retry and confirmation', async (t) => {
  const { page, calls, denyAccess } = setup(t);
  await page.show();
  denyAccess();
  await page.confirmReceive();
  await page.load();
  page.hide();
  await page.show();
  assert.equal(calls.request.length, 1);
  assert.equal(calls.prompt, 0);
  assert.deepEqual(calls.receipt, []);
  assert.equal(page.data.value, null);
});

test('queues a fresh read after hide/show without concurrent reads or accepting the hidden response', async (t) => {
  const first = deferred();
  const second = deferred();
  const secondStarted = deferred();
  let count = 0;
  const { page, calls } = setup(t, {
    request: () => {
      if (++count === 1) {
        return first.promise;
      }
      secondStarted.resolve();
      return second.promise;
    },
  });
  const initial = page.show();
  page.hide();
  const returned = page.show();
  assert.strictEqual(returned, initial);
  assert.equal(calls.request.length, 1);
  first.resolve(detail('PARTIAL'));
  await secondStarted.promise;
  assert.equal(calls.request.length, 2);
  assert.equal(page.data.value, null);
  second.resolve(detail());
  await returned;
  assert.equal(page.data.value.orderData.fulfillmentStatus, 'FULFILLED');
});

test('discards responses across account switches and logout followed by the same account', async (t) => {
  const first = deferred();
  const second = deferred();
  const secondStarted = deferred();
  let count = 0;
  const { page, account, calls } = setup(t, {
    request: () => {
      if (++count === 1) {
        return first.promise;
      }
      secondStarted.resolve();
      return second.promise;
    },
  });
  const pending = page.show();
  account.value = null;
  account.value = 'A';
  first.resolve(detail('PARTIAL'));
  await secondStarted.promise;
  assert.equal(page.data.value, null);
  assert.equal(calls.request.length, 2);
  second.resolve(detail());
  await pending;

  account.value = 'B';
  await page.load();
  assert.equal(calls.request.at(-1).account, 'B');
  assert.equal(page.data.value.orderData.fulfillmentStatus, 'FULFILLED');
});

test('an old account request error cannot replace the new account data or retry state', async (t) => {
  const first = deferred();
  const second = deferred();
  const secondStarted = deferred();
  let count = 0;
  const { page, account, calls } = setup(t, {
    request: () => {
      if (++count === 1) {
        return first.promise;
      }
      secondStarted.resolve();
      return second.promise;
    },
  });
  const pending = page.show();
  account.value = 'B';
  first.reject(new Error('Old account failure'));
  await secondStarted.promise;
  assert.equal(calls.request.at(-1).account, 'B');
  assert.equal(page.data.value, null);
  assert.equal(page.error.value, null);
  const current = detail('FULFILLED', { code: 'CURRENT' });
  second.resolve(current);
  await pending;
  assert.strictEqual(page.data.value, current);
});

test('an account switch during the completed read update still queues a current account read', async (t) => {
  const { page, account, calls } = setup(t);
  const stop = watch(
    page.data,
    (value) => {
      if (value && account.value === 'A') {
        account.value = 'B';
      }
    },
    { flush: 'post' },
  );
  t.after(stop);
  await page.show();
  assert.equal(calls.request.length, 2);
  assert.equal(calls.request.at(-1).account, 'B');
  assert.notEqual(page.data.value, null);
});

test('locks repeated confirmation taps and cancellation sends no receipt request', async (t) => {
  const prompt = deferred();
  const { page, calls } = setup(t, { confirm: () => prompt.promise });
  await page.show();
  const confirmation = page.confirmReceive();
  await page.confirmReceive();
  assert.equal(calls.prompt, 1);
  prompt.resolve(false);
  await confirmation;
  assert.deepEqual(calls.receipt, []);
  assert.equal(calls.request.length, 1);
  assert.equal(page.confirming.value, false);
});

test('a prompt accepted after hide/show or revoked access cannot submit', async (t) => {
  const prompt = deferred();
  const { page, calls } = setup(t, { confirm: () => prompt.promise });
  await page.show();
  const confirmation = page.confirmReceive();
  page.hide();
  await page.show();
  prompt.resolve(true);
  await confirmation;
  assert.equal(calls.request.length, 2);
  assert.deepEqual(calls.receipt, []);

  const nextPrompt = deferred();
  const second = setup(t, { confirm: () => nextPrompt.promise });
  await second.page.show();
  const nextConfirmation = second.page.confirmReceive();
  second.denyAccess();
  nextPrompt.resolve(true);
  await nextConfirmation;
  assert.deepEqual(second.calls.receipt, []);
});

test('show during receipt submission waits for it to settle and then reads the confirmed order', async (t) => {
  const receipt = deferred();
  let received = false;
  const { page, calls } = setup(t, {
    request: async () => detail('FULFILLED', received ? { confirmAt: '2026-10-22T09:00:00Z' } : {}),
    markAsReceived: () => receipt.promise,
  });
  await page.show();
  const confirmation = page.confirmReceive();
  await Promise.resolve();
  assert.deepEqual(calls.receipt, ['ORDER-1']);
  page.hide();
  await page.show();
  await page.confirmReceive();
  assert.equal(calls.request.length, 1);
  assert.equal(calls.prompt, 1);
  received = true;
  receipt.resolve();
  await confirmation;
  assert.equal(calls.request.length, 2);
  assert.equal(calls.success, 0);
  assert.equal(page.data.value.orderData.confirmAt, '2026-10-22T09:00:00Z');
  assert.equal(page.confirming.value, false);
});

test('successful receipt confirmation refreshes once and the updated server state prevents another submission', async (t) => {
  let received = false;
  const { page, calls } = setup(t, {
    request: async () => detail('FULFILLED', received ? { confirmAt: '2026-10-22T09:00:00Z' } : {}),
    markAsReceived: async () => {
      received = true;
    },
  });
  await page.show();
  await page.confirmReceive();
  await page.confirmReceive();
  assert.equal(calls.success, 1);
  assert.equal(calls.failure, 0);
  assert.equal(calls.request.length, 2);
  assert.equal(calls.prompt, 1);
  assert.deepEqual(calls.receipt, ['ORDER-1']);
  assert.equal(page.data.value.orderData.confirmAt, '2026-10-22T09:00:00Z');
});

test('receipt results from an old account are ignored and current account is refreshed', async (t) => {
  const receipt = deferred();
  const { page, account, calls } = setup(t, { markAsReceived: () => receipt.promise });
  await page.show();
  const confirmation = page.confirmReceive();
  await Promise.resolve();
  account.value = 'B';
  assert.equal(page.data.value, null);
  assert.equal(calls.request.length, 1);
  receipt.resolve();
  await confirmation;
  assert.equal(calls.success, 0);
  assert.equal(calls.failure, 0);
  assert.equal(calls.request.at(-1).account, 'B');
});

test('receipt failure unlocks and reconciles server state, while unload ignores unfinished reads', async (t) => {
  const { page, calls } = setup(t, {
    markAsReceived: async () => {
      throw new Error('Network interrupted');
    },
  });
  await page.show();
  await page.confirmReceive();
  assert.equal(calls.failure, 1);
  assert.equal(calls.request.length, 2);
  assert.equal(page.confirming.value, false);

  const pending = deferred();
  const unloaded = setup(t, { request: () => pending.promise });
  const loading = unloaded.page.show();
  unloaded.page.dispose();
  pending.resolve(detail());
  await loading;
  assert.equal(unloaded.page.data.value, null);
  assert.equal(unloaded.page.error.value, null);
});
