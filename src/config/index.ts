import type { AppConfig } from '@/config/types';
import appConfigJson from 'virtual:app-config';

export function useAppConfig(): AppConfig {
  return appConfigJson as AppConfig;
}
