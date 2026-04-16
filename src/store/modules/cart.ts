import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CartItemResponse } from '@halo-dev/api-client';

/**
 * Local cart state
 * This store is mainly used to cache server data and support selection state
 */
export interface LocalCartItem extends CartItemResponse {
  selected: boolean;
}

export const useCartStore = defineStore(
  'cart',
  () => {
    const items = ref<LocalCartItem[]>([]);

    const totalCount = computed(() =>
      items.value.reduce((sum: number, item: LocalCartItem) => sum + (item.quantity ?? 0), 0),
    );

    const selectedItems = computed(() =>
      items.value.filter((item: LocalCartItem) => item.selected),
    );

    const totalPrice = computed(() =>
      selectedItems.value.reduce(
        (sum: number, item: LocalCartItem) =>
          sum + (item.productVariant?.price ?? 0) * (item.quantity ?? 1),
        0,
      ),
    );

    const isEmpty = computed(() => items.value.length === 0);

    /**
     * Sync cart data from the server
     */
    function syncFromServer(serverItems: CartItemResponse[]) {
      const existingSelectedIds = new Set(
        items.value.filter((i: LocalCartItem) => i.selected).map((i: LocalCartItem) => i.id),
      );
      items.value = serverItems.map((item: CartItemResponse) => ({
        ...item,
        selected: existingSelectedIds.size > 0 ? existingSelectedIds.has(item.id) : true,
      }));
    }

    function removeItem(id: number) {
      items.value = items.value.filter((i: LocalCartItem) => i.id !== id);
    }

    function updateQuantity(id: number, quantity: number) {
      const item = items.value.find((i: LocalCartItem) => i.id === id);
      if (item) {
        item.quantity = Math.max(1, quantity);
      }
    }

    function toggleSelect(id: number) {
      const item = items.value.find((i: LocalCartItem) => i.id === id);
      if (item) {
        item.selected = !item.selected;
      }
    }

    function selectAll(selected: boolean) {
      items.value.forEach((item: LocalCartItem) => {
        item.selected = selected;
      });
    }

    function clearSelected() {
      items.value = items.value.filter((i: LocalCartItem) => !i.selected);
    }

    function clearAll() {
      items.value = [];
    }

    return {
      items,
      totalCount,
      selectedItems,
      totalPrice,
      isEmpty,
      syncFromServer,
      removeItem,
      updateQuantity,
      toggleSelect,
      selectAll,
      clearSelected,
      clearAll,
    };
  },
  {
    persist: {
      key: 'halo-mall-cart',
      storage: {
        getItem: (key: string) => uni.getStorageSync(key),
        setItem: (key: string, value: string) => uni.setStorageSync(key, value),
      },
    },
  },
);
