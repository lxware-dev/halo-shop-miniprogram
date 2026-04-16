/**
 * Serialize an object into a URL query string
 *
 * @example buildQuery({ a: 'hello world', b: 'ok' }) => 'a=hello%20world&b=ok'
 */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  return Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/**
 * Base64 encode
 */
export function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const bytes = Array.from(str, (c) => c.charCodeAt(0));
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    result +=
      chars[b0 >> 2] +
      chars[((b0 & 3) << 4) | (b1 >> 4)] +
      (i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
      (i + 2 < bytes.length ? chars[b2 & 63] : '=');
  }
  return result;
}
