import { defineMock } from '@alova/mock';
import { CATEGORY_TREES, TOP_CATEGORIES } from '@/mock/data/categories';

/**
 * Category-related mock
 * - tree=true: returns a tree structure with children (used by the category page)
 * - no params: returns a flat list of top-level categories (used in filter scenarios, etc.)
 */
export default defineMock({
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/product-categories': ({ query }) =>
    query?.tree === 'true' || query?.tree === true ? CATEGORY_TREES : TOP_CATEGORIES,
});
