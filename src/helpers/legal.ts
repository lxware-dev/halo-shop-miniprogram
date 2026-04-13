import { useAppConfig } from '@/config';
import { buildPageUrl, navigateToPage } from '@/helpers/auth';
import type { LegalDocumentKey } from '@/config/types';

/**
 * Shared mini-program page used to display configured legal documents in a WebView.
 */
const LEGAL_WEBVIEW_PAGE_PATH = '/subpkg-common/webview/index';

/**
 * Human-readable labels for each legal-document slot.
 */
export const LEGAL_DOCUMENT_META: Record<LegalDocumentKey, { title: string }> = {
  userAgreement: { title: '用户协议' },
  privacyPolicy: { title: '隐私政策' },
  paymentAgreement: { title: '用户支付协议' },
  platformRules: { title: '平台规则' },
  qualification: { title: '资质证照' },
};

/**
 * Checks whether a dynamic route/query value is a supported legal-document key.
 */
export function isLegalDocumentKey(value: string): value is LegalDocumentKey {
  return Object.hasOwn(LEGAL_DOCUMENT_META, value);
}

export function getLegalDocumentTitle(key: LegalDocumentKey) {
  return LEGAL_DOCUMENT_META[key].title;
}

export function getLegalDocumentUrl(key: LegalDocumentKey) {
  return useAppConfig().business.legalDocuments[key]?.trim() ?? '';
}

export function isLegalDocumentConfigured(key: LegalDocumentKey) {
  return !!getLegalDocumentUrl(key);
}

/**
 * Opens a configured legal document with the shared mini-program WebView page.
 * When the target URL is missing, a toast is shown instead of navigating.
 */
export function openLegalDocument(key: LegalDocumentKey) {
  if (!getLegalDocumentUrl(key)) {
    return false;
  }

  return navigateToPage(
    buildPageUrl(LEGAL_WEBVIEW_PAGE_PATH, {
      key,
    }),
  );
}
