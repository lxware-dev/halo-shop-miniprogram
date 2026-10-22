import type { AppConfig } from '@/config/types';
import appConfigJson from 'virtual:app-config';
import { normalizeLoginMethods } from './login-methods';

const source = appConfigJson as AppConfig;
const appConfig: AppConfig = {
  ...source,
  auth: { ...source.auth, loginMethods: normalizeLoginMethods(source.auth?.loginMethods) },
};

export function useAppConfig(): AppConfig {
  return appConfig;
}
