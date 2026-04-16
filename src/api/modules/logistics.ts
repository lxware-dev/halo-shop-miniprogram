import { alovaInst } from '@/utils/request';
import type { LogisticsInfo } from '@/types/logistics';

const api = alovaInst;

export const logisticsApi = {
  /**
   * Fetch order logistics info
   */
  getLogistics: (orderCode: string) =>
    api.Get<LogisticsInfo>(
      `/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/${orderCode}/logistics`,
    ),
};
