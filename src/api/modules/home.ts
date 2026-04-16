import { alovaInst } from '@/utils/request';
import type { ProductResponse, Banner, QuickEntry } from '@halo-dev/api-client';
import type { ListResult } from '@/types/api';

const api = alovaInst;

export const homeApi = {
  /**
   * Fetch home banner list
   */
  getBanners: () => api.Get<Banner[]>('/apis/mp.api.ecommerce.halo.run/v1alpha1/banners'),

  /**
   * Fetch recommended products on the home page (paginated)
   * Request params:
   * - page: page number (backend starts from 1)
   * - size: items per page, default 10
   * - keyword: search keyword
   * - categoryId: category ID. Search includes its child categories.
   */
  getRecommendProducts: (page = 1, size = 10, keyword?: string, categoryId?: number) =>
    api.Get<ListResult<ProductResponse>>('/apis/mp.api.ecommerce.halo.run/v1alpha1/products', {
      params: { page, size, keyword, categoryId },
    }),

  /**
   * Fetch data for the second quick-entry section on the home page
   */
  getQuickEntries: () =>
    api.Get<QuickEntry[]>('/apis/mp.api.ecommerce.halo.run/v1alpha1/quick-entries'),
};
