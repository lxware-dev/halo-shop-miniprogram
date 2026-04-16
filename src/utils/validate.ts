const PHONE_REGEXP = /^1[3-9]\d{9}$/;

/**
 * Phone number validation
 */
export function isValidPhone(phone: string): boolean {
  return PHONE_REGEXP.test(phone);
}

/**
 * Non-empty string validation
 */
export function isNotEmpty(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * URL validation
 */
export function isValidUrl(url: string): boolean {
  return URL.canParse(url);
}

/**
 * Positive integer validation
 */
export function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
