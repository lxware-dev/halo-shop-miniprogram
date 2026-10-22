/* eslint-disable test/no-import-node-test -- Tests use the built-in Node runner without extra dependencies. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const module = { exports: {} };
runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/config/login-methods.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText,
  { module, exports: module.exports, Set },
);
const normalize = (input) =>
  JSON.parse(JSON.stringify(module.exports.normalizeLoginMethods(input)));

test('configured supported login methods retain their priority without duplicates', () => {
  assert.deepEqual(
    normalize({ primary: 'phoneQuick', supported: ['haloAccount', 'phoneQuick', 'haloAccount'] }),
    {
      primary: 'phoneQuick',
      supported: ['haloAccount'],
    },
  );
  assert.deepEqual(normalize({ primary: 'haloAccount', supported: ['phoneQuick'] }), {
    primary: 'haloAccount',
    supported: ['phoneQuick'],
  });
});

test('legacy unsupported routes are removed and a configured working method is retained', () => {
  assert.deepEqual(
    normalize({ primary: 'phoneCode', supported: ['email', 'haloAccount', 'phoneQuick'] }),
    {
      primary: 'haloAccount',
      supported: ['phoneQuick'],
    },
  );
});

test('invalid configuration safely offers account login without opting into phone registration', () => {
  for (const value of [
    undefined,
    null,
    [],
    123,
    {},
    { primary: 'email', supported: ['phoneCode'] },
    { supported: 'phoneQuick' },
  ]) {
    assert.deepEqual(normalize(value), { primary: 'haloAccount', supported: [] });
  }
});
