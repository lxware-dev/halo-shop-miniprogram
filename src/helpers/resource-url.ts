const HTTPS_RESOURCE_URL_PATTERN = /^https:\/\/[^/?#@\\\s]+(?:[/?#]|$)/i;

/** Keep external web views and downloads on HTTPS without relying on browser URL globals. */
export function validHttpsResourceUrl(value?: string) {
  const url = value?.trim();
  return url && HTTPS_RESOURCE_URL_PATTERN.test(url) ? url : '';
}
