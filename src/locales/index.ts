import { createI18n } from 'vue-i18n';
import type { AppConfig } from '@/config/types';
import appConfigJson from 'virtual:app-config';
import zhCN from './messages/zh-CN';
import enUS from './messages/en-US';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export type MessageKey = keyof typeof zhCN;
export type MessageSchema = Record<MessageKey, string>;

const LOCALE_STORAGE_KEY = 'halo-mall-locale';
const FALLBACK_LOCALE: AppLocale = 'zh-CN';

const messages: Record<AppLocale, MessageSchema> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

function normalizeLocale(raw?: string | null): AppLocale {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value.startsWith('en')) {
    return 'en-US';
  }
  return 'zh-CN';
}

function readSavedLocale(): AppLocale | null {
  const saved = uni.getStorageSync(LOCALE_STORAGE_KEY);
  if (typeof saved !== 'string' || !saved) {
    return null;
  }
  return normalizeLocale(saved);
}

function readConfiguredLocale(): AppLocale | null {
  const appConfig = appConfigJson as AppConfig;
  const configuredLocale = appConfig.i18n?.defaultLocale;
  if (!configuredLocale) {
    return null;
  }
  return normalizeLocale(configuredLocale);
}

function readSystemLocale(): AppLocale {
  if (typeof uni.getLocale === 'function') {
    return normalizeLocale(uni.getLocale());
  }
  const systemInfo = uni.getSystemInfoSync();
  return normalizeLocale(systemInfo.language);
}

export function resolveInitialLocale(): AppLocale {
  return readConfiguredLocale() ?? readSavedLocale() ?? readSystemLocale() ?? FALLBACK_LOCALE;
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages,
  globalInjection: true,
});

export function getLocale(): AppLocale {
  const locale = (i18n.global as { locale: AppLocale | { value: AppLocale } }).locale;
  return typeof locale === 'string' ? locale : locale.value;
}

export function setLocale(locale: AppLocale) {
  const nextLocale = normalizeLocale(locale);
  const globalComposer = i18n.global as { locale: AppLocale | { value: AppLocale } };
  if (typeof globalComposer.locale === 'string') {
    globalComposer.locale = nextLocale;
  } else {
    globalComposer.locale.value = nextLocale;
  }
  uni.setStorageSync(LOCALE_STORAGE_KEY, nextLocale);
  return nextLocale;
}

export function translate(key: MessageKey | string, named?: Record<string, unknown>): string {
  return i18n.global.t(key, named ?? {});
}
