import assert from 'node:assert/strict';
import process from 'node:process';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { '@': `${process.cwd()}/src` } },
});

try {
  const { validHttpsResourceUrl } = await vite.ssrLoadModule('/src/helpers/resource-url.ts');
  assert.equal(
    validHttpsResourceUrl('https://example.com/file.pdf'),
    'https://example.com/file.pdf',
  );
  assert.equal(validHttpsResourceUrl('http://example.com'), '');
  assert.equal(validHttpsResourceUrl('https://user@example.com'), '');

  const [{ default: product }, { default: cart }, { default: checkout }, { default: order }] =
    await Promise.all(
      ['product', 'cart', 'checkout', 'order'].map((module) =>
        vite.ssrLoadModule(`/src/mock/modules/${module}.mock.ts`),
      ),
    );

  const call = (mock, route, input = {}) => mock.data[route](input);
  const list = call(product, '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/products', {
    query: { page: 1, size: 10 },
  });
  assert.equal(list.items[0].productType, 'VIRTUAL');

  const detail = call(product, '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/products/{id}', {
    params: { id: '901' },
  });
  assert.equal(detail.productVariants[0].shippingRequired, false);

  const prepareRoute = '[POST]/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/prepare';
  const submitRoute = '[POST]/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/submit';
  const context = call(checkout, prepareRoute, {
    data: { source: 'BUY_NOW', items: [{ productVariantId: 9011, quantity: 2 }] },
  });
  assert.equal(context.isShippingRequired, false);
  assert.equal(context.calculateResult.shippingFeeAmount, 0);
  assert.equal(context.calculateResult.payableAmount, 118);

  const { order: created } = call(checkout, submitRoute, {
    data: { source: 'BUY_NOW', items: [{ productVariantId: 9011, quantity: 2 }] },
  });
  const detailRoute = '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}';
  const fulfillmentRoute =
    '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/fulfillments';
  assert.equal(
    call(order, detailRoute, { params: { orderCode: created.orderCode } }).paymentStatus,
    'PENDING',
  );
  assert.deepEqual(call(order, fulfillmentRoute, { params: { orderCode: created.orderCode } }), []);

  const session = call(
    order,
    '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/initiate-payment',
    { params: { orderCode: created.orderCode } },
  );
  const statusRoute =
    '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/payment-sessions/{sessionCode}/status';
  assert.equal(
    call(order, statusRoute, { params: { sessionCode: session.sessionCode } }),
    'PENDING',
  );
  assert.equal(
    call(order, statusRoute, { params: { sessionCode: session.sessionCode } }),
    'SUCCESS',
  );

  const paidOrder = call(order, detailRoute, { params: { orderCode: created.orderCode } });
  assert.equal(paidOrder.paymentStatus, 'PAID');
  assert.equal(paidOrder.shippingAddress, undefined);
  const [fulfillment] = call(order, fulfillmentRoute, { params: { orderCode: created.orderCode } });
  assert.equal(fulfillment.type, 'VIRTUAL');
  assert.equal(fulfillment.status, 'COMPLETED');
  assert.equal(fulfillment.items[0].cdks.length, 2);
  assert.equal(fulfillment.items[0].digitalResources[0].resourceType, 'STATIC_URL');

  const cartItem = call(cart, '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items', {
    data: { productVariantId: 9011, quantity: 1 },
  });
  const cartContext = call(checkout, prepareRoute, {
    data: { source: 'CART', items: [{ cartItemId: cartItem.id, quantity: 1 }] },
  });
  assert.equal(cartContext.isShippingRequired, false);
  assert.equal(cartContext.items[0].productVariant.id, 9011);

  console.log('Virtual Mock purchase flow passed.');
} finally {
  await vite.close();
}
