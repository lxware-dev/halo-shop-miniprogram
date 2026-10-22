import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

const require = createRequire(import.meta.url);
function loadTs(path, dependencies = {}) {
  const module = { exports: {} };
  const input = readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll(
    'import.meta.env',
    '({ VITE_MOCK_ENABLED: "false" })',
  );
  const source = ts.transpileModule(input, {
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

test('empty claim success and missing claim endpoint are distinguished by the real response handler', async () => {
  const toasts = [];
  const { alovaInst } = loadTs('../src/utils/request.ts', {
    alova: { createAlova: (config) => config },
    '@alova/adapter-uniapp': {
      default: () => ({ requestAdapter: () => {}, statesHook: {} }),
      uniappMockResponse: () => {},
    },
    '@alova/mock': { createAlovaMockAdapter: () => {} },
    '@/config': {
      useAppConfig: () => ({ halo: { baseURL: 'https://example.test', timeout: 1000 } }),
    },
    '@/store': { useUserStore: () => ({}) },
    '@/utils/date': { isTimeExpired: () => false },
    '@/utils/error': { showErrorToast: (value) => toasts.push(value) },
    '@/services/session': {},
    '@/mock/index': { default: {} },
    '@/locales': { translate: (value) => value },
    '@/helpers/checkout': { CheckoutAccountChangedError: Error },
  });
  const { couponApi } = loadTs('../src/api/modules/coupon.ts', {
    '@/utils/request': { alovaInst: { Post: (_path, _data, config) => config } },
  });
  const method = couponApi.claim(1);
  assert.equal(await alovaInst.responded.onSuccess({ statusCode: 204 }, method), undefined);
  const problem = { status: 404, title: 'Not Found' };
  await assert.rejects(
    alovaInst.responded.onSuccess({ statusCode: 404, data: problem }, method),
    (error) => error.status === 404,
  );
  assert.equal(
    await alovaInst.responded.onSuccess({ statusCode: 404, data: problem }, { config: {} }),
    undefined,
  );
  assert.equal(toasts.length, 0);
});

function claimHarness(send) {
  const { useCoupons } = loadTs('../src/composables/useCoupons.ts', {
    vue,
    '@/api/modules/coupon': {
      couponApi: {
        claim: (id) => ({ operation: 'claim', id }),
        listMine: () => ({ operation: 'mine' }),
        listClaimable: () => ({ operation: 'claimable' }),
      },
    },
    '@/hooks/useRequest': { sendRequest: send },
  });
  return useCoupons();
}

test('a successful coupon claim accepts an empty response and refreshes the wallet', async () => {
  const calls = [];
  const state = claimHarness(async (request) => {
    calls.push(request.operation);
    if (request.operation === 'claim') {
      return undefined;
    }
    return request.operation === 'mine' ? [{ id: 1, status: 'AVAILABLE' }] : [];
  });
  assert.equal(await state.claim(10), true);
  assert.deepEqual(calls, ['claim', 'mine', 'claimable']);
  assert.equal(state.mine.value[0].id, 1);
  assert.equal(state.failed.value, false);
  assert.equal(state.claimingId.value, null);
});

test('a wallet refresh failure does not change a successful claim into a failed claim', async () => {
  const state = claimHarness(async (request) => {
    if (request.operation !== 'claim') {
      throw new Error('Wallet temporarily unavailable');
    }
  });
  assert.equal(await state.claim(10), true);
  assert.equal(state.failed.value, true);
  assert.equal(state.loading.value, false);
  assert.equal(state.claimingId.value, null);
});

test('duplicate claim taps remain blocked until the first claim and wallet refresh finish', async () => {
  let release;
  let claims = 0;
  const state = claimHarness(async (request) => {
    if (request.operation === 'claim') {
      claims += 1;
      await new Promise((resolve) => {
        release = resolve;
      });
      return undefined;
    }
    return [];
  });
  const first = state.claim(10);
  assert.equal(await state.claim(10), false);
  assert.equal(await state.claim(11), false);
  assert.equal(claims, 1);
  release();
  assert.equal(await first, true);
});

test('claim errors leave the wallet untouched and allow a later retry', async () => {
  const state = claimHarness(async () => {
    throw Object.assign(new Error('已达到领取次数上限'), { status: 400 });
  });
  assert.equal(await state.claim(10), false);
  assert.equal(state.claimingId.value, null);
  assert.equal(state.mine.value.length, 0);
});

test('the claim mock returns the native empty success response and an HTTP 400 for a duplicate', () => {
  const helper = loadTs('../src/helpers/coupon.ts');
  const mock = loadTs('../src/mock/modules/coupon.mock.ts', {
    '@alova/mock': { defineMock: (routes) => routes },
    '@/helpers/coupon': helper,
  });
  const claim = mock.default['[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/coupons/{id}/claim'];
  const originalSize = mock.mockWallet.length;
  const success = claim({ params: { id: '10' } });
  assert.equal(success.status, 204);
  assert.equal(success.body, '');
  assert.equal(mock.mockWallet.length, originalSize + 1);
  const duplicate = claim({ params: { id: '10' } });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.status, 400);
  assert.equal(mock.mockWallet.length, originalSize + 1);
});
