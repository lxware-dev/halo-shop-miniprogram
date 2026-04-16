import { alovaInst } from '@/utils/request';
import type { ProductCategoryResponse } from '@halo-dev/api-client';

const api = alovaInst;

export const categoryApi = {
  /**
   * Fetch category tree list (when tree=true, the backend returns a nested tree structure)
   */
  getCategoryTrees: () =>
    api.Get<ProductCategoryResponse[]>(
      '/apis/mp.api.ecommerce.halo.run/v1alpha1/product-categories',
      { params: { tree: true } },
    ),
};
