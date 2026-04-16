import { useAppConfig } from '@/config';
import { buildPageUrl, navigateToPage } from '@/helpers/auth';
import type { LegalDocumentKey } from '@/config/types';
import { translate } from '@/locales';

/**
 * Shared mini-program page used to display configured legal documents in a WebView.
 */
const LEGAL_WEBVIEW_PAGE_PATH = '/subpkg-common/webview/index';

/**
 * Human-readable labels for each legal-document slot.
 */
export const LEGAL_DOCUMENT_META: Record<LegalDocumentKey, { title: string }> = {
  userAgreement: { title: 'legal.userAgreement' },
  privacyPolicy: { title: 'legal.privacyPolicy' },
  paymentAgreement: { title: 'legal.paymentAgreement' },
  platformRules: { title: 'legal.platformRules' },
  qualification: { title: 'legal.qualification' },
};

/**
 * Checks whether a dynamic route/query value is a supported legal-document key.
 */
export function isLegalDocumentKey(value: string): value is LegalDocumentKey {
  return Object.hasOwn(LEGAL_DOCUMENT_META, value);
}

export function getLegalDocumentTitle(key: LegalDocumentKey) {
  return translate(LEGAL_DOCUMENT_META[key].title);
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
