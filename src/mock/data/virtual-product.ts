import type { ProductResponse, ProductVariantResponse } from '@halo-dev/api-client';

export const MOCK_VIRTUAL_PRODUCT_ID = 901;
export const MOCK_VIRTUAL_VARIANT_ID = 9011;

export const mockVirtualVariant: ProductVariantResponse = {
  id: MOCK_VIRTUAL_VARIANT_ID,
  productId: MOCK_VIRTUAL_PRODUCT_ID,
  skuCode: 'DIGITAL-DESIGN-KIT',
  price: 59,
  originalPrice: 79,
  stock: 100,
  trackInventory: true,
  shippingRequired: false,
  status: 'PUBLISHED',
  imageUrl: '/static/logo.png',
  specValues: [],
};

export const mockVirtualProduct: ProductResponse = {
  id: MOCK_VIRTUAL_PRODUCT_ID,
  title: '数字设计素材包（Mock 演示）',
  description: '支付后在订单详情查看卡密和数字资源。',
  coverImageUrl: '/static/logo.png',
  images: ['/static/logo.png'],
  content: '<p>支付完成后，在订单详情中查看数字资源与卡密。</p>',
  handle: 'mock-digital-design-kit',
  status: 'PUBLISHED',
  productType: 'VIRTUAL',
  minPrice: 59,
  maxPrice: 59,
  minOriginalPrice: 79,
  maxOriginalPrice: 79,
  productVariants: [mockVirtualVariant],
  specDefinition: [],
};
