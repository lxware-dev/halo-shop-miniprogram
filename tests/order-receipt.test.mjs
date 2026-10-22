import assert from 'node:assert/strict';
// Keep the existing Node runner without adding a test framework dependency.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test';
import { canConfirmOrderReceipt, getOrderReceiptTimes } from '../src/helpers/order-receipt.ts';

const fulfilledOrder = {
  status: 'OPEN',
  paymentStatus: 'PAID',
  fulfillmentStatus: 'FULFILLED',
  fulfilledAt: '2026-10-01T08:30:00Z',
  autoConfirmAt: '2026-10-20T10:15:00Z',
};

test('uses the server deadline without calculating a period from fulfillment', () => {
  assert.equal(canConfirmOrderReceipt(fulfilledOrder, true), true);
  assert.deepEqual(getOrderReceiptTimes(fulfilledOrder, true), {
    autoConfirmAt: fulfilledOrder.autoConfirmAt,
  });
  const legacyOrder = { ...fulfilledOrder, autoConfirmAt: undefined };
  assert.deepEqual(getOrderReceiptTimes(legacyOrder, true), {});
  assert.equal(canConfirmOrderReceipt(legacyOrder, true), true);
});

test('only paid, fully fulfilled, open physical orders can confirm receipt', () => {
  for (const status of ['ARCHIVED', 'CANCELLED', undefined]) {
    const order = { ...fulfilledOrder, status };
    assert.equal(canConfirmOrderReceipt(order, true), false);
    assert.deepEqual(getOrderReceiptTimes(order, true), {});
  }
  for (const paymentStatus of [
    'PENDING',
    'AUTHORIZING',
    'REFUNDED',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
    undefined,
  ]) {
    const order = { ...fulfilledOrder, paymentStatus };
    assert.equal(canConfirmOrderReceipt(order, true), false);
    assert.deepEqual(getOrderReceiptTimes(order, true), {});
  }
  for (const fulfillmentStatus of ['PENDING', 'PROCESSING', undefined]) {
    const order = { ...fulfilledOrder, fulfillmentStatus };
    assert.equal(canConfirmOrderReceipt(order, true), false);
    assert.deepEqual(getOrderReceiptTimes(order, true), {});
  }
  assert.equal(canConfirmOrderReceipt(fulfilledOrder, false), false);
  assert.deepEqual(getOrderReceiptTimes(fulfilledOrder, false), {});
  assert.equal(canConfirmOrderReceipt(null, true), false);
  assert.deepEqual(getOrderReceiptTimes(undefined, true), {});
});

test('replaces the deadline with the returned receipt confirmation after refresh', () => {
  const confirmedOrder = {
    ...fulfilledOrder,
    status: 'ARCHIVED',
    confirmAt: '2026-10-19T09:10:11Z',
  };
  assert.deepEqual(getOrderReceiptTimes(fulfilledOrder, true), {
    autoConfirmAt: fulfilledOrder.autoConfirmAt,
  });
  assert.deepEqual(getOrderReceiptTimes(confirmedOrder, true), {
    confirmAt: confirmedOrder.confirmAt,
  });
  assert.equal(canConfirmOrderReceipt(confirmedOrder, true), false);
  assert.deepEqual(getOrderReceiptTimes({ ...confirmedOrder, paymentStatus: 'REFUNDED' }, true), {
    confirmAt: confirmedOrder.confirmAt,
  });
  assert.deepEqual(getOrderReceiptTimes(confirmedOrder, false), {});
});

test('does not treat an elapsed deadline or fulfilled timestamp as actual confirmation', () => {
  const order = { ...fulfilledOrder, autoConfirmAt: '2000-01-01T00:00:00Z' };
  assert.deepEqual(getOrderReceiptTimes(order, true), {
    autoConfirmAt: '2000-01-01T00:00:00Z',
  });
  assert.equal(canConfirmOrderReceipt(order, true), true);
  assert.equal(order.status, 'OPEN');
  assert.equal(order.confirmAt, undefined);
  assert.deepEqual(getOrderReceiptTimes({ ...fulfilledOrder, autoConfirmAt: undefined }, true), {});
});

test('hides missing, incomplete, malformed or impossible server dates', () => {
  for (const date of [
    undefined,
    '',
    ' ',
    'invalid',
    '2026-10-20',
    '2026-10-20T10:15:00',
    '2026-02-29T00:00:00Z',
    '2024-02-30T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-10-20T24:00:00Z',
    '2026-10-20T10:60:00Z',
  ]) {
    assert.deepEqual(getOrderReceiptTimes({ ...fulfilledOrder, autoConfirmAt: date }, true), {});
    assert.deepEqual(getOrderReceiptTimes({ status: 'ARCHIVED', confirmAt: date }, true), {});
  }
});

test('preserves valid leap dates, timezone offsets and server timestamp precision', () => {
  for (const date of [
    '2024-02-29T23:59:59Z',
    '2026-12-31T23:59:59+08:00',
    '2026-10-20T10:15:00.123456789Z',
  ]) {
    assert.deepEqual(getOrderReceiptTimes({ ...fulfilledOrder, autoConfirmAt: date }, true), {
      autoConfirmAt: date,
    });
    assert.deepEqual(getOrderReceiptTimes({ status: 'ARCHIVED', confirmAt: date }, true), {
      confirmAt: date,
    });
  }
});
