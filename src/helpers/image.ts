import { useAppConfig } from '@/config';
import type { GetThumbnailByUriSizeEnum } from '@halo-dev/api-client';

const BASE_URL_REGEXP = /\/$/;

/**
 * Formatted image URL with thumbnail processing applied; recommended for general use
 * @param url - image URL
 * @param size - thumbnail size
 * @returns formatted image URL with thumbnail processing applied
 */
export function formatImageUrlWithThumbnail(
  url: string | null | undefined,
  size?: GetThumbnailByUriSizeEnum,
): string {
  if (!url) {
    return '';
  }
  const formattedUrl = formatImageUrl(url);
  if (!size) {
    return formattedUrl;
  }
  return getThumbnailUrl(formattedUrl, size);
}

/**
 * Format image URL: relative paths are prefixed with baseURL automatically, while absolute paths are returned as-is
 */
export function formatImageUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
    return url;
  }
  const { halo } = useAppConfig();
  const base = halo.baseURL.replace(BASE_URL_REGEXP, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Format share image URL.
 * Static assets under `/static` should stay as local paths,
 * while other resources follow the normal image URL formatting rules.
 */
export function formatShareImageUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  if (url.startsWith('/static/') || url.startsWith('static/')) {
    return url.startsWith('/') ? url : `/${url}`;
  }
  return formatImageUrl(url);
}

/**
 * Mapping of thumbnail size enums to their corresponding widths in pixels
 *
 * @remarks
 * - XL: 1600px - Extra large thumbnails
 * - L: 1200px - Large thumbnails
 * - M: 800px - Medium thumbnails
 * - S: 400px - Small thumbnails
 */
export const THUMBNAIL_WIDTH_MAP: Record<GetThumbnailByUriSizeEnum, number> = {
  XL: 1600,
  L: 1200,
  M: 800,
  S: 400,
};

/**
 * Generates a thumbnail URL for the given image URL with the specified size
 *
 * @param url - The original image URL (can be absolute, relative, or external)
 * @param size - The desired thumbnail size (XL, L, M, or S)
 * @returns The thumbnail URL with width parameter, or original URL if size is invalid
 *
 * @remarks
 * This method handles three scenarios:
 * 1. If URL starts with current origin: Appends `?width={size}` query parameter
 * 2. If URL is a relative path (starts with "/"): Appends `?width={size}` query parameter
 * 3. If URL is external: Routes through Halo's thumbnail API endpoint
 *
 * @example
 * ```ts
 * import { utils } from "@halo-dev/ui-shared"
 *
 * // Local image
 * utils.attachment.getThumbnailUrl("/uploads/image.jpg", "M");
 * // Returns: "/uploads/image.jpg?width=800"
 *
 * // Same origin image
 * utils.attachment.getThumbnailUrl("https://example.com/image.jpg", "S");
 * // Returns: "https://example.com/image.jpg?width=400" (if current origin is example.com)
 *
 * // External image
 * utils.attachment.getThumbnailUrl("https://external.com/image.jpg", "L");
 * // Returns: "/apis/api.storage.halo.run/v1alpha1/thumbnails/-/via-uri?uri=https%3A%2F%2Fexternal.com%2Fimage.jpg&width=1200"
 * ```
 */
export function getThumbnailUrl(url: string, size: GetThumbnailByUriSizeEnum) {
  const { halo } = useAppConfig();
  const origin = halo.baseURL;

  const width = THUMBNAIL_WIDTH_MAP[size];

  if (!width) {
    return url;
  }

  if (url.startsWith('data:')) {
    return url;
  }

  if (url.startsWith(origin) || url.startsWith('/')) {
    return `${url}?width=${width}`;
  }

  return formatImageUrl(
    `/apis/api.storage.halo.run/v1alpha1/thumbnails/-/via-uri?uri=${encodeURIComponent(
      url,
    )}&width=${width}`,
  );
}
