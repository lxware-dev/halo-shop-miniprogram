import assert from 'node:assert/strict';
// This suite uses the built-in Node runner without adding a test framework dependency.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test';
import {
  findShippingLabel,
  getFulfillmentStatusKey,
  getShippingLabelStatusKey,
  getShippingRecords,
  getTrackingUrl,
  loadShippingRecords,
} from '../src/helpers/fulfillment.ts';

const firstItems = [
  { orderItem: { productVariantId: 1, itemTitle: 'A', quantity: 5 }, quantity: 2 },
];
const secondItems = [
  { orderItem: { productVariantId: 2, itemTitle: 'B', quantity: 3 }, quantity: 1 },
];
const firstLabels = [
  { carrier: 'Carrier A', trackingNumber: 'A-1', status: 'SHIPPED' },
  { carrier: 'Carrier B', trackingNumber: 'A-2', status: 'PENDING' },
];
const secondLabels = [{ carrier: 'Carrier C', trackingNumber: 'B-1', status: 'DELIVERED' }];

const fulfillments = [
  {
    type: 'VIRTUAL',
    items: [{ instructions: 'private instructions' }],
    labels: [{ trackingNumber: 'VIRTUAL' }],
  },
  { type: 'SHIPPING', status: 'SHIPPED', items: firstItems, labels: firstLabels },
  { type: 'PICKUP', labels: [{ trackingNumber: 'PICKUP' }] },
  { type: 'LOCAL_DELIVERY', labels: [{ trackingNumber: 'LOCAL' }] },
  { type: 'SHIPPING', status: 'COMPLETED', items: secondItems, labels: secondLabels },
];

test('keeps multiple shipping fulfillments and all labels without inventing item-to-label bindings', () => {
  const records = getShippingRecords(fulfillments);
  assert.equal(records.length, 2);
  assert.strictEqual(records[0].items, firstItems);
  assert.strictEqual(records[0].labels, firstLabels);
  assert.strictEqual(records[1].items, secondItems);
  assert.strictEqual(records[1].labels, secondLabels);
  assert.equal(records[0].items[0].quantity, 2);
  assert.equal(records[1].items[0].quantity, 1);
  assert.equal(records[0].labels.length, 2);
  assert.equal('items' in records[0].labels[0], false);
  assert.notEqual(records[0].key, records[1].key);
});

test('finds a valid shipping label after virtual fulfillments and empty labels', () => {
  assert.strictEqual(findShippingLabel(fulfillments), firstLabels[0]);
  assert.deepEqual(
    findShippingLabel([
      { type: 'SHIPPING', labels: [{}, { carrier: ' ', trackingNumber: ' ' }] },
      { type: 'SHIPPING', labels: [{ trackingNumber: 'REAL' }] },
    ]),
    { trackingNumber: 'REAL' },
  );
  assert.equal(
    findShippingLabel([{ type: 'VIRTUAL', labels: [{ trackingNumber: 'VIRTUAL' }] }]),
    undefined,
  );
});

test('shows every server fulfillment status independently from label delivery status', () => {
  for (const status of [
    'PENDING',
    'READY',
    'PROCESSING',
    'SHIPPED',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
  ]) {
    assert.equal(
      getFulfillmentStatusKey(status),
      `logistics.fulfillmentStatus.${status.toLowerCase()}`,
    );
  }
  for (const status of ['PENDING', 'SHIPPED', 'DELIVERED', 'CANCELED']) {
    assert.equal(
      getShippingLabelStatusKey(status),
      `logistics.labelStatus.${status.toLowerCase()}`,
    );
  }
  assert.equal(getFulfillmentStatusKey('FULFILLED'), 'logistics.unknown');
  assert.equal(getShippingLabelStatusKey(undefined), 'logistics.unknown');
  assert.equal(getShippingLabelStatusKey('FUTURE_STATUS'), 'logistics.unknown');
  const [record] = getShippingRecords([
    { type: 'SHIPPING', status: 'COMPLETED', labels: [{ status: 'SHIPPED' }] },
  ]);
  assert.equal(record.statusKey, 'logistics.fulfillmentStatus.completed');
  assert.equal(record.labels[0].status, 'SHIPPED');
});

test('keeps pending shipping records and handles empty or absent data', () => {
  assert.deepEqual(getShippingRecords(null), []);
  assert.deepEqual(getShippingRecords([]), []);
  assert.deepEqual(getShippingRecords([{ type: 'VIRTUAL' }]), []);
  const [record] = getShippingRecords([{ type: 'SHIPPING', status: 'PENDING' }]);
  assert.equal(record.statusKey, 'logistics.fulfillmentStatus.pending');
  assert.deepEqual(record.items, []);
  assert.deepEqual(record.labels, []);
  assert.equal(record.completedAt, undefined);
});

test('allows only HTTP tracking links for the existing link handler', () => {
  assert.equal(
    getTrackingUrl({ trackingUrl: ' https://carrier.example/track?a=1 ' }),
    'https://carrier.example/track?a=1',
  );
  for (const trackingUrl of [
    '',
    'javascript:alert(1)',
    '/subpkg-mine/index',
    'tel:123',
    'https://carrier.example/has space',
  ]) {
    assert.equal(getTrackingUrl({ trackingUrl }), undefined);
  }
});

test('requests the selected order and propagates failure for the page retry state', async () => {
  const calls = [];
  const records = await loadShippingRecords('ORDER-1', async (code) => {
    calls.push(code);
    return fulfillments;
  });
  assert.deepEqual(calls, ['ORDER-1']);
  assert.equal(records.length, 2);
  const requestError = new Error('Unavailable');
  await assert.rejects(
    loadShippingRecords('ORDER-1', async () => {
      throw requestError;
    }),
    requestError,
  );
  await assert.rejects(
    loadShippingRecords(' ', async () => {
      assert.fail('Missing order must not be requested');
    }),
    { message: 'Order code is required' },
  );
});
