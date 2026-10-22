import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

const SCRIPT_SETUP_PATTERN = /<script setup lang="ts">([\s\S]*?)<\/script>/;

function confirmationHarness({
  submit,
  payableAmount = 10,
  paymentStatus = 'PENDING',
  redirectThrows = false,
} = {}) {
  const calls = { submissions: [], quotes: [], promotions: [], navigations: [], redirects: [] };
  let show;
  const pageStack = [{ route: 'subpkg-trade/confirm/index' }];
  const inlineAddress = { firstName: 'Test', streetAddress: 'Test street' };
  const dependencies = {
    vue,
    '@dcloudio/uni-app': {
      onLoad() {},
      onShow: (callback) => {
        show = callback;
      },
    },
    'vue-i18n': { useI18n: () => ({ t: (key) => key }) },
    '@/config': { useAppConfig: () => ({ business: { currencySymbol: '¥' } }) },
    '@/api/modules/checkout': {
      checkoutApi: {
        submitOrder: async (payload, contextId) => {
          calls.submissions.push({ payload, contextId });
          return submit ? submit() : { order: { orderCode: 'created-order', paymentStatus } };
        },
      },
    },
    '@/helpers/auth': {
      guardCurrentPageAccess: () => true,
      navigateToPage: (url) => calls.navigations.push(url),
    },
    '@/helpers/icon': { ICON_COLOR: {} },
    '@/api/modules/address': { addressApi: { getAddresses: () => ({}) } },
    '@/hooks/useRequest': { useQuery: () => ({ run: async () => [] }) },
    '@/utils/format': {},
    '@/helpers/order': {},
    '@/helpers/image': {},
    '@/utils/error': { isHaloProblem: () => false },
    '@/helpers/checkout': { CheckoutSubmissionUncertainError: class extends Error {} },
    '@/composables/useCheckoutPromotions': {
      useCheckoutPromotions: () => ({
        context: vue.ref({
          id: 'quoted-context',
          source: 'BUY_NOW',
          isShippingRequired: true,
          userAddress: inlineAddress,
          items: [{ productVariant: { id: 1 }, quantity: 1 }],
          calculateResult: { payableAmount },
        }),
        syncing: vue.ref(false),
        verified: vue.ref(true),
        failed: vue.ref(false),
        error: vue.ref(null),
        selection: vue.ref({ customerCouponIds: [] }),
        supported: vue.ref(true),
        refresh: async (addressId) => {
          calls.quotes.push(addressId);
        },
        apply: async (selection) => {
          calls.promotions.push(selection);
          return true;
        },
      }),
    },
  };
  const module = { exports: {} };
  const sfc = readFileSync(
    new URL('../src/subpkg-trade/confirm/index.vue', import.meta.url),
    'utf8',
  );
  const script = sfc.match(SCRIPT_SETUP_PATTERN)?.[1];
  assert.ok(script, 'The confirmation page must expose a TypeScript setup script');
  const source = `${script}
    module.exports = { loading, hasInitialized, basePreparePayload, contextAddress,
      selectedAddress, submitting, completedOrderCode, handleSubmit, goSelectAddress,
      goSelectCoupons, applySelectedAddress, updatePromotions, refreshCheckoutContext };
  `;
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (dependencies[name]) {
          return dependencies[name];
        }
        if (name.endsWith('.vue')) {
          return {};
        }
        throw new Error(`Unexpected confirmation page dependency: ${name}`);
      },
      uni: {
        showToast() {},
        redirectTo: (options) => {
          calls.redirects.push(options.url);
          // Leave the page mounted even when navigation cannot complete.
          if (redirectThrows) {
            throw new Error('Navigation unavailable');
          }
        },
      },
      getCurrentPages: () => pageStack,
      Promise,
      Error,
      Date,
      Number,
    },
  );
  const page = module.exports;
  page.contextAddress.value = inlineAddress;
  page.loading.value = false;
  page.hasInitialized.value = true;
  page.basePreparePayload.value = {
    source: 'BUY_NOW',
    items: [{ productVariantId: 1, quantity: 1 }],
  };
  return { page, calls, onShow: () => show() };
}

test('a pending order submission blocks address changes, promotion changes and onShow repricing', async () => {
  let complete;
  const h = confirmationHarness({
    submit: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const pending = h.page.handleSubmit();
  assert.equal(h.page.submitting.value, true);
  h.onShow();
  h.page.goSelectAddress();
  h.page.goSelectCoupons();
  await h.page.applySelectedAddress({ id: 99 });
  await h.page.updatePromotions({ customerCouponIds: [1] });
  await h.page.refreshCheckoutContext(99);
  await new Promise(setImmediate);
  assert.equal(h.calls.submissions.length, 1);
  assert.equal(h.calls.navigations.length, 0);
  assert.equal(h.calls.quotes.length, 0);
  assert.equal(h.calls.promotions.length, 0);
  assert.equal(h.page.selectedAddress.value, null);
  complete({ order: { orderCode: 'created-order', paymentStatus: 'PENDING' } });
  await pending;
});

for (const redirectThrows of [false, true]) {
  test(`an order remains final when payment navigation ${redirectThrows ? 'throws' : 'does not leave the page'}`, async () => {
    const h = confirmationHarness({ redirectThrows });
    await h.page.handleSubmit();
    assert.equal(h.page.completedOrderCode.value, 'created-order');
    assert.equal(h.calls.redirects[0], '/subpkg-trade/payment/index?orderCode=created-order');
    h.onShow();
    h.page.goSelectAddress();
    h.page.goSelectCoupons();
    await h.page.applySelectedAddress({ id: 99 });
    await h.page.updatePromotions({ customerCouponIds: [1] });
    await h.page.refreshCheckoutContext(99);
    await h.page.handleSubmit();
    await new Promise(setImmediate);
    assert.equal(h.calls.submissions.length, 1);
    assert.equal(h.calls.quotes.length, 0);
    assert.equal(h.calls.promotions.length, 0);
    assert.deepEqual(h.calls.navigations, [
      '/subpkg-trade/order-detail/index?orderCode=created-order',
    ]);
  });
}

test('a zero-payable paid order redirects directly to the successful payment result', async () => {
  const h = confirmationHarness({ payableAmount: 0, paymentStatus: 'PAID' });
  await h.page.handleSubmit();
  assert.equal(h.calls.submissions[0].payload.expectedPayableAmount, 0);
  assert.equal(h.page.completedOrderCode.value, 'created-order');
  assert.deepEqual(h.calls.redirects, [
    '/subpkg-trade/payment-result/index?status=success&orderCode=created-order',
  ]);
});
