import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// eslint-disable-next-line test/no-import-node-test -- This suite uses the project's Node transpilation test style.
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { faker } from '@faker-js/faker/locale/zh_CN';

async function flushInput() {
  await vue.nextTick();
  await new Promise(setImmediate);
}

const SCRIPT_SETUP_PATTERN = /<script setup lang="ts">([\s\S]*?)<\/script>/;
function loadModule(path, dependencies = {}, globals = {}, expose = '') {
  const file = readFileSync(new URL(path, import.meta.url), 'utf8');
  const source = path.endsWith('.vue') ? file.match(SCRIPT_SETUP_PATTERN)[1] : file;
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(`${source}\n${expose}`, {
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
const quantity = loadModule('../src/helpers/quantity.ts');
const variant = (overrides = {}) => ({
  id: 10,
  productId: 1,
  status: 'PUBLISHED',
  trackInventory: false,
  stock: 0,
  maxPerOrder: 3,
  maxPerUser: 1,
  specValues: [{ name: 'Size', value: 'S' }],
  ...overrides,
});
const product = (variants = [variant()]) => ({
  id: 1,
  productVariants: variants,
  specDefinition: [{ name: 'Size', values: [{ value: 'S' }, { value: 'L' }] }],
});
const translation = (key, values) => `${key}${values ? `:${JSON.stringify(values)}` : ''}`;

function skuHarness(input = {}) {
  const props = vue.reactive(input);
  const emitted = [];
  const scope = vue.effectScope();
  const page = scope.run(() =>
    loadModule(
      '../src/components/business/SkuSelector.vue',
      {
        vue,
        '@/helpers/quantity': quantity,
        '@/composables/useDrawer': { useDrawer: () => ({}) },
        '@/helpers/image': {},
        '@/helpers/icon': {},
        'vue-i18n': { useI18n: () => ({ t: translation }) },
        '@/config': { useAppConfig: () => ({ business: {} }) },
      },
      {
        defineProps: () => props,
        withDefaults: (value, defaults) => {
          for (const key in defaults) {
            if (value[key] === undefined) {
              value[key] = typeof defaults[key] === 'function' ? defaults[key]() : defaults[key];
            }
          }
          return value;
        },
        defineEmits: () => (name, value) => emitted.push({ name, value }),
      },
      'module.exports = { increment, decrement, onQuantityInput, onQuantityBlur, effectiveMax, quantityInput, selectSpec };',
    ),
  );
  return { props, page, emitted, stop: () => scope.stop() };
}

test('an untracked zero-stock SKU can increment and retains its configured per-order cap', () => {
  const h = skuHarness({ quantity: 2, trackInventory: false, stock: 0, maxPerOrder: 3 });
  h.page.increment();
  assert.equal(h.emitted[0].value, 3);
  h.props.quantity = 3;
  h.page.increment();
  assert.equal(h.emitted.length, 1);
  h.stop();
});

test('tracked stock and per-order caps both apply; neither can override the smaller bound', async () => {
  for (const settings of [
    { stock: 2, maxPerOrder: 8 },
    { stock: 8, maxPerOrder: 2 },
  ]) {
    const h = skuHarness({ quantity: 1, trackInventory: true, ...settings });
    h.page.onQuantityInput({ detail: { value: '100' } });
    await flushInput();
    assert.equal(h.emitted[0].value, 2);
    h.stop();
  }
});

test('manual edits do not submit decimals, zero, negative, or partially numeric strings', async () => {
  const h = skuHarness({ quantity: 2, maxPerOrder: 5 });
  for (const value of ['0', '-1', '2.5', '3x', 'Infinity', '']) {
    await h.page.onQuantityInput({ detail: { value } });
    h.page.onQuantityBlur({ detail: { value } });
    await flushInput();
    assert.equal(h.emitted.at(-1).value, 1);
  }
  h.page.onQuantityBlur({ detail: { value: '99999999999999999999' } });
  await flushInput();
  assert.equal(h.emitted.at(-1).value, 1);
  assert.equal(
    h.emitted.some((event) => !Number.isSafeInteger(event.value) || event.value < 1),
    false,
  );
  h.stop();
});

test('sold-out and zero-configured limits never emit a zero purchase quantity', async () => {
  for (const settings of [
    { trackInventory: true, stock: 0 },
    { maxPerOrder: 0 },
    { maxPerOrder: -1 },
  ]) {
    const h = skuHarness({ quantity: 1, ...settings });
    h.page.increment();
    assert.equal(h.emitted.length, 0);
    h.page.onQuantityBlur({ detail: { value: '10' } });
    await flushInput();
    assert.equal(h.emitted.at(-1).value, 1);
    h.stop();
  }
});

test('maxPerUser is informational and does not pretend to be remaining purchase capacity', () => {
  const h = skuHarness({
    quantity: 2,
    maxPerOrder: 5,
    maxPerUser: 1,
    trackInventory: false,
    stock: 0,
  });
  h.page.increment();
  assert.equal(h.emitted[0].value, 3);
  assert.equal(h.page.effectiveMax.value, 5);
  h.stop();
});

async function productHarness(variants = [variant()], productData = product(variants)) {
  const data = vue.ref(productData);
  const calls = { adds: [], navigations: [], toasts: [] };
  const scope = vue.effectScope();
  const page = scope.run(() =>
    loadModule(
      '../src/subpkg-product/detail/index.vue',
      {
        vue,
        '@/helpers/quantity': quantity,
        '@dcloudio/uni-app': { onLoad() {}, onShareAppMessage() {}, onShareTimeline() {} },
        'vue-i18n': { useI18n: () => ({ t: translation }) },
        '@/api/modules/product': {},
        '@/config': { useAppConfig: () => ({ business: {}, app: {} }) },
        '@/helpers/icon': {},
        '@/hooks/useAuth': { useAuth: () => ({ requireAuth: () => true }) },
        '@/hooks/useCart': {
          useCart: () => ({
            addToCart: async (...input) => {
              calls.adds.push(input);
            },
            totalCount: vue.ref(0),
            goToCart() {},
          }),
        },
        '@/hooks/usePageShare': { usePageShare: () => ({}) },
        '@/hooks/useRequest': {
          useQuery: () => ({
            data,
            loading: vue.ref(false),
            error: vue.ref(null),
            run: async () => data.value,
          }),
        },
        '@/helpers/image': {},
        '@/helpers/product': { isExternalProduct: () => false },
      },
      {
        uni: {
          showToast: (input) => calls.toasts.push(input.title),
          navigateTo: (input) => calls.navigations.push(input.url),
        },
      },
      'module.exports = { productId, loadProduct, quantity, selectedSpecs, selectedVariant, quantityLimit, isVariantAvailable, disabledSpecValues, handleAddToCart, handleBuyNow };',
    ),
  );
  page.productId.value = data.value.id;
  await page.loadProduct();
  return { page, calls, data, stop: () => scope.stop() };
}

test('product actions allow an untracked zero-stock SKU and send its selected quantity', async () => {
  const h = await productHarness();
  h.page.quantity.value = 3;
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.deepEqual(h.calls.adds, [[10, 3]]);
  assert.equal(h.calls.navigations[0], '/subpkg-trade/confirm/index?variantId=10&quantity=3');
  h.stop();
});

test('product add and buy actions block quantities over the cap and tracked sold-out variants', async () => {
  for (const settings of [
    { maxPerOrder: 2 },
    { maxPerOrder: 0 },
    { trackInventory: true, stock: 0 },
    { status: 'ARCHIVED' },
  ]) {
    const h = await productHarness([variant(settings)]);
    h.page.quantity.value = 3;
    await h.page.handleAddToCart();
    h.page.handleBuyNow();
    assert.equal(h.calls.adds.length, 0);
    assert.equal(h.calls.navigations.length, 0);
    assert.equal(h.calls.toasts.length, 2);
    h.stop();
  }
});

test('switching to a lower-limit SKU clamps the quantity before buy-now navigation', async () => {
  const h = await productHarness([
    variant({ maxPerOrder: 9 }),
    variant({ id: 11, maxPerOrder: 2, specValues: [{ name: 'Size', value: 'L' }] }),
  ]);
  h.page.quantity.value = 8;
  h.page.selectedSpecs.value = { Size: 'L' };
  assert.equal(h.page.quantity.value, 2);
  h.page.handleBuyNow();
  assert.equal(h.calls.navigations[0], '/subpkg-trade/confirm/index?variantId=11&quantity=2');
  h.stop();
});

function cartHarness({
  items = [],
  variants = [variant()],
  productData = product(variants),
  add,
  remove,
  update,
  getCart,
} = {}) {
  const cart = structuredClone(items);
  const calls = {
    adds: [],
    removes: [],
    updates: [],
    loads: 0,
    toasts: [],
    navigations: [],
    syncs: [],
  };
  const api = {
    getCartItems: async () => {
      calls.loads++;
      return getCart ? getCart(cart) : structuredClone(cart);
    },
    addCartItem: async (payload) => {
      calls.adds.push(payload);
      if (add) {
        return add(payload, cart);
      }
      const item = {
        id: 100,
        productVariantId: payload.productVariantId,
        quantity: payload.quantity,
        product: productData,
        productVariant: variants.find((v) => v.id === payload.productVariantId),
      };
      cart.push(item);
      return item;
    },
    removeCartItem: async (id) => {
      calls.removes.push(id);
      if (remove) {
        return remove(id, cart);
      }
      cart.splice(
        cart.findIndex((item) => item.id === id),
        1,
      );
    },
    updateCartItem: async (id, value) => {
      calls.updates.push({ id, quantity: value });
      if (update) {
        return update(id, value, cart);
      }
      const item = cart.find((item) => item.id === id);
      item.quantity = value;
      return structuredClone(item);
    },
  };
  const scope = vue.effectScope();
  const page = scope.run(() =>
    loadModule(
      '../src/pages/cart/index.vue',
      {
        vue,
        '@/helpers/quantity': quantity,
        '@dcloudio/uni-app': { onShow() {} },
        'vue-i18n': { useI18n: () => ({ t: translation }) },
        '@/api/modules/cart': { cartApi: api },
        '@/api/modules/product': { productApi: { getProduct: async () => productData } },
        '@/config': { useAppConfig: () => ({ business: { maxCartItems: 99 } }) },
        '@/helpers/order': {},
        '@/helpers/icon': {},
        '@/helpers/image': {},
        '@/composables/useTabBar': { useTabBar: () => ({ totalHeight: 0 }) },
        '@/hooks/useInitialLoading': { useInitialLoading: () => ({ markLoaded() {}, reset() {} }) },
        '@/hooks/useRequest': {
          sendRequest: (response) => Promise.resolve(response),
          useQuery: () => ({ loading: vue.ref(false), run: api.getCartItems }),
        },
        '@/hooks/usePullRefresh': { usePagePullRefresh() {} },
        '@/store': {
          useUserStore: () => ({ isLoggedIn: true }),
          useCartStore: () => ({
            syncFromServer: (input) => calls.syncs.push(input),
            clearAll() {},
            removeItem() {},
          }),
        },
      },
      {
        uni: {
          showToast: (input) => calls.toasts.push(input.title),
          navigateTo: (input) => calls.navigations.push(input.url),
        },
      },
      'module.exports = { cartItems, selectedIds, changeQuantity, goToCheckout, openSkuSelector, confirmSkuChange, skuSelectedSpecs, skuSelectedVariant, skuQuantity, skuVisible, cartRefreshRequired, loadCart };',
    ),
  );
  page.cartItems.value = structuredClone(cart);
  page.selectedIds.value = new Set(items.map((item) => item.id));
  return { page, calls, cart, stop: () => scope.stop() };
}
const cartItem = (overrides = {}) => ({
  id: 1,
  productVariantId: 10,
  quantity: 2,
  product: { id: 1 },
  productVariant: variant(),
  ...overrides,
});

test('cart increment respects root-level limit metadata and accepts untracked stock zero', async () => {
  const h = cartHarness({
    items: [cartItem({ maxPerOrder: 3, productVariant: variant({ maxPerOrder: undefined }) })],
  });
  const item = h.page.cartItems.value[0];
  await h.page.changeQuantity(item, 1);
  await h.page.changeQuantity(item, 1);
  assert.equal(h.calls.updates.length, 1);
  assert.equal(item.quantity, 3);
  h.stop();
});

test('decrementing an old cart quantity above a newly lowered cap repairs it in one request', async () => {
  const h = cartHarness({ items: [cartItem({ quantity: 8 })] });
  await h.page.changeQuantity(h.page.cartItems.value[0], -1);
  assert.equal(h.calls.updates[0].quantity, 3);
  h.stop();
});

test('out-of-date cart quantities cannot be forwarded to checkout', () => {
  const h = cartHarness({ items: [cartItem({ quantity: 8 })] });
  h.page.goToCheckout();
  assert.equal(h.calls.navigations.length, 0);
  assert.equal(h.calls.toasts.length, 1);
  h.stop();
});

test('a pending cart quantity update blocks repeated increments and checkout until it is confirmed', async () => {
  let finish;
  const h = cartHarness({
    items: [cartItem()],
    update: (id, value, cart) =>
      new Promise((resolve) => {
        finish = () => {
          cart[0].quantity = value;
          resolve(structuredClone(cart[0]));
        };
      }),
  });
  const item = h.page.cartItems.value[0];
  const pending = h.page.changeQuantity(item, 1);
  await h.page.changeQuantity(item, 1);
  h.page.goToCheckout();
  assert.equal(h.calls.updates.length, 1);
  assert.equal(h.calls.navigations.length, 0);
  finish();
  await pending;
  h.page.goToCheckout();
  assert.equal(h.calls.navigations.length, 1);
  h.stop();
});

test('a rejected SKU replacement keeps the original item and never deletes it', async () => {
  const h = cartHarness({
    items: [cartItem()],
    variants: [variant(), variant({ id: 11, specValues: [{ name: 'Size', value: 'L' }] })],
    add: async () => {
      throw Object.assign(new Error('Purchase limit'), { status: 400 });
    },
  });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  h.page.skuSelectedSpecs.value = { Size: 'L' };
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds.length, 1);
  assert.equal(h.calls.removes.length, 0);
  assert.equal(h.page.cartItems.value[0].id, 1);
  assert.equal(h.calls.toasts.includes('cart.updated'), false);
  h.stop();
});

test('SKU replacement checks the combined quantity when the target variant is already in the cart', async () => {
  const target = variant({ id: 11, specValues: [{ name: 'Size', value: 'L' }] });
  const h = cartHarness({
    items: [cartItem(), cartItem({ id: 2, productVariantId: 11, productVariant: target })],
    variants: [variant(), target],
  });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  h.page.skuSelectedSpecs.value = { Size: 'L' };
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds.length, 0);
  assert.equal(h.calls.removes.length, 0);
  h.stop();
});

test('a failed delete after adding a replacement reloads the actual cart and offers no false success', async () => {
  const h = cartHarness({
    items: [cartItem()],
    variants: [variant(), variant({ id: 11, specValues: [{ name: 'Size', value: 'L' }] })],
    remove: async () => {
      throw new Error('Delete failed');
    },
  });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  h.page.skuSelectedSpecs.value = { Size: 'L' };
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds.length, 1);
  assert.equal(h.calls.removes.length, 1);
  assert.equal(h.page.cartItems.value.length, 2);
  assert.equal(h.page.skuVisible.value, false);
  assert.equal(h.calls.toasts.includes('cart.updated'), false);
  assert.equal(h.calls.toasts.at(-1), 'cart.updateFailed');
  h.stop();
});

test('confirming the same SKU updates quantity without adding or deleting an item', async () => {
  const h = cartHarness({ items: [cartItem()] });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  h.page.skuQuantity.value = 3;
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds.length, 0);
  assert.equal(h.calls.removes.length, 0);
  assert.equal(h.calls.updates[0].quantity, 3);
  h.stop();
});

test('opening an old cart quantity and switching to a lower-limit SKU both normalize before submission', async () => {
  const h = cartHarness({
    items: [cartItem({ quantity: 8 })],
    variants: [
      variant(),
      variant({ id: 11, maxPerOrder: 1, specValues: [{ name: 'Size', value: 'L' }] }),
    ],
  });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  assert.equal(h.page.skuQuantity.value, 3);
  h.page.skuSelectedSpecs.value = { Size: 'L' };
  assert.equal(h.page.skuQuantity.value, 1);
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds[0].quantity, 1);
  assert.equal(h.calls.removes[0], 1);
  h.stop();
});

test('an unlimited product retains the existing 999-item quantity guard for both purchase actions', async () => {
  const h = await productHarness([variant({ maxPerOrder: undefined })]);
  h.page.quantity.value = 1000;
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.equal(h.calls.adds.length, 0);
  assert.equal(h.calls.navigations.length, 0);
  assert.equal(h.calls.toasts.length, 2);
  h.stop();
});

test('typing over the cap corrects the input value even when the quantity model remains at the cap', async () => {
  const h = skuHarness({ quantity: 3, maxPerOrder: 3 });
  const pending = h.page.onQuantityInput({ detail: { value: '999' } });
  assert.equal(h.page.quantityInput.value, '999');
  await pending;
  await flushInput();
  assert.equal(h.props.quantity, 3);
  assert.equal(h.page.quantityInput.value, '3');
  assert.equal(h.emitted.at(-1).value, 3);
  h.stop();
});

test('a pending input correction cannot overwrite a newer edit or an external SKU quantity update', async () => {
  const h = skuHarness({ quantity: 3, maxPerOrder: 3 });
  const old = h.page.onQuantityInput({ detail: { value: '999' } });
  const latest = h.page.onQuantityInput({ detail: { value: '2' } });
  await Promise.all([old, latest]);
  await flushInput();
  assert.equal(h.page.quantityInput.value, '2');
  assert.equal(h.emitted.length, 1);
  const pending = h.page.onQuantityInput({ detail: { value: '999' } });
  h.props.quantity = 1;
  await pending;
  await flushInput();
  assert.equal(h.page.quantityInput.value, '1');
  assert.equal(h.emitted.length, 1);
  h.stop();
});

test('stable Mock product and cart APIs expose the same SKU limits and reject merged over-limit quantities', () => {
  const runtime = { defineMock: (routes) => routes };
  const products = loadModule('../src/mock/modules/product.mock.ts', {
    '@alova/mock': runtime,
    '@faker-js/faker/locale/zh_CN': { faker },
    '@/mock/data/categories': { TOP_CATEGORIES: [{ id: 1 }], FLAT_SUB_CATEGORIES: [] },
  });
  const cart = loadModule('../src/mock/modules/cart.mock.ts', {
    '@alova/mock': runtime,
    '@faker-js/faker/locale/zh_CN': { faker },
    './product.mock': products,
  }).default;
  const readProduct = () =>
    products.default['[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/products/{id}']({
      params: { id: '1' },
    });
  assert.equal(readProduct(), readProduct());
  const demo = readProduct().productVariants;
  assert.equal(demo[0].id, 11);
  assert.equal(demo[0].maxPerOrder, 3);
  assert.equal(demo[0].maxPerUser, 5);
  assert.equal(demo[0].trackInventory, false);
  assert.equal(demo[0].stock, 0);
  assert.equal(demo[1].id, 12);
  assert.equal(demo[1].maxPerOrder, 1);
  const readCart = () => cart['[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items']();
  assert.equal(readCart()[0].productVariantId, 11);
  assert.equal(readCart()[0].productVariant.id, 11);
  assert.equal(readCart()[0].maxPerOrder, 3);
  cart['[PUT]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/{id}']({
    params: { id: '1' },
    data: { quantity: 3 },
  });
  assert.throws(
    () =>
      cart['[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items']({
        data: { productVariantId: 11, quantity: 1 },
      }),
    (error) => error.status === 400,
  );
  assert.equal(readCart()[0].quantity, 3);
  assert.throws(
    () =>
      cart['[PUT]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/{id}']({
        params: { id: '1' },
        data: { quantity: 4 },
      }),
    (error) => error.status === 400,
  );
  assert.equal(readCart()[0].quantity, 3);
});

test('a SKU add that commits before its response times out refreshes the cart and cannot be replayed from the old sheet', async () => {
  const target = variant({ id: 11, maxPerOrder: 9, specValues: [{ name: 'Size', value: 'L' }] });
  const h = cartHarness({
    items: [
      cartItem(),
      cartItem({ id: 2, productVariantId: 11, quantity: 1, productVariant: target }),
    ],
    variants: [variant(), target],
    add: async (payload, cart) => {
      cart[1].quantity += payload.quantity;
      throw new Error('Response timed out after server commit');
    },
  });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  h.page.skuSelectedSpecs.value = { Size: 'L' };
  await h.page.confirmSkuChange();
  assert.equal(h.page.skuVisible.value, false);
  assert.equal(h.page.cartRefreshRequired.value, false);
  assert.equal(h.page.cartItems.value.find((item) => item.id === 2).quantity, 3);
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds.length, 1);
  assert.equal(h.calls.removes.length, 0);
  assert.equal(h.cart[1].quantity, 3);
  h.stop();
});

test('a failed refresh after an uncertain SKU add locks quantity, SKU and checkout actions until a successful read', async () => {
  let offline = true;
  const target = variant({ id: 11, maxPerOrder: 9, specValues: [{ name: 'Size', value: 'L' }] });
  const h = cartHarness({
    items: [cartItem()],
    variants: [variant(), target],
    add: async (payload, cart) => {
      cart.push(
        cartItem({
          id: 2,
          productVariantId: 11,
          productVariant: target,
          quantity: payload.quantity,
        }),
      );
      throw new Error('Response timed out after server commit');
    },
    getCart: async (cart) => {
      if (offline) {
        throw new Error('Offline');
      }
      return structuredClone(cart);
    },
  });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  h.page.skuSelectedSpecs.value = { Size: 'L' };
  await h.page.confirmSkuChange();
  assert.equal(h.page.skuVisible.value, false);
  assert.equal(h.page.cartRefreshRequired.value, true);
  await h.page.changeQuantity(h.page.cartItems.value[0], 1);
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  await h.page.confirmSkuChange();
  h.page.goToCheckout();
  assert.equal(h.page.skuVisible.value, false);
  assert.equal(h.calls.adds.length, 1);
  assert.equal(h.calls.removes.length, 0);
  assert.equal(h.calls.updates.length, 0);
  assert.equal(h.calls.navigations.length, 0);
  offline = false;
  assert.equal(await h.page.loadCart(), true);
  assert.equal(h.page.cartRefreshRequired.value, false);
  assert.equal(h.page.cartItems.value.length, 2);
  await h.page.changeQuantity(h.page.cartItems.value[0], 1);
  assert.equal(h.calls.updates.length, 1);
  h.page.goToCheckout();
  assert.equal(h.calls.navigations.length, 1);
  assert.equal(h.calls.adds.length, 1);
  h.stop();
});

for (const fromSku of [false, true]) {
  test(`a complete cart response that omits removed limits clears stale metadata after ${fromSku ? 'SKU confirmation' : 'row update'}`, async () => {
    const original = cartItem({ maxPerOrder: 3, maxPerUser: 5 });
    const h = cartHarness({
      items: [original],
      update: async (id, value, cart) => {
        const fresh = {
          ...cart[0],
          quantity: value,
          productVariant: { ...cart[0].productVariant },
        };
        delete fresh.maxPerOrder;
        delete fresh.maxPerUser;
        delete fresh.productVariant.maxPerOrder;
        delete fresh.productVariant.maxPerUser;
        cart[0] = fresh;
        return structuredClone(fresh);
      },
    });
    if (fromSku) {
      await h.page.openSkuSelector(h.page.cartItems.value[0]);
      h.page.skuQuantity.value = 3;
      await h.page.confirmSkuChange();
    } else {
      await h.page.changeQuantity(h.page.cartItems.value[0], 1);
    }
    const item = h.page.cartItems.value[0];
    assert.equal(item.maxPerOrder, undefined);
    assert.equal(item.maxPerUser, undefined);
    assert.equal(item.productVariant.maxPerOrder, undefined);
    assert.equal(item.productVariant.maxPerUser, undefined);
    await h.page.changeQuantity(item, 1);
    assert.equal(h.calls.updates.at(-1).quantity, 4);
    h.stop();
  });
}

test('per-order limits do not hide an in-stock inquiry SKU from mixed-product spec selection', async () => {
  const inquiry = variant({
    id: 11,
    pricingType: 'INQUIRY',
    maxPerOrder: 0,
    specValues: [{ name: 'Size', value: 'L' }],
  });
  const h = await productHarness([variant({ pricingType: 'FIXED' }), inquiry]);
  assert.equal(h.page.isVariantAvailable(inquiry), true);
  assert.equal(h.page.disabledSpecValues.value.Size.has('L'), false);
  h.page.selectedSpecs.value = { Size: 'L' };
  assert.equal(h.page.selectedVariant.value.id, 11);
  assert.equal(h.page.quantityLimit.value, 0);
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.equal(h.calls.adds.length, 0);
  assert.equal(h.calls.navigations.length, 0);
  h.stop();
});

// Real product 11 has two diagonal combinations, rather than every storage/color pair.
const sparseProduct = () => ({
  id: 11,
  title: 'Nova X1 5G 智能手机',
  specDefinition: [
    {
      id: 'storage',
      name: '存储',
      usedForSku: true,
      values: [{ value: '12GB+256GB' }, { value: '12GB+512GB' }],
    },
    {
      id: 'color',
      name: '颜色',
      usedForSku: true,
      values: [{ value: '曜夜黑' }, { value: '冰川蓝' }],
    },
  ],
  productVariants: [
    {
      id: 38,
      productId: 11,
      status: 'PUBLISHED',
      price: 3299,
      trackInventory: true,
      stock: 40,
      specValues: [
        { specId: 'storage', name: '存储', value: '12GB+256GB' },
        { specId: 'color', name: '颜色', value: '曜夜黑' },
      ],
    },
    {
      id: 39,
      productId: 11,
      status: 'PUBLISHED',
      price: 3799,
      trackInventory: true,
      stock: 36,
      specValues: [
        { specId: 'storage', name: '存储', value: '12GB+512GB' },
        { specId: 'color', name: '颜色', value: '冰川蓝' },
      ],
    },
  ],
});

test('a missing cart spec combination cannot report success or silently keep the first SKU', async () => {
  const data = sparseProduct();
  const h = cartHarness({
    productData: data,
    variants: data.productVariants,
    items: [
      {
        id: 23,
        productVariantId: 38,
        quantity: 7,
        product: { id: 11 },
        productVariant: data.productVariants[0],
      },
    ],
  });
  await h.page.openSkuSelector(h.page.cartItems.value[0]);
  const selector = skuHarness({
    specDefinition: data.specDefinition,
    selectedSpecs: h.page.skuSelectedSpecs.value,
  });
  selector.page.selectSpec('颜色', '冰川蓝');
  h.page.skuSelectedSpecs.value = selector.emitted.at(-1).value;
  selector.props.selectedSpecs = h.page.skuSelectedSpecs.value;
  assert.equal(h.page.skuSelectedVariant.value, null);
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds.length, 0);
  assert.equal(h.calls.updates.length, 0);
  assert.equal(h.calls.removes.length, 0);
  assert.equal(h.calls.toasts.includes('cart.updated'), false);
  assert.equal(h.calls.toasts.at(-1), 'sku.unavailable');
  assert.equal(h.page.skuVisible.value, true);
  assert.equal(h.page.skuQuantity.value, 7);

  // A further ordinary selection must reach the other real variant without losing quantity.
  selector.page.selectSpec('存储', '12GB+512GB');
  h.page.skuSelectedSpecs.value = selector.emitted.at(-1).value;
  assert.equal(h.page.skuSelectedVariant.value.id, 39);
  await h.page.confirmSkuChange();
  assert.equal(h.calls.adds.length, 1);
  assert.equal(h.calls.adds[0].productVariantId, 39);
  assert.equal(h.calls.adds[0].quantity, 7);
  assert.deepEqual(h.calls.removes, [23]);
  assert.equal(h.calls.updates.length, 0);
  assert.equal(h.page.cartItems.value.length, 1);
  assert.equal(h.page.cartItems.value[0].productVariantId, 39);
  assert.equal(h.page.cartItems.value[0].quantity, 7);
  assert.equal(h.calls.toasts.at(-1), 'cart.updated');
  selector.stop();
  h.stop();
});

test('product purchase actions reject a missing combination instead of buying the first SKU', async () => {
  const data = sparseProduct();
  const h = await productHarness(data.productVariants, data);
  h.page.selectedSpecs.value = { 存储: '12GB+256GB', 颜色: '冰川蓝' };
  assert.equal(h.page.selectedVariant.value, null);
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.equal(h.calls.adds.length, 0);
  assert.equal(h.calls.navigations.length, 0);
  assert.equal(h.calls.toasts.length, 2);
  h.stop();
});

test('clearing an already-selected product spec unlocks another diagonal SKU without automatic matching', async () => {
  const data = sparseProduct();
  const h = await productHarness(data.productVariants, data);
  const selector = skuHarness({
    specDefinition: data.specDefinition,
    selectedSpecs: h.page.selectedSpecs.value,
    disabledSpecValues: h.page.disabledSpecValues.value,
  });
  const select = (name, value) => {
    selector.page.selectSpec(name, value);
    h.page.selectedSpecs.value = selector.emitted.at(-1).value;
    selector.props.selectedSpecs = h.page.selectedSpecs.value;
    selector.props.disabledSpecValues = h.page.disabledSpecValues.value;
  };
  assert.equal(h.page.selectedVariant.value.id, 38);
  assert.equal(h.page.disabledSpecValues.value.颜色.has('冰川蓝'), true);
  assert.equal(h.page.disabledSpecValues.value.存储.has('12GB+512GB'), true);
  select('存储', '12GB+256GB');
  assert.equal(Object.keys(h.page.selectedSpecs.value).length, 0);
  assert.equal(h.page.selectedVariant.value, null);
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.equal(h.calls.adds.length, 0);
  assert.equal(h.calls.navigations.length, 0);
  select('颜色', '冰川蓝');
  assert.equal(h.page.selectedVariant.value, null);
  assert.equal(h.page.disabledSpecValues.value.存储.has('12GB+256GB'), true);
  assert.equal(h.page.disabledSpecValues.value.存储.has('12GB+512GB'), false);
  select('存储', '12GB+512GB');
  assert.equal(h.page.selectedVariant.value.id, 39);
  h.page.quantity.value = 7;
  await h.page.handleAddToCart();
  h.page.handleBuyNow();
  assert.deepEqual(h.calls.adds, [[39, 7]]);
  assert.equal(h.calls.navigations[0], '/subpkg-trade/confirm/index?variantId=39&quantity=7');
  selector.stop();
  h.stop();
});

test('clicking an already-selected single spec clears the selection too', () => {
  const h = skuHarness({ selectedSpecs: { Size: 'S' } });
  h.page.selectSpec('Size', 'S');
  assert.equal(h.emitted.at(-1).name, 'update:selectedSpecs');
  assert.equal(Object.keys(h.emitted.at(-1).value).length, 0);
  h.stop();
});
