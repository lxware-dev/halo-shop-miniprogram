/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: 'development' | 'staging' | 'production';
  readonly VITE_MOCK_ENABLED: string;
  readonly VITE_MOCK_DELAY: number;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
