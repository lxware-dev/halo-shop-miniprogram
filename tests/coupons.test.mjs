import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

const require = createRequire(import.meta.url);
function loadTs(path, dependencies = {}, globals = {}) {
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
    ...globals,
  });
  return module.exports;
}
const helper = loadTs('../src/helpers/coupon.ts');
const errorHelper = loadTs('../src/utils/error.ts', {
  '@/locales': { translate: (key) => key },
});
const orderHelper = loadTs('../src/helpers/order.ts', {
  '@/locales': { translate: (key) => key },
});

test('discounted orders retain actual shipping and zero payable amounts across pages', () => {
  const discounted = orderHelper.getOrderAmounts({
    subtotalAmount: 99,
    shippingAmount: 10,
    totalAmount: 94,
    payableAmount: 94,
  });
  assert.equal(discounted.subtotal, 99);
  assert.equal(discounted.shipping, 10);
  assert.equal(discounted.payable, 94);
  assert.equal(orderHelper.getOrderAmounts({ payableAmount: 0, totalAmount: 99 }).payable, 0);
  const legacy = orderHelper.getOrderAmounts({
    items: [{ unitPrice: 5, quantity: 2 }],
    totalAmount: 12,
  });
  assert.equal(legacy.subtotal, 10);
  assert.equal(legacy.shipping, 2);
  assert.equal(legacy.payable, 12);
});

function checkoutHarness(initial) {
  const pending = [];
  const { useCheckoutPromotions } = loadTs('../src/composables/useCheckoutPromotions.ts', {
    vue,
    '@/helpers/coupon': helper,
    '@/utils/error': errorHelper,
    '@/api/modules/checkout': {
      checkoutApi: {
        supportsPromotions: (id) => id === 'session',
        prepareCheckout: (payload, options) =>
          new Promise((resolve, reject) => pending.push({ payload, options, resolve, reject })),
      },
    },
  });
  const base = vue.ref({
    source: 'BUY_NOW',
    items: [{ productVariantId: 1, quantity: 1 }],
    ...(initial ? { selectedAddressId: 10 } : {}),
  });
  const accepted = [];
  return {
    state: useCheckoutPromotions(base, (context) => accepted.push(context), initial),
    pending,
    accepted,
  };
}
function response(amount, promotions = {}) {
  return { id: 'session', calculateResult: { payableAmount: amount, ...promotions } };
}
async function initialize(harness) {
  const operation = harness.state.refresh(10);
  harness.pending[0].resolve(response(100));
  assert.equal(await operation, true);
}

test('wallet expiry boundary and used status are classified consistently', () => {
  assert.equal(
    helper.getCouponStatus(
      { status: 'AVAILABLE', expiresAt: '2026-10-10T00:00:00Z' },
      Date.parse('2026-10-10T00:00:00Z'),
    ),
    'EXPIRED',
  );
  assert.equal(helper.getCouponStatus({ status: 'USED', expiresAt: '2020-01-01' }), 'USED');
  assert.equal(helper.getCouponStatus({ status: 'AVAILABLE' }), 'AVAILABLE');
  assert.equal(helper.getCouponStatus({}), 'UNKNOWN');
  assert.deepEqual([...helper.normalizeCouponIds([1, 1, -1, 0, 1.2, Number.NaN, 2])], [1, 2]);
});

test('unsupported backend keeps the original checkout request contract', async () => {
  const h = checkoutHarness();
  const initial = h.state.refresh(10);
  h.pending[0].resolve({ calculateResult: { payableAmount: 100 } });
  assert.equal(await initial, true);
  assert.equal(h.state.supported.value, false);
  assert.equal(await h.state.apply({ customerCouponIds: [1], discountCode: 'SAVE10' }), false);
  assert.equal('customerCouponIds' in h.pending[0].payload, false);
});

test('only server accepted coupons and code are carried to address recalculation', async () => {
  const h = checkoutHarness();
  await initialize(h);
  const change = h.state.apply({ customerCouponIds: [1, 2], discountCode: ' save10 ' });
  assert.equal(h.state.verified.value, false);
  h.pending[1].resolve(
    response(75, {
      discountCode: 'SAVE10',
      appliedCoupons: [{ customerCouponId: 1 }],
      rejectedCoupons: [{ customerCouponId: 2 }],
    }),
  );
  assert.equal(await change, true);
  assert.deepEqual([...h.state.selection.value.customerCouponIds], [1]);
  const address = h.state.refresh(20);
  assert.equal(h.pending[2].payload.selectedAddressId, 20);
  assert.equal(h.pending[2].options.selection.discountCode, 'SAVE10');
  assert.deepEqual([...h.pending[2].options.selection.customerCouponIds], [1]);
  h.pending[2].resolve(
    response(75, { discountCode: 'SAVE10', appliedCoupons: [{ customerCouponId: 1 }] }),
  );
  await address;
});

test('failed promotion changes block submission until the previous selection is revalidated', async () => {
  const h = checkoutHarness();
  await initialize(h);
  const change = h.state.apply({ customerCouponIds: [], discountCode: 'EXPIRED' });
  h.pending[1].reject(new Error('Expired'));
  assert.equal(await change, false);
  assert.equal(h.state.verified.value, false);
  assert.equal(h.state.failed.value, true);
  assert.equal(h.state.context.value.calculateResult.payableAmount, 100);
  assert.equal(h.state.selection.value.discountCode, undefined);
  const retry = h.state.refresh(10);
  assert.equal(h.pending[2].options.selection.discountCode, undefined);
  h.pending[2].resolve(response(100));
  assert.equal(await retry, true);
  assert.equal(h.state.verified.value, true);
});

test('a rejected discount code reprices the accepted selection without showing a pricing error', async () => {
  const h = checkoutHarness({
    context: response(75, { discountCode: 'SAVE10', appliedCoupons: [{ customerCouponId: 1 }] }),
    selection: { customerCouponIds: [1], discountCode: 'SAVE10' },
  });
  const change = h.state.apply({ customerCouponIds: [1], discountCode: 'EXPIRED' });
  const problem = { status: 400, title: 'Bad Request', detail: '优惠码已过期' };
  h.pending[0].reject(problem);
  await new Promise(setImmediate);
  assert.equal(h.state.failed.value, false);
  assert.equal(h.state.syncing.value, true);
  assert.equal(h.state.verified.value, false);
  assert.equal(h.pending[1].options.selection.discountCode, 'SAVE10');
  assert.deepEqual([...h.pending[1].options.selection.customerCouponIds], [1]);
  assert.equal(h.pending[1].payload.selectedAddressId, 10);
  h.pending[1].resolve(
    response(70, { discountCode: 'SAVE10', appliedCoupons: [{ customerCouponId: 1 }] }),
  );
  assert.equal(await change, false);
  assert.equal(h.state.context.value.calculateResult.payableAmount, 70);
  assert.equal(h.state.selection.value.discountCode, 'SAVE10');
  assert.equal(h.state.verified.value, true);
  assert.equal(h.state.failed.value, false);
  assert.equal(h.state.syncing.value, false);
  assert.equal(h.state.error.value.detail, '优惠码已过期');
});

test('a rejected first code restores an order without a code while recovery failures block checkout', async () => {
  for (const recoveryFails of [false, true]) {
    const h = checkoutHarness();
    await initialize(h);
    const change = h.state.apply({ customerCouponIds: [], discountCode: 'INVALID' });
    h.pending[1].reject({ status: 400, title: 'Bad Request', detail: '优惠码无效' });
    await new Promise(setImmediate);
    assert.equal(h.pending[2].options.selection.discountCode, undefined);
    assert.equal(h.pending[2].payload.selectedAddressId, 10);
    if (recoveryFails) {
      h.pending[2].reject(new Error('Network unavailable'));
    } else {
      h.pending[2].resolve(response(100));
    }
    assert.equal(await change, false);
    assert.equal(h.state.selection.value.discountCode, undefined);
    assert.equal(h.state.verified.value, !recoveryFails);
    assert.equal(h.state.failed.value, recoveryFails);
  }
});

test('address and initial checkout validation errors cannot reuse an old total', async () => {
  for (const initialized of [false, true]) {
    const h = checkoutHarness();
    if (initialized) {
      await initialize(h);
    }
    const change = h.state.refresh(20);
    h.pending.at(-1).reject({ status: 400, title: 'Bad Request', detail: '地址不可用' });
    assert.equal(await change, false);
    assert.equal(h.pending.length, initialized ? 2 : 1);
    assert.equal(h.state.verified.value, false);
    assert.equal(h.state.failed.value, true);
  }
});

test('a silently ignored discount code cannot confirm the order amount', async () => {
  const h = checkoutHarness();
  await initialize(h);
  const change = h.state.apply({ customerCouponIds: [], discountCode: 'UNKNOWN' });
  h.pending[1].resolve(response(100));
  assert.equal(await change, false);
  assert.equal(h.state.verified.value, false);
  assert.equal(h.state.failed.value, true);
  assert.equal(h.state.selection.value.discountCode, undefined);
});

test('a slow earlier response cannot overwrite newer address totals', async () => {
  const h = checkoutHarness();
  const old = h.state.refresh(10);
  const latest = h.state.refresh(20);
  h.pending[1].resolve(response(120));
  assert.equal(await latest, true);
  h.pending[0].resolve(response(100));
  assert.equal(await old, false);
  assert.equal(h.state.context.value.calculateResult.payableAmount, 120);
  assert.equal(h.accepted.length, 1);
});

test('zero total remains valid while malformed or negative totals cannot enable submission', async () => {
  const h = checkoutHarness();
  let operation = h.state.refresh(10);
  h.pending[0].resolve(response(0));
  assert.equal(await operation, true);
  operation = h.state.refresh(10);
  h.pending[1].resolve(response(-1));
  assert.equal(await operation, false);
  assert.equal(h.state.verified.value, false);
});

test('coupon amounts, expiry and selection counts use runtime-compatible named messages', () => {
  const messages = loadTs('../src/locales/message.ts');
  for (const locale of ['zh-CN', 'en-US']) {
    const catalog = loadTs(`../src/locales/messages/${locale}.ts`, {
      '../message': messages,
    }).default;
    const amount = catalog['coupon.minimum']({ named: () => '¥100' });
    assert.equal(amount.includes('¥100'), true);
    assert.equal(amount.includes('{amount}'), false);
    assert.equal(catalog['coupon.confirmSelection']({ named: () => 2 }).includes('2'), true);
  }
});

test('coupon picker previews preserve address and code while accepting only server-approved coupons', async () => {
  const h = checkoutHarness({
    context: response(90, { discountCode: 'SAVE10' }),
    selection: { customerCouponIds: [], discountCode: 'SAVE10' },
  });
  const operation = h.state.apply({ customerCouponIds: [1, 2], discountCode: 'SAVE10' });
  assert.equal(h.pending[0].payload.selectedAddressId, 10);
  assert.equal(h.pending[0].options.selection.discountCode, 'SAVE10');
  assert.deepEqual([...h.pending[0].options.selection.customerCouponIds], [1, 2]);
  assert.equal(h.state.verified.value, false);
  h.pending[0].resolve(
    response(75, {
      discountCode: 'SAVE10',
      appliedCoupons: [{ customerCouponId: 1 }],
      rejectedCoupons: [{ customerCouponId: 2, reasonCode: 'minOrderAmountNotMet' }],
    }),
  );
  assert.equal(await operation, true);
  assert.deepEqual([...h.state.selection.value.customerCouponIds], [1]);
  assert.equal(h.state.context.value.calculateResult.payableAmount, 75);
  assert.equal(
    h.state.context.value.calculateResult.rejectedCoupons[0].reasonCode,
    'minOrderAmountNotMet',
  );
});

test('coupon display converts percentage savings to Chinese fold values and warns only about valid expiring coupons', () => {
  assert.equal(helper.getCouponValue({ calculationType: 'PERCENTAGE', discountValue: 5 }), '9.5');
  assert.equal(
    helper.getCouponValue({ calculationType: 'PERCENTAGE', discountValue: 10 }, 'en-US'),
    '10',
  );
  assert.equal(helper.getCouponValue({ calculationType: 'AMOUNT', discountValue: 20.5 }), '20.5');
  const now = Date.parse('2026-10-10T00:00:00Z');
  assert.equal(
    helper.isCouponExpiring({ status: 'AVAILABLE', expiresAt: '2026-10-12T00:00:00Z' }, now),
    true,
  );
  assert.equal(
    helper.isCouponExpiring({ status: 'AVAILABLE', expiresAt: '2026-10-09T00:00:00Z' }, now),
    false,
  );
  assert.equal(
    helper.isCouponExpiring({ status: 'USED', expiresAt: '2026-10-12T00:00:00Z' }, now),
    false,
  );
  assert.equal(helper.isCouponExpiring({ status: 'AVAILABLE' }, now), false);
});

test('wallet snapshots and excluded products never claim unrestricted coupon eligibility', () => {
  assert.equal(
    helper.getCouponScopeMessage({ couponName: 'Wallet', scope: 'ALL' }),
    'coupon.eligibilityHint',
  );
  assert.equal(
    helper.getCouponScopeMessage({ name: 'Offer', scope: 'ALL', excludedProductIds: [1] }),
    'coupon.scopeWithExclusions',
  );
  assert.equal(
    helper.getCouponScopeMessage({ name: 'Offer', scope: 'ALL', excludeSaleItems: true }),
    'coupon.scopeWithExclusions',
  );
  assert.equal(helper.getCouponScopeMessage({ name: 'Offer', scope: 'ALL' }), 'coupon.allProducts');
});
