import { alovaInst } from '@/utils/request';
import { useUserStore } from '@/store';
import { createCheckoutClient } from '@/helpers/checkout';

export const checkoutApi = createCheckoutClient({
  owner: () => useUserStore().profile?.metadata?.name ?? '',
  request: (input) =>
    alovaInst.Post(input.path, input.data, { meta: { checkoutOwner: input.owner } }).send(),
});
