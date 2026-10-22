// eslint-disable-next-line test/no-import-node-test -- This suite uses the built-in Node runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

const SCRIPT_SETUP_PATTERN = /<script setup lang="ts">([\s\S]*?)<\/script>/;
const H5_BLOCK_PATTERN = /\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g;

function evaluate(source, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (name in dependencies) {
          return dependencies[name];
        }
        if (name.endsWith('.vue')) {
          return {};
        }
        throw new Error(`Unexpected dependency: ${name}`);
      },
      ...globals,
    },
  );
  return module.exports;
}

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
const helpers = evaluate(read('../src/helpers/inquiry.ts'));
const contact = { type: 'LINK', label: 'Sales', linkUrl: 'tel:123' };
const inquiryVariant = {
  id: 101,
  pricingType: 'INQUIRY',
  price: 0,
  status: 'PUBLISHED',
  trackInventory: false,
  specValues: [{ name: 'Style', value: 'Custom' }],
};
const fixedVariant = {
  ...inquiryVariant,
  id: 102,
  pricingType: 'FIXED',
  price: 10,
  specValues: [{ name: 'Style', value: 'Standard' }],
};

function inquiryHarness({
  getConfig = async () => ({ contacts: [contact] }),
  open = () => true,
  baseURL = 'https://shop.test',
} = {}) {
  const calls = { requests: 0, links: [], previews: [] };
  const scope = vue.effectScope();
  const exports = evaluate(
    read('../src/composables/useProductInquiry.ts'),
    {
      vue,
      '@/config': { useAppConfig: () => ({ halo: { baseURL } }) },
      'vue-i18n': { useI18n: () => ({ t: (key) => key }) },
      '@/api/modules/shop': {
        shopApi: {
          getShopConfig: () => {
            calls.requests++;
            return getConfig();
          },
        },
      },
      '@/hooks/useRequest': { sendRequest: (response) => response },
      '@/helpers/inquiry': helpers,
      '@/helpers/link': {
        openLinkTarget: (target, options) => {
          calls.links.push({ target, options });
          return open(target, options);
        },
      },
      '@/helpers/image': { formatImageUrl: (url) => `https://shop.test${url}` },
    },
    { uni: { previewImage: (options) => calls.previews.push(options) } },
  );
  const inquiry = scope.run(exports.useProductInquiry);
  return { inquiry, calls, dispose: () => scope.stop() };
}

async function flush() {
  await new Promise(setImmediate);
}

test('inquiry is explicit SKU metadata; missing variants and a real free price do not imply inquiry', () => {
  assert.equal(helpers.isInquiryVariant(inquiryVariant), true);
  assert.equal(helpers.isInquiryVariant({ ...fixedVariant, price: 0 }), false);
  assert.equal(helpers.isInquiryProduct({ minPrice: 0, productVariants: [] }), false);
  assert.equal(helpers.isInquiryProduct({ productVariants: [inquiryVariant] }), true);
  assert.equal(
    helpers.isInquiryProduct({ productVariants: [inquiryVariant, fixedVariant] }),
    false,
  );
  assert.equal(
    helpers.isInquiryProduct({ productType: 'EXTERNAL', productVariants: [inquiryVariant] }),
    false,
  );
});

test('configured inquiry redirect wins over contacts; unusable contact rows are not invented', () => {
  const redirect = helpers.resolveInquiryAction({
    inquiryRedirectUrl: ' https://sales.test ',
    contacts: [contact],
  });
  assert.equal(redirect.type, 'redirect');
  assert.equal(redirect.target, 'https://sales.test');
  const unavailable = helpers.resolveInquiryAction({
    contacts: [{ type: 'LINK', label: 'Wechat', help: 'Only a description' }],
  });
  assert.equal(unavailable.type, 'unavailable');
});

test('the configured redirect is opened without silently replacing it with contacts when opening fails', async () => {
  const h = inquiryHarness({
    getConfig: async () => ({ inquiryRedirectUrl: 'custom:unsupported', contacts: [contact] }),
    open: () => false,
  });
  await h.inquiry.inquire();
  assert.equal(h.calls.links[0].target, 'custom:unsupported');
  assert.equal(h.inquiry.error.value, 'openFailed');
  assert.equal(h.inquiry.contacts.value.length, 0);
  assert.equal(h.inquiry.visible.value, true);
  h.dispose();
});

test('missing configuration and failed loads stay explicit and retry reads current merchant settings', async () => {
  let attempt = 0;
  const h = inquiryHarness({
    getConfig: async () => {
      if (++attempt === 1) {
        throw new Error('offline');
      }
      if (attempt === 2) {
        return {};
      }
      return { contacts: [contact] };
    },
  });
  await h.inquiry.inquire();
  assert.equal(h.inquiry.error.value, 'loadFailed');
  await h.inquiry.inquire();
  assert.equal(h.inquiry.error.value, 'unavailable');
  await h.inquiry.inquire();
  assert.equal(h.inquiry.error.value, null);
  assert.equal(h.inquiry.contacts.value[0].linkUrl, 'tel:123');
  assert.equal(h.calls.requests, 3);
  h.dispose();
});

test('LINK and IMAGE contacts follow their configured targets, with image preview only when no image link is set', async () => {
  const h = inquiryHarness();
  await h.inquiry.inquire();
  h.inquiry.openContact(contact);
  h.inquiry.openContact({ type: 'IMAGE', label: 'QR', image: '/qr.png' });
  assert.equal(h.calls.previews[0].urls[0], 'https://shop.test/qr.png');
  h.inquiry.openContact({
    type: 'IMAGE',
    label: 'QR',
    image: '/qr.png',
    imageHref: 'https://sales.test/qr',
  });
  assert.equal(h.calls.links[1].target, 'https://sales.test/qr');
  assert.equal(h.calls.previews.length, 1);
  h.dispose();
});

test('closing a pending inquiry cancels its late redirect and a new attempt can load normally', async () => {
  let finish;
  const h = inquiryHarness({
    getConfig: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = h.inquiry.inquire();
  await h.inquiry.inquire();
  assert.equal(h.calls.requests, 1);
  h.inquiry.close();
  finish({ inquiryRedirectUrl: 'https://sales.test' });
  await pending;
  assert.equal(h.calls.links.length, 0);
  assert.equal(h.inquiry.visible.value, false);
  assert.equal(h.inquiry.loading.value, false);
  h.dispose();
});

test('late link failures cannot reopen a closed sheet or an unloaded page', async () => {
  const h = inquiryHarness({
    getConfig: async () => ({ inquiryRedirectUrl: 'https://sales.test' }),
  });
  await h.inquiry.inquire();
  const fail = h.calls.links[0].options.onError;
  h.inquiry.close();
  fail();
  assert.equal(h.inquiry.visible.value, false);
  h.dispose();
  fail();
  assert.equal(h.inquiry.visible.value, false);
});

function detailHarness(productType = 'PHYSICAL') {
  const h = inquiryHarness();
  const calls = { cart: [], checkout: [], external: [], auth: 0 };
  const product = {
    id: 1,
    productType,
    externalLinkUrl: 'https://external.test',
    productVariants: [inquiryVariant, fixedVariant],
  };
  const script = read('../src/subpkg-product/detail/index.vue').match(SCRIPT_SETUP_PATTERN)?.[1];
  assert.ok(script);
  const scope = vue.effectScope();
  const page = scope.run(() =>
    evaluate(
      `${script}\nmodule.exports = { selectedSpecs, selectedVariant, isInquiry, handleAddToCart, handleBuyNow };`,
      {
        vue,
        '@dcloudio/uni-app': {
          onLoad() {},
          onUnload() {},
          onShareAppMessage() {},
          onShareTimeline() {},
        },
        'vue-i18n': { useI18n: () => ({ t: (key) => key }) },
        '@/config': {
          useAppConfig: () => ({
            business: { currencySymbol: '¥', contactServiceEnabled: false },
            app: { name: 'Shop' },
          }),
        },
        '@/helpers/icon': { ICON_COLOR: {} },
        '@/helpers/image': {},
        '@/helpers/inquiry': helpers,
        '@/helpers/product': {
          isExternalProduct: (value) => value.productType === 'EXTERNAL',
          openExternalProduct: (value) => calls.external.push(value),
        },
        '@/composables/useProductInquiry': { useProductInquiry: () => h.inquiry },
        '@/hooks/useAuth': {
          useAuth: () => ({
            requireAuth: () => {
              calls.auth++;
              return true;
            },
          }),
        },
        '@/hooks/useCart': {
          useCart: () => ({
            addToCart: (...args) => calls.cart.push(args),
            totalCount: vue.ref(0),
            goToCart() {},
          }),
        },
        '@/hooks/usePageShare': {
          usePageShare: () => ({
            showShareMenu() {},
            createShareAppMessage() {},
            createShareTimeline() {},
          }),
        },
        '@/hooks/useRequest': {
          useQuery: () => ({
            data: vue.ref(product),
            loading: vue.ref(false),
            error: vue.ref(null),
          }),
        },
        '@/api/modules/product': { productApi: {} },
      },
      { uni: { navigateTo: (options) => calls.checkout.push(options.url), showToast() {} } },
    ),
  );
  return {
    ...h,
    page,
    detailCalls: calls,
    dispose: () => {
      scope.stop();
      h.dispose();
    },
  };
}

test('switching mixed SKU pricing changes the real add-to-cart and checkout guards', async () => {
  const h = detailHarness();
  h.page.selectedSpecs.value = { Style: 'Custom' };
  assert.equal(h.page.isInquiry.value, true);
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  await flush();
  assert.equal(h.detailCalls.cart.length, 0);
  assert.equal(h.detailCalls.checkout.length, 0);
  assert.equal(h.detailCalls.auth, 0);
  h.page.selectedSpecs.value = { Style: 'Standard' };
  assert.equal(h.page.isInquiry.value, false);
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.equal(h.detailCalls.cart[0][0], 102);
  assert.ok(h.detailCalls.checkout[0].includes('variantId=102'));
  h.page.selectedSpecs.value = { Style: 'Custom' };
  await h.page.handleAddToCart();
  assert.equal(h.detailCalls.cart.length, 1);
  h.dispose();
});

test('external product actions retain priority over inquiry SKU metadata', async () => {
  const h = detailHarness('EXTERNAL');
  assert.equal(h.page.isInquiry.value, false);
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.equal(h.detailCalls.external.length, 2);
  assert.equal(h.calls.requests, 0);
  assert.equal(h.detailCalls.cart.length, 0);
  h.dispose();
});

test('mini program HTTP contact links use the existing clipboard path and report copy errors', () => {
  let clipboard;
  let failed = 0;
  const { openLinkTarget } = evaluate(
    read('../src/helpers/link.ts').replace(H5_BLOCK_PATTERN, ''),
    {
      '@/helpers/auth': { navigateToPage() {} },
    },
    {
      uni: {
        setClipboardData: (options) => {
          clipboard = options;
        },
      },
    },
  );
  assert.equal(
    openLinkTarget('https://sales.test', {
      onError: () => {
        failed++;
      },
    }),
    true,
  );
  assert.equal(clipboard.data, 'https://sales.test');
  clipboard.fail();
  assert.equal(failed, 1);
});

test('synchronous clipboard failure remains visible, and late preview failures do not reopen a closed sheet', async () => {
  const h = inquiryHarness({
    getConfig: async () => ({ inquiryRedirectUrl: 'https://sales.test' }),
    open: (_target, options) => {
      options.onError();
      return true;
    },
  });
  await h.inquiry.inquire();
  assert.equal(h.inquiry.error.value, 'openFailed');
  assert.equal(h.inquiry.visible.value, true);
  h.inquiry.openContact({ type: 'IMAGE', label: 'QR', image: '/qr.png' });
  const previewFailed = h.calls.previews[0].fail;
  h.inquiry.close();
  previewFailed();
  assert.equal(h.inquiry.visible.value, false);
  h.dispose();
});

test('inquiry web targets resolve against Halo without a browser URL global or mini-program routes', () => {
  for (const [target, base, expected] of [
    ['/contact', 'https://shop.test', 'https://shop.test/contact'],
    ['/pages/contact/index', 'https://shop.test/base/', 'https://shop.test/pages/contact/index'],
    ['contact', 'https://shop.test/base/', 'https://shop.test/base/contact'],
    [
      '../contact?sku=1#sales',
      'https://shop.test/base/shop/',
      'https://shop.test/base/contact?sku=1#sales',
    ],
    ['../../../../contact', 'https://shop.test/base/', 'https://shop.test/contact'],
    ['//sales.test/contact', 'https://shop.test', 'https://sales.test/contact'],
    ['//sales.test/contact', 'http://localhost:8090/base/', 'http://sales.test/contact'],
    ['?sku=1#sales', 'https://shop.test/base/?old=1', 'https://shop.test/base/?sku=1#sales'],
    ['#sales', 'https://shop.test/base/?sku=1', 'https://shop.test/base/?sku=1#sales'],
    ['https://sales.test/contact', 'invalid', 'https://sales.test/contact'],
    ['tel:123', 'https://shop.test', 'tel:123'],
  ]) {
    assert.equal(helpers.resolveInquiryTarget(target, base), expected);
  }
  assert.equal(helpers.resolveInquiryTarget('/contact', 'invalid'), null);
  assert.equal(helpers.resolveInquiryTarget('//', 'https://shop.test'), null);
});

test('redirect, contact links and image links all use the resolved web URL', async () => {
  const h = inquiryHarness({
    getConfig: async () => ({ inquiryRedirectUrl: '/contact' }),
    baseURL: 'https://shop.test/base/',
  });
  await h.inquiry.inquire();
  assert.equal(h.calls.links[0].target, 'https://shop.test/contact');
  h.inquiry.openContact({ type: 'LINK', label: 'Sales', linkUrl: '/pages/contact/index' });
  assert.equal(h.calls.links[1].target, 'https://shop.test/pages/contact/index');
  h.inquiry.openContact({
    type: 'IMAGE',
    label: 'QR',
    image: '/qr.png',
    imageHref: '//sales.test/contact',
  });
  assert.equal(h.calls.links[2].target, 'https://sales.test/contact');
  h.dispose();
});

test('an invalid Halo base leaves relative inquiry links in an explicit retryable error state', async () => {
  const h = inquiryHarness({
    getConfig: async () => ({ inquiryRedirectUrl: '/contact', contacts: [contact] }),
    baseURL: 'invalid',
  });
  await h.inquiry.inquire();
  assert.equal(h.calls.links.length, 0);
  assert.equal(h.inquiry.error.value, 'openFailed');
  assert.equal(h.inquiry.visible.value, true);
  assert.equal(h.inquiry.contacts.value.length, 0);
  assert.equal(h.inquiry.loading.value, false);
  h.dispose();
});
