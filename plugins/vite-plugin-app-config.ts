import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { Plugin } from 'vite';

const VIRTUAL_MODULE_ID = 'virtual:app-config';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[typeof key];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[typeof key];
    }
  }
  return result;
}

export interface AppConfigPluginOptions {
  baseConfig?: string;
  localConfig?: string;
}

export default function appConfigPlugin(options: AppConfigPluginOptions = {}): Plugin {
  const {
    baseConfig = 'src/config/app.config.json',
    localConfig = 'src/config/app.config.local.json',
  } = options;

  return {
    name: 'vite-plugin-app-config',
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return;
      }

      const baseConfigPath = resolve(process.cwd(), baseConfig);
      const localConfigPath = resolve(process.cwd(), localConfig);

      const base = JSON.parse(readFileSync(baseConfigPath, 'utf-8'));
      const local = existsSync(localConfigPath)
        ? JSON.parse(readFileSync(localConfigPath, 'utf-8'))
        : {};

      const merged = deepMerge(base, local);
      return `export default ${JSON.stringify(merged, null, 2)};`;
    },
  };
}
