import { defineMock } from '@alova/mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type { ProductResponse, ProductVariantResponse } from '@halo-dev/api-client';
import type { ListResult } from '@/types/api';
import type { FilterGroup } from '@/types/filter';
import { TOP_CATEGORIES, FLAT_SUB_CATEGORIES } from '@/mock/data/categories';

// Color and size specs (used to generate SKUs)
const COLORS = ['黑色', '白色', '红色', '蓝色', '绿色'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

function insertSort<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  const sorted: T[] = [];
  for (const item of items) {
    const insertIndex = sorted.findIndex((existing) => compare(item, existing) < 0);
    if (insertIndex === -1) {
      sorted.push(item);
      continue;
    }
    sorted.splice(insertIndex, 0, item);
  }
  return sorted;
}

function generateVariant(
  productId: number,
  index: number,
  colorValue: string,
  sizeValue: string,
): ProductVariantResponse {
  // Price unit: yuan (floating point, consistent with the frontend)
  const price = Number(faker.commerce.price({ min: 19.9, max: 999 }));
  // Mock some variants as unavailable: about 20% have a non-PUBLISHED status, and about 15% have stock 0
  const statusRoll = faker.number.int({ min: 1, max: 10 });
  const status =
    statusRoll <= 2 ? faker.helpers.arrayElement(['DRAFT', 'ARCHIVED'] as const) : 'PUBLISHED';
  const trackInventory = true;
  const stock =
    status === 'PUBLISHED' && faker.number.int({ min: 1, max: 10 }) <= 2
      ? 0
      : faker.number.int({ min: 1, max: 500 });

  return {
    id: productId * 10 + index,
    productId,
    skuCode: `SKU-${productId}-${index}`,
    price,
    originalPrice: Number(
      (price * faker.number.float({ min: 1.1, max: 2.0, fractionDigits: 1 })).toFixed(2),
    ),
    stock,
    trackInventory,
    shippingRequired: true,
    status,
    imageUrl: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
    specValues: [
      { specId: 'color', name: '颜色', value: colorValue },
      { specId: 'size', name: '尺寸', value: sizeValue },
    ],
    createdAt: faker.date.recent({ days: 90 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString(),
    weightG: faker.number.int({ min: 100, max: 5000 }),
  };
}

function generateProductContent(): string {
  const paragraphs = Array.from({ length: faker.number.int({ min: 2, max: 4 }) }, () => {
    const img = faker.image.urlPicsumPhotos({ width: 750, height: 500 });
    const text = faker.lorem.paragraphs(faker.number.int({ min: 1, max: 2 }));
    return `<img src="${img}" style="width:100%;display:block;" /><p style="padding:16px;font-size:14px;color:#334155;line-height:1.8;">${text}</p>`;
  });
  return paragraphs.join('');
}

function generateProduct(id: number): ProductResponse {
  const category = faker.helpers.arrayElement(TOP_CATEGORIES);
  // Randomly select some colors and sizes to build a complete color x size spec matrix
  const usedColors = faker.helpers.arrayElements(COLORS, { min: 2, max: 3 });
  const usedSizes = faker.helpers.arrayElements(SIZES, { min: 2, max: 3 });
  const variants: ProductVariantResponse[] = [];
  let variantIndex = 1;
  for (const color of usedColors) {
    for (const size of usedSizes) {
      variants.push(generateVariant(id, variantIndex++, color, size));
    }
  }
  const prices = variants.map((v) => v.price ?? 0);
  const originalPrices = variants.map((v) => v.originalPrice ?? 0);

  return {
    id,
    title: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    coverImageUrl: faker.image.urlPicsumPhotos({ width: 600, height: 600 }),
    images: [1, 2, 3].map(() => faker.image.urlPicsumPhotos({ width: 600, height: 600 })),
    content: generateProductContent(),
    categoryId: category.id,
    handle: faker.helpers.slugify(faker.commerce.productName().toLowerCase()),
    status: 'PUBLISHED',
    productType: 'PHYSICAL',
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    minOriginalPrice: Math.min(...originalPrices),
    maxOriginalPrice: Math.max(...originalPrices),
    productVariants: variants,
    specDefinition: [
      {
        id: 'color',
        name: '颜色',
        usedForSku: true,
        values: usedColors.map((v) => ({ value: v, id: v, name: v })),
      },
      {
        id: 'size',
        name: '尺寸',
        usedForSku: true,
        values: usedSizes.map((v) => ({ value: v, id: v, name: v })),
      },
    ],
    createdAt: faker.date.recent({ days: 180 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString(),
  };
}

// Pre-generate a fixed product pool so pagination, sorting, and filtering stay stable
const PRODUCT_POOL: ProductResponse[] = Array.from({ length: 100 }, (_, i) =>
  generateProduct(i + 1),
);

export default defineMock({
  /**
   * Paginated product list
   * GET /apis/mp.api.ecommerce.halo.run/v1alpha1/products
   */
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/products': ({ query }) => {
    const page = Math.max(Number(query?.page ?? 1), 1);
    const size = Number(query?.size ?? 10);
    const categoryId = query?.categoryId ? Number(query.categoryId) : undefined;
    const minPrice = query?.minPrice ? Number(query.minPrice) : undefined;
    const maxPrice = query?.maxPrice ? Number(query.maxPrice) : undefined;
    const sortQuery = query?.sort;
    const sort = Array.isArray(sortQuery) ? sortQuery[0] : (sortQuery as string | undefined);

    // Filter from the product pool
    let filtered = PRODUCT_POOL.slice();

    if (categoryId) {
      filtered = filtered.filter((p) => p.categoryId === categoryId);
      // Products are assigned by top-level category in the pool; child category IDs may not match exactly, but some data is guaranteed
      if (filtered.length === 0) {
        filtered = PRODUCT_POOL.slice(0, 20).map((p) => ({ ...p, categoryId }));
      }
    }

    // Price filter (both frontend and mock prices use yuan)
    if (minPrice != null) {
      filtered = filtered.filter((p) => (p.minPrice ?? 0) >= minPrice);
    }
    if (maxPrice != null) {
      filtered = filtered.filter((p) => (p.minPrice ?? 0) <= maxPrice);
    }

    // Sorting
    if (sort) {
      const [field, direction] = sort.split(',');
      filtered = insertSort(filtered, (a, b) => {
        let aVal: number;
        let bVal: number;
        if (field === 'salesCount') {
          // Use id modulo to simulate sales volume (deterministic and without type extensions)
          aVal = ((a.id ?? 0) * 97) % 9999;
          bVal = ((b.id ?? 0) * 97) % 9999;
        } else {
          // Sort by minPrice by default
          aVal = a.minPrice ?? 0;
          bVal = b.minPrice ?? 0;
        }
        return direction === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    const total = filtered.length;
    const start = (page - 1) * size;
    const items = filtered.slice(start, start + size);
    const totalPages = Math.ceil(total / size);
    const currentPage = page;

    return {
      items,
      total,
      totalPages,
      page: currentPage,
      size,
      first: currentPage <= 1,
      last: currentPage >= totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    } satisfies ListResult<ProductResponse>;
  },

  /**
   * Product details (user-facing)
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/products/{id}
   */
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/products/{id}': ({ params }) => {
    const id = Number(params.id);
    return generateProduct(id);
  },

  /**
   * Product variant (SKU) list
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/products/{productId}/variants
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/products/{productId}/variants': ({ params }) => {
    const productId = Number(params.productId);
    const usedColors = faker.helpers.arrayElements(COLORS, { min: 2, max: 3 });
    const usedSizes = faker.helpers.arrayElements(SIZES, { min: 2, max: 3 });
    const variants: ProductVariantResponse[] = [];
    let index = 1;
    for (const color of usedColors) {
      for (const size of usedSizes) {
        variants.push(generateVariant(productId, index++, color, size));
      }
    }
    return variants;
  },

  /**
   * Product list filter options
   * GET /apis/mp.api.ecommerce.halo.run/v1alpha1/products/filter-options
   *
   * Mock behavior:
   * - No categoryId: global entry, return top-level category groups
   * - categoryId is a top-level category ID: return all child categories under it (grouped by section)
   * - categoryId is a child category ID: return sibling child-category groups within the same section
   */
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/products/filter-options': ({
    query,
  }): FilterGroup[] => {
    const categoryId = query?.categoryId ? Number(query.categoryId) : undefined;

    if (!categoryId) {
      // Global product list: show all top-level categories
      return [
        {
          key: 'categoryId',
          label: '商品分类',
          type: 'single',
          options: TOP_CATEGORIES.map((cat) => ({ value: cat.id!, label: cat.name! })),
        },
      ];
    }

    // First determine whether categoryId is a top-level category ID
    const isTopLevel = TOP_CATEGORIES.some((cat) => cat.id === categoryId);
    if (isTopLevel) {
      // Top-level category entry: show all child categories under that top-level category
      const subItems = FLAT_SUB_CATEGORIES.filter((sub) => sub.parentId === categoryId);
      return [
        {
          key: 'categoryId',
          label: '子分类',
          type: 'single',
          options: subItems.map((item) => ({ value: item.id, label: item.name })),
        },
      ];
    }

    // Child category entry: show sibling child categories under the same parent category
    const current = FLAT_SUB_CATEGORIES.find((sub) => sub.id === categoryId);
    if (!current) {
      return [];
    }

    const siblings = FLAT_SUB_CATEGORIES.filter((sub) => sub.parentId === current.parentId);

    return [
      {
        key: 'categoryId',
        label: '子分类',
        type: 'single',
        options: siblings.map((sub) => ({ value: sub.id, label: sub.name })),
      },
    ];
  },
});
