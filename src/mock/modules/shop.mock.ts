import { defineMock } from '@alova/mock';
import type { ShopSetting } from '@halo-dev/api-client';

export default defineMock({
  /**
   * Fetch public shop configuration
   * GET /apis/mp.api.ecommerce.halo.run/v1alpha1/ecommerceconfigs/shop
   *
   * ContactInformationTypeEnum supports only LINK | IMAGE
   * label is a required field (the label shown to users)
   */
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/ecommerceconfigs/shop': () => {
    return {
      contacts: [
        {
          type: 'LINK' as const,
          label: '微信客服',
          help: 'https://wechat.com/halo-shop-official',
          icon: 'wechat',
        },
        {
          type: 'LINK' as const,
          label: '客服热线',
          linkLabel: '400-888-8888',
          linkUrl: 'tel:4008888888',
        },
      ],
    } satisfies ShopSetting;
  },
});
