import { alovaInst } from '@/utils/request';
import type { CartItemResponse } from '@halo-dev/api-client';

const api = alovaInst;

export const cartApi = {
  /**
   * Fetch the current user's cart list
   */
  getCartItems: () =>
    api.Get<CartItemResponse[]>('/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items'),

  /**
   * Add a product to the cart
   */
  addCartItem: (payload: { productVariantId: number; quantity: number }) =>
    api.Post<CartItemResponse>('/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items', payload),

  /**
   * Update cart item quantity
   */
  updateCartItem: (id: number, quantity: number) =>
    api.Put<CartItemResponse>(`/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/${id}`, {
      quantity,
    }),

  /**
   * Delete a single cart item
   */
  removeCartItem: (id: number) =>
    api.Delete(`/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items/${id}`),

  /**
   * Clear the cart
   */
  clearCart: async () => {
    const items =
      (await api
        .Get<CartItemResponse[]>('/apis/uc.api.ecommerce.halo.run/v1alpha1/cart-items')
        .send()) ?? [];

    for (const item of items) {
      if (item.id == null) {
        continue;
      }
      await cartApi.removeCartItem(item.id).send();
    }
  },
};
