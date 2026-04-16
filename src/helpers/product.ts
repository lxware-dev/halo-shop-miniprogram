import type { ProductResponse } from '@halo-dev/api-client';
import { openLinkTarget } from '@/helpers/link';

export function isExternalProduct(product: ProductResponse | null | undefined): boolean {
  return product?.productType === 'EXTERNAL' && !!product.externalLinkUrl;
}

export function openExternalProduct(product: ProductResponse | null | undefined): boolean {
  if (!isExternalProduct(product)) {
    return false;
  }
  return openLinkTarget(product?.externalLinkUrl, { copyMessage: '外部商品链接已复制' });
}
