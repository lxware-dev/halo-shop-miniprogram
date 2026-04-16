import { alovaInst } from '@/utils/request';
import type { ShopSetting } from '@halo-dev/api-client';

const api = alovaInst;

export const shopApi = {
  /**
   * Fetch public shop configuration
   */
  getShopConfig: () =>
    api.Get<ShopSetting>('/apis/mp.api.ecommerce.halo.run/v1alpha1/ecommerceconfigs/shop'),
};
