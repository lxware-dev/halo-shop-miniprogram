import { storeToRefs } from 'pinia';
import { useCartStore } from '@/store';
import { cartApi } from '@/api';
import { getCurrentPageUrl } from '@/helpers/auth';
import { useAuth } from '@/hooks/useAuth';
import { sendRequest } from '@/hooks/useRequest';
import type { CartItemResponse } from '@halo-dev/api-client';
import { translate } from '@/locales';

export function useCart() {
  const cartStore = useCartStore();
  const { requireAuth } = useAuth();
  const { items, totalCount, selectedItems, totalPrice, isEmpty } = storeToRefs(cartStore);

  /**
   * Fetch the cart from the server and sync it to local state
   */
  async function fetchCart() {
    const items = await sendRequest(cartApi.getCartItems());
    cartStore.syncFromServer(items as CartItemResponse[]);
  }

  /**
   * Add a product to the cart (call the server API + refetch)
   */
  async function addToCart(productVariantId: number, quantity = 1) {
    if (!requireAuth({ redirectUrl: getCurrentPageUrl() })) {
      return false;
    }
    await sendRequest(cartApi.addCartItem({ productVariantId, quantity }));
    await fetchCart();
    uni.showToast({ title: translate('order.addedToCart'), icon: 'success', duration: 1500 });
    return true;
  }

  /**
   * Add order items to the cart in batch (used for buy again)
   * Return false if any item is unpublished or out of stock; return true only if all succeed
   */
  async function addOrderItemsToCart(
    items: { productVariantId: number; quantity: number }[],
  ): Promise<boolean> {
    if (!requireAuth({ redirectUrl: getCurrentPageUrl() })) {
      return false;
    }
    for (const item of items) {
      try {
        await sendRequest(cartApi.addCartItem(item));
      } catch {
        return false;
      }
    }
    await fetchCart();
    return true;
  }

  /**
   * Update quantity (sync server + local)
   */
  async function updateQuantity(id: number, quantity: number) {
    await sendRequest(cartApi.updateCartItem(id, quantity));
    cartStore.updateQuantity(id, quantity);
  }

  /**
   * Remove a single item (sync server + local)
   */
  async function removeItem(id: number) {
    await sendRequest(cartApi.removeCartItem(id));
    cartStore.removeItem(id);
  }

  function goToCart() {
    uni.switchTab({ url: '/pages/cart/index' });
  }

  return {
    items,
    totalCount,
    selectedItems,
    totalPrice,
    isEmpty,
    fetchCart,
    addToCart,
    addOrderItemsToCart,
    removeItem,
    updateQuantity,
    toggleSelect: cartStore.toggleSelect,
    selectAll: cartStore.selectAll,
    clearSelected: cartStore.clearSelected,
    clearAll: cartStore.clearAll,
    goToCart,
  };
}
