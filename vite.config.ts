import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import uni from '@dcloudio/vite-plugin-uni';
import process from 'node:process';
import appConfigPlugin from './plugins/vite-plugin-app-config';

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const isMockEnabled = env.VITE_MOCK_ENABLED === 'true';
  const { default: UnoCSS } = await import('unocss/vite');

  return {
    plugins: [appConfigPlugin(), UnoCSS(), uni()],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          silenceDeprecations: ['legacy-js-api'],
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // @halo-dev/api-client depends on axios, but Mini Program environments do not support it,
        // in this project the package is used only for types and enums, while real requests go through alova + the uniapp adapter
        axios: fileURLToPath(new URL('./src/stubs/axios.ts', import.meta.url)),
        ...(isMockEnabled
          ? {}
          : {
              '@/mock/index': fileURLToPath(new URL('./src/stubs/mock.ts', import.meta.url)),
            }),
      },
    },
  };
});
