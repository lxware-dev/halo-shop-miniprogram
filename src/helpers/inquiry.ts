import type {
  ContactInformation,
  ProductResponse,
  ProductVariantResponse,
  ShopSetting,
} from '@halo-dev/api-client';

const LINK_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const WEB_BASE_PATTERN = /^(https?:)\/\/([^/?#\s]+)(\/[^?#\s]*)?(\?[^#\s]*)?(?:#\S*)?$/i;
const PROTOCOL_RELATIVE_PATTERN = /^\/\/[^/?#\s]+(?:[/?#]\S*)?$/;
const LINK_SUFFIX_PATTERN = /[?#]/;

/** These fields contain storefront web URLs, including paths that resemble mini-program routes. */
export function resolveInquiryTarget(target: string, baseURL: string): string | null {
  const value = target.trim();
  if (!value) {
    return null;
  }
  if (LINK_SCHEME_PATTERN.test(value)) {
    return value;
  }
  const base = WEB_BASE_PATTERN.exec(baseURL.trim());
  if (!base) {
    return null;
  }
  const origin = `${base[1]}//${base[2]}`;
  if (value.startsWith('//')) {
    return PROTOCOL_RELATIVE_PATTERN.test(value) ? `${base[1]}${value}` : null;
  }
  const basePath = base[3] || '/';
  if (value.startsWith('#')) {
    return `${origin}${basePath}${base[4] || ''}${value}`;
  }
  if (value.startsWith('?')) {
    return `${origin}${basePath}${value}`;
  }
  const suffixIndex = value.search(LINK_SUFFIX_PATTERN);
  const path = suffixIndex < 0 ? value : value.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? '' : value.slice(suffixIndex);
  const absolutePath = path.startsWith('/')
    ? path
    : `${basePath.slice(0, basePath.lastIndexOf('/') + 1)}${path}`;
  const segments: string[] = [];
  for (const segment of absolutePath.split('/')) {
    if (segment === '..') {
      if (segments.length > 1) {
        segments.pop();
      }
    } else if (segment !== '.') {
      segments.push(segment);
    }
  }
  if (absolutePath.endsWith('/.') || absolutePath.endsWith('/..')) {
    segments.push('');
  }
  return `${origin}${segments.join('/') || '/'}${suffix}`;
}

export function isInquiryVariant(variant: ProductVariantResponse | null | undefined): boolean {
  return variant?.pricingType === 'INQUIRY';
}

/** An empty list is not evidence that a product only has inquiry variants. */
export function isInquiryProduct(product: ProductResponse | null | undefined): boolean {
  return (
    product?.productType !== 'EXTERNAL' &&
    !!product?.productVariants?.length &&
    product.productVariants.every(isInquiryVariant)
  );
}

export type InquiryAction =
  | { type: 'redirect'; target: string }
  | { type: 'contacts'; contacts: ContactInformation[] }
  | { type: 'unavailable' };

/** A configured redirect always takes priority over the contact list. */
export function resolveInquiryAction(setting: ShopSetting): InquiryAction {
  const target = setting.inquiryRedirectUrl?.trim();
  if (target) {
    return { type: 'redirect', target };
  }
  const contacts = (setting.contacts ?? []).filter((contact) =>
    contact.type === 'LINK'
      ? !!contact.linkUrl?.trim()
      : contact.type === 'IMAGE' && !!contact.image?.trim(),
  );
  return contacts.length ? { type: 'contacts', contacts } : { type: 'unavailable' };
}
