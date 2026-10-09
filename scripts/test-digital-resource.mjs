import assert from 'node:assert/strict';
import process from 'node:process';
import { createServer } from 'vite';
import { initPreContext, preJs } from '@dcloudio/uni-cli-shared';

const dependencyId = 'virtual:digital-resource-test-dependencies';
const resolvedDependencyId = `\0${dependencyId}`;
const previousUni = globalThis.uni;
const state = { credential: 'Bearer initial', refreshes: 0 };
globalThis.__digitalResourceTestState = state;
let calls = [];
let downloadResponses = [];
let failingApi;

function invoke(api, options) {
  calls.push({ api, ...options });
  if (failingApi === api) {
    options.fail(new Error(`${api} failed`));
  } else {
    options.success();
  }
}

globalThis.uni = {
  downloadFile(options) {
    calls.push({ api: 'downloadFile', ...options });
    if (failingApi === 'downloadFile') {
      options.fail(new Error('downloadFile failed'));
      return;
    }
    options.success(
      downloadResponses.shift() ?? { statusCode: 200, tempFilePath: '/tmp/digital-resource' },
    );
  },
  navigateTo: (options) => invoke('navigateTo', options),
  openDocument: (options) => invoke('openDocument', options),
  previewImage: (options) => invoke('previewImage', options),
  shareFileMessage: (options) => invoke('shareFileMessage', options),
};

initPreContext('mp-weixin');
const vite = await createServer({
  configFile: false,
  define: { 'import.meta.env.VITE_MOCK_ENABLED': JSON.stringify('false') },
  server: { middlewareMode: true },
  resolve: {
    alias: [
      ...['@/config', '@/services/session', '@/store'].map((find) => ({
        find,
        replacement: dependencyId,
      })),
      { find: '@', replacement: `${process.cwd()}/src` },
    ],
  },
  plugins: [
    {
      name: 'digital-resource-test-dependencies',
      resolveId(id) {
        return id === dependencyId ? resolvedDependencyId : undefined;
      },
      load(id) {
        if (id === resolvedDependencyId) {
          return `
            export function useAppConfig() { return { halo: { baseURL: 'https://halo.example.com/' } }; }
            export function useUserStore() { return globalThis.__digitalResourceTestState; }
            export async function ensureSessionInitialized() {}
            export async function refreshSession() {
              globalThis.__digitalResourceTestState.refreshes++;
              globalThis.__digitalResourceTestState.credential = 'Bearer refreshed';
            }
          `;
        }
      },
      transform(code, id) {
        if (id.endsWith('/src/helpers/digital-resource.ts')) {
          return preJs(code, id);
        }
      },
    },
  ],
});

try {
  const { openPurchasedDigitalResource } = await vite.ssrLoadModule(
    '/src/helpers/digital-resource.ts',
  );
  const staticResource = (resourceUrl, resourceName = 'Resource') => ({
    resourceType: 'STATIC_URL',
    resourceUrl,
    resourceName,
  });
  const calledApis = () => calls.map((call) => call.api);
  async function open(resource, options = {}) {
    calls = [];
    downloadResponses = [...(options.responses ?? [])];
    failingApi = options.failingApi;
    state.credential = 'Bearer initial';
    state.refreshes = 0;
    await openPurchasedDigitalResource(resource);
  }

  await open(staticResource('https://files.example.com/templates.zip', 'Template kit'));
  assert.deepEqual(calledApis(), ['downloadFile', 'shareFileMessage']);
  assert.equal(calls[1].fileName, 'templates.zip');
  assert.equal(calls[0].header, undefined);

  await open(staticResource('https://files.example.com/manual.PDF', 'Manual v1.0'));
  assert.deepEqual(calledApis(), ['downloadFile', 'openDocument']);
  assert.equal(calls[1].fileType, 'pdf');

  await open(staticResource('https://files.example.com/manual.pdf', 'Incorrect name.zip'));
  assert.deepEqual(calledApis(), ['downloadFile', 'openDocument']);
  assert.equal(calls[1].fileType, 'pdf');

  await open(staticResource('https://files.example.com/template%20kit%2Ezip?token=a.pdf#part'));
  assert.deepEqual(calledApis(), ['downloadFile', 'shareFileMessage']);
  assert.equal(calls[1].fileName, 'template kit.zip');

  await open(staticResource('https://files.example.com/download?id=1', 'templates.zip'));
  assert.deepEqual(calledApis(), ['downloadFile', 'shareFileMessage']);
  assert.equal(calls[1].fileName, 'templates.zip');

  await open(staticResource('https://files.example.com/photo.png?token=file.zip'));
  assert.deepEqual(calledApis(), ['downloadFile', 'previewImage']);

  for (const url of [
    'https://example.com',
    'https://example.com/?next=manual.pdf',
    'https://example.com/resources',
    'https://example.com/manual.html',
    'https://example.com/manual.php',
  ]) {
    await open(staticResource(url, 'Manual v1.0'));
    assert.deepEqual(calledApis(), ['navigateTo']);
    assert.ok(calls[0].url.includes(`resourceUrl=${encodeURIComponent(url)}`));
  }

  await assert.rejects(() => open(staticResource('http://example.com/templates.zip')));
  assert.deepEqual(calledApis(), []);

  await assert.rejects(() =>
    open(staticResource('https://files.example.com/templates.zip'), {
      responses: [{ statusCode: 404, tempFilePath: '/tmp/error-page' }],
    }),
  );
  assert.deepEqual(calledApis(), ['downloadFile']);

  await assert.rejects(() =>
    open(staticResource('https://files.example.com/templates.zip'), {
      failingApi: 'shareFileMessage',
    }),
  );
  assert.deepEqual(calledApis(), ['downloadFile', 'shareFileMessage']);

  await open(
    { resourceType: 'ATTACHMENT', publicId: 'resource/id', resourceName: 'templates.zip' },
    {
      responses: [
        { statusCode: 401, tempFilePath: '/tmp/unauthorized' },
        { statusCode: 200, tempFilePath: '/tmp/digital-resource' },
      ],
    },
  );
  assert.deepEqual(calledApis(), ['downloadFile', 'downloadFile', 'shareFileMessage']);
  assert.equal(calls[0].header.Authorization, 'Bearer initial');
  assert.equal(calls[1].header.Authorization, 'Bearer refreshed');
  assert.equal(calls[1].header['X-Sales-Channel'], 'MINI_PROGRAM');
  assert.ok(calls[0].url.endsWith('/digital-resources/resource%2Fid/download'));
  assert.equal(calls[2].fileName, 'templates.zip');
  assert.equal(state.refreshes, 1);

  console.log('Digital resource opening regressions passed.');
} finally {
  await vite.close();
  globalThis.uni = previousUni;
  delete globalThis.__digitalResourceTestState;
}
