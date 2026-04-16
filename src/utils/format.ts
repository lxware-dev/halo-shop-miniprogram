import dayjs from 'dayjs';
import { useAppConfig } from '@/config';

const PHONE_MASK_REGEXP = /(\d{3})\d{4}(\d{4})/;

/**
 * Format price (unit: yuan) with two decimal places
 * If price is null / undefined, return '0.00'
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) {
    return '0.00';
  }
  return price.toFixed(2);
}

/**
 * Format price using locale-aware grouping and precision
 */
export function formatPriceByLocale(price: number | null | undefined, locale = 'zh-CN'): string {
  return Number(price ?? 0).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Read the configured currency symbol
 */
export function getCurrencySymbol(): string {
  return useAppConfig().business.currencySymbol ?? '';
}

/**
 * Format currency using the configured symbol
 */
export function formatCurrency(
  price: number | null | undefined,
  options?: {
    locale?: string;
    withSpace?: boolean;
  },
): string {
  const amount = options?.locale ? formatPriceByLocale(price, options.locale) : formatPrice(price);
  const symbol = getCurrencySymbol();
  if (!symbol) {
    return amount;
  }
  return options?.withSpace ? `${symbol} ${amount}` : `${symbol}${amount}`;
}

/**
 * Format price (unit: fen -> yuan) with two decimal places
 * Suitable for API fields that use fen, such as product lists
 */
export function formatPriceFen(priceFen: number | null | undefined): string {
  if (priceFen == null) {
    return '0.00';
  }
  return (priceFen / 100).toFixed(2);
}

/**
 * Format date and time; default pattern is YYYY-MM-DD HH:mm:ss
 */
export function formatDate(
  date: string | Date | null | undefined,
  template = 'YYYY-MM-DD HH:mm:ss',
): string {
  if (!date) {
    return '';
  }
  return dayjs(date).format(template);
}

/**
 * Mask the middle four digits of a phone number
 */
export function maskPhone(phone: string): string {
  if (!phone) {
    return '';
  }
  return phone.length >= 11
    ? `${phone.slice(0, 3)}****${phone.slice(7)}`
    : phone.replace(PHONE_MASK_REGEXP, '$1****$2');
}

/**
 * Format the order status label
 */
export function formatOrderStatus(status: string): string {
  const statusMap: Record<string, string> = {
    PENDING_PAYMENT: '待付款',
    PENDING_SHIPMENT: '待发货',
    PENDING_RECEIPT: '待收货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    REFUNDING: '退款中',
    REFUNDED: '已退款',
  };
  return statusMap[status] ?? status;
}

/**
 * Convert an rpx value to px (based on a 750 design draft)
 */
export function rpxToPx(rpx: number): number {
  const screenWidth = uni.getSystemInfoSync().windowWidth;
  return (rpx / 750) * screenWidth;
}

/**
 * Join the full shipping address
 * @param parts address parts (province / city / district / street)
 */
export function joinAddress(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Join full name (last + first)
 */
export function joinName(lastName?: string | null, firstName?: string | null): string {
  return `${lastName ?? ''}${firstName ?? ''}`;
}
