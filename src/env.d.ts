/// <reference types="vite/client" />
/// <reference types="@tdesign/uniapp/global" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

declare module 'virtual:app-config' {
  import type { AppConfig } from '@/config/types';
  const config: AppConfig;
  export default config;
}
