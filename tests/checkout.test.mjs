import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { faker } from '@faker-js/faker/locale/zh_CN';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadTs(path, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
    Date,
    Number,
    Set,
    Promise,
    Error,
  });
  return module.exports;
}
const couponsHelper = loadTs('../src/helpers/coupon.ts');
const checkoutHelper = loadTs('../src/helpers/checkout.ts', {
  '@/helpers/coupon': couponsHelper,
});
const payload = { source: 'BUY_NOW', items: [{ productVariantId: 1, quantity: 10 }] };
const base = '/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-';
function mockHarness() {
  const runtime = { defineMock: (routes) => routes };
  const coupons = loadTs('../src/mock/modules/coupon.mock.ts', {
    '@alova/mock': runtime,
    '@/helpers/coupon': couponsHelper,
  });
  const checkout = loadTs('../src/mock/modules/checkout.mock.ts', {
    '@alova/mock': runtime,
    '@faker-js/faker/locale/zh_CN': { faker },
    './coupon.mock': coupons,
  });
  const calls = [];
  const client = checkoutHelper.createCheckoutClient({
    owner: () => 'alice',
    promotionsEnabled: true,
    request: async (input) => {
      calls.push(input);
      const result = checkout.default[`[${input.method}]${input.path}`]({ data: input.data });
      if (result?.status >= 400) {
        throw result.body;
      }
      return structuredClone(result);
    },
  });
  return { client, calls, coupons, checkout };
}
const submission = (context) => ({
  ...payload,
  expectedPayableAmount: context.calculateResult.payableAmount,
});

test('live checkout preserves the original MP payload without probing theme routes', async () => {
  const calls = [];
  const client = checkoutHelper.createCheckoutClient({
    owner: () => 'alice',
    promotionsEnabled: false,
    request: async (input) => {
      calls.push(input);
      return input.path.endsWith('/prepare')
        ? { id: 'native', calculateResult: { payableAmount: 100 } }
        : { order: { orderCode: 'NATIVE_ORDER' } };
    },
  });
  const context = await client.prepareCheckout(payload);
  assert.equal(client.supportsPromotions(context.id), false);
  await assert.rejects(client.prepareCheckout(payload, { selection: { customerCouponIds: [1] } }));
  assert.equal(calls.length, 1);
  await client.submitOrder(submission(context), context.id);
  assert.deepEqual(
    calls.map((call) => call.path),
    [`${base}/prepare`, `${base}/submit`],
  );
  assert.deepEqual(calls[0].data, payload);
  assert.deepEqual(calls[1].data, submission(context));
});

test('Mock native prepare and submit preserve only the server-accepted promotions', async () => {
  const h = mockHarness();
  const context = await h.client.prepareCheckout(payload, {
    selection: { discountCode: ' SAVE10 ', customerCouponIds: [1, 2] },
  });
  assert.equal(h.client.supportsPromotions(context.id), true);
  assert.equal(context.calculateResult.discountCode, 'SAVE10');
  assert.deepEqual(
    context.calculateResult.appliedCoupons.map((coupon) => coupon.customerCouponId),
    [1],
  );
  assert.equal(context.calculateResult.rejectedCoupons[0].customerCouponId, 2);
  const created = await h.client.submitOrder(submission(context), context.id);
  const order = h.checkout.createdOrdersMap.get(created.order.orderCode);
  assert.equal(order.payableAmount, context.calculateResult.payableAmount);
  assert.equal(order.discountCode, 'SAVE10');
  assert.equal(order.couponDiscountAmount, context.calculateResult.couponDiscountAmount);
  assert.deepEqual([...h.calls[1].data.customerCouponIds], [1]);
});

test('Mock zero-payable checkout creates an already-paid order', async () => {
  const h = mockHarness();
  h.coupons.mockWallet[0].discountValue = 100000;
  const context = await h.client.prepareCheckout(payload, {
    selection: { customerCouponIds: [1] },
  });
  assert.equal(context.calculateResult.payableAmount, 0);
  const created = await h.client.submitOrder(submission(context), context.id);
  assert.equal(created.order.paymentStatus, 'PAID');
  assert.equal(h.checkout.createdOrdersMap.get(created.order.orderCode).payableAmount, 0);
});

test('ordinary re-pricing keeps Mock base prices stable and invalid codes return 400', async () => {
  const h = mockHarness();
  const first = await h.client.prepareCheckout(payload);
  const second = await h.client.prepareCheckout({ ...payload, selectedAddressId: 2 });
  assert.equal(first.calculateResult.payableAmount, second.calculateResult.payableAmount);
  await assert.rejects(
    h.client.prepareCheckout(payload, {
      selection: { discountCode: 'INVALID', customerCouponIds: [] },
    }),
    (error) => error.status === 400,
  );
  assert.equal(h.checkout.createdOrdersMap.size, 0);
});

test('stacked Mock discounts cannot exceed the merchandise subtotal', async () => {
  const h = mockHarness();
  h.coupons.mockWallet[0].discountValue = 100000;
  const context = await h.client.prepareCheckout(payload, {
    selection: { discountCode: 'SAVE10', customerCouponIds: [1] },
  });
  const result = context.calculateResult;
  assert.equal(result.payableAmount, 0);
  assert.equal(
    Number((result.discountAmount + result.couponDiscountAmount).toFixed(2)),
    result.saleTotalAmount,
  );
  const created = await h.client.submitOrder(submission(context), context.id);
  assert.equal(created.order.paymentStatus, 'PAID');
});

test('a coupon that expires after preview cannot produce an order at the old price', async () => {
  const h = mockHarness();
  const context = await h.client.prepareCheckout(payload, {
    selection: { customerCouponIds: [1] },
  });
  h.coupons.mockWallet[0].expiresAt = '2020-01-01T00:00:00Z';
  await assert.rejects(
    h.client.submitOrder(submission(context), context.id),
    (error) => error.status === 400,
  );
  assert.equal(h.checkout.createdOrdersMap.size, 0);
});

test('account changes during preparation cannot adopt the previous account quote', async () => {
  let owner = 'alice';
  let resolve;
  const calls = [];
  const client = checkoutHelper.createCheckoutClient({
    owner: () => owner,
    promotionsEnabled: false,
    request: (input) => {
      calls.push(input);
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  const pending = client.prepareCheckout(payload);
  owner = 'bob';
  resolve({ id: 'alice-context', calculateResult: { payableAmount: 100 } });
  await assert.rejects(pending, checkoutHelper.CheckoutAccountChangedError);
  assert.equal(calls[0].owner, 'alice');
  await assert.rejects(
    client.submitOrder({ ...payload, expectedPayableAmount: 100 }, 'alice-context'),
  );
  assert.equal(calls.length, 1);
});

test('duplicate submissions share one order creation, including after success', async () => {
  let submissions = 0;
  let release;
  const client = checkoutHelper.createCheckoutClient({
    owner: () => 'alice',
    promotionsEnabled: false,
    request: async (input) =>
      input.path.endsWith('/prepare')
        ? { id: 'native', calculateResult: { payableAmount: 100 } }
        : (submissions++,
          new Promise((resolve) => {
            release = resolve;
          })),
  });
  const context = await client.prepareCheckout(payload);
  const first = client.submitOrder(submission(context), context.id);
  const second = client.submitOrder(submission(context), context.id);
  await Promise.resolve();
  assert.equal(submissions, 1);
  release({ order: { orderCode: 'ONE_ORDER' } });
  assert.equal((await first).order.orderCode, (await second).order.orderCode);
  assert.equal(
    (await client.submitOrder(submission(context), context.id)).order.orderCode,
    'ONE_ORDER',
  );
  assert.equal(submissions, 1);
});

test('uncertain submission results never retry order creation', async () => {
  for (const outcome of ['timeout', 'server-error', 'missing-order']) {
    let submissions = 0;
    const client = checkoutHelper.createCheckoutClient({
      owner: () => 'alice',
      promotionsEnabled: false,
      request: async (input) => {
        if (input.path.endsWith('/prepare')) {
          return { id: 'native', calculateResult: { payableAmount: 100 } };
        }
        submissions++;
        if (outcome === 'timeout') {
          throw new Error('Timeout');
        }
        if (outcome === 'server-error') {
          throw Object.assign(new Error('Server error'), { status: 500 });
        }
        return {};
      },
    });
    const context = await client.prepareCheckout(payload);
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(
        client.submitOrder(submission(context), context.id),
        checkoutHelper.CheckoutSubmissionUncertainError,
      );
    }
    assert.equal(submissions, 1);
  }
});

test('a definite validation rejection permits retry while changed client amounts never submit', async () => {
  let attempts = 0;
  const client = checkoutHelper.createCheckoutClient({
    owner: () => 'alice',
    promotionsEnabled: false,
    request: async (input) => {
      if (input.path.endsWith('/prepare')) {
        return { id: 'native', calculateResult: { payableAmount: 100 } };
      }
      if (++attempts === 1) {
        throw Object.assign(new Error('Validation failed'), { status: 400 });
      }
      return { order: { orderCode: 'RETRIED' } };
    },
  });
  const context = await client.prepareCheckout(payload);
  await assert.rejects(client.submitOrder({ ...payload, expectedPayableAmount: 99 }, context.id));
  assert.equal(attempts, 0);
  await assert.rejects(
    client.submitOrder(submission(context), context.id),
    (error) => error.status === 400,
  );
  assert.equal(
    (await client.submitOrder(submission(context), context.id)).order.orderCode,
    'RETRIED',
  );
});
