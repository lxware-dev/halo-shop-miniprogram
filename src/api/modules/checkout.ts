import { alovaInst } from '@/utils/request';
import { useUserStore } from '@/store';
import { createCheckoutClient } from '@/helpers/checkout';

export const checkoutApi = createCheckoutClient({
  owner: () => useUserStore().profile?.metadata?.name ?? '',
  // Enable real promotion requests after adapting to the final contract of halo-pro#670.
  promotionsEnabled: import.meta.env.VITE_MOCK_ENABLED === 'true',
  request: async (input) => {
    const config = {
      meta: {
        checkoutOwner: input.owner,
        handledErrorStatuses: input.handleValidationError ? [400] : [],
      },
    };
    return alovaInst.Post(input.path, input.data, config).send();
  },
});
