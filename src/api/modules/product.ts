import { alovaInst } from '@/utils/request';
import type { ProductResponse } from '@halo-dev/api-client';
import type { PageQuery, ListResult } from '@/types/api';
import type { FilterGroup } from '@/types/filter';

const api = alovaInst;
const PRODUCT_PAGE_OFFSET = 1;

function normalizePage(page?: number) {
  if (page == null) {
    return undefined;
  }
  return Math.max(page + PRODUCT_PAGE_OFFSET, PRODUCT_PAGE_OFFSET);
}

export interface ProductListQuery extends PageQuery {
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
}

export const productApi = {
  /**
   * Fetch paginated product list
   */
  getProducts: (query?: ProductListQuery) =>
    api.Get<ListResult<ProductResponse>>('/apis/mp.api.ecommerce.halo.run/v1alpha1/products', {
      params: {
        ...query,
        page: normalizePage(query?.page),
      },
    }),

  /**
   * Fetch product details by ID (user-facing)
   */
  getProduct: (
    id: number,
    options?: {
      includeVariants?: boolean;
      includeContent?: boolean;
      includeImages?: boolean;
    },
  ) =>
    api.Get<ProductResponse>(`/apis/mp.api.ecommerce.halo.run/v1alpha1/products/${id}`, {
      params: {
        includeVariants: options?.includeVariants ?? true,
        includeContent: options?.includeContent ?? false,
        includeImages: options?.includeImages ?? true,
      },
    }),

  /**
   * Fetch filter options for the product list page (dynamic groups such as category and brand)
   *
   * If categoryId is omitted, return global filters; otherwise return filters under the given category.
   */
  getFilterOptions: (categoryId?: number) =>
    api.Get<FilterGroup[]>('/apis/mp.api.ecommerce.halo.run/v1alpha1/products/filter-options', {
      params: { categoryId },
    }),
};
