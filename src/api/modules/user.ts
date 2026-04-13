import { alovaInst } from '@/utils/request';
import type { DetailedUser, User } from '@halo-dev/api-client';

const api = alovaInst;

export const userApi = {
  /**
   * Fetch current logged-in user info
   */
  getProfile: (options: { skipAuthInit?: boolean } = {}) =>
    api.Get<DetailedUser>('/apis/api.console.halo.run/v1alpha1/users/-', {
      meta: {
        skipAuthInit: options.skipAuthInit ?? false,
      },
    }),

  /**
   * Update current user info
   */
  updateProfile: (payload: Partial<User['spec']>) =>
    api.Put<User>('/apis/uc.api.halo.run/v1alpha1/users/-', payload),
};
