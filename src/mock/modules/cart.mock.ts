import { defineMock } from '@alova/mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type {
  CartItemResponse,
  ProductResponse,
  ProductVariantResponse,
} from '@halo-dev/api-client';

function generateCartItem(id: number): CartItemResponse {
  const productId = faker.number.int({ min: 1, max: 50 });
  const variantId = productId * 10 + 1;
  const price = Number(faker.commerce.price({ min: 19.9, max: 999 }));

  const variant: ProductVariantResponse = {
    id: variantId,
    productId,
    skuCode: `SKU-${productId}-1`,
    price,
    originalPrice: Number((price * 1.5).toFixed(2)),
    stock: faker.number.int({ min: 10, max: 200 }),
    trackInventory: true,
    shippingRequired: true,
    status: 'PUBLISHED',
    imageUrl: faker.image.urlPicsumPhotos({ width: 200, height: 200 }),
    specValues: [
      {
        specId: 'color',
        name: '颜色',
        value: faker.helpers.arrayElement(['黑色', '白色', '红色']),
      },
      { specId: 'size', name: '尺寸', value: faker.helpers.arrayElement(['S', 'M', 'L', 'XL']) },
    ],
    createdAt: faker.date.recent({ days: 60 }).toISOString(),
    updatedAt: faker.date.recent({ days: 10 }).toISOString(),
  };

  const product: ProductResponse = {
    id: productId,
    title: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    coverImageUrl: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
    status: 'PUBLISHED',
    productType: 'PHYSICAL',
    minPrice: price,
    maxPrice: price,
  };

  return {
    id,
    customerId: 1,
    productVariantId: variantId,
    quantity: faker.number.int({ min: 1, max: 5 }),
    product,
    productVariant: variant,
    createdAt: faker.date.recent({ days: 7 }).toISOString(),
  };
}

// Local mock cart state
let mockCart: CartItemResponse[] = [generateCartItem(1), generateCartItem(2), generateCartItem(3)];

export default defineMock({
  /**
   * Fetch cart list
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items': () => mockCart,

  /**
   * Add a product to the cart
   * POST /apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items
   *
   * Mock sold-out rule: treat productVariantId % 7 === 0 as unpublished / out of stock
   */
  '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items': ({ data }) => {
    const { productVariantId, quantity } = data as { productVariantId: number; quantity: number };
    // Mock some products as sold out (used for buy-again flow testing)
    if (productVariantId % 7 === 0) {
      throw Object.assign(new Error('商品已售罄'), { status: 422, title: 'Unprocessable' });
    }
    const existing = mockCart.find((item) => item.productVariantId === productVariantId);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + quantity;
      return existing;
    }
    const newItem = generateCartItem(mockCart.length + 1);
    newItem.productVariantId = productVariantId;
    newItem.quantity = quantity;
    mockCart.push(newItem);
    return newItem;
  },

  /**
   * Update cart item quantity
   * PUT /apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/{id}
   */
  '[PUT]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/{id}': ({ params, data }) => {
    const id = Number(params.id);
    const { quantity } = data as { quantity: number };
    const item = mockCart.find((i) => i.id === id);
    if (item) {
      item.quantity = quantity;
      return item;
    }
    return null;
  },

  /**
   * Delete a single cart item
   * DELETE /apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/{id}
   */
  '[DELETE]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/{id}': ({ params }) => {
    const id = Number(params.id);
    mockCart = mockCart.filter((i) => i.id !== id);
    return null;
  },

  /**
   * Clear the cart
   * DELETE /apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items
   */
  '[DELETE]/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items': () => {
    mockCart = [];
    return null;
  },
});
