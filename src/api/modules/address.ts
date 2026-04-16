import { alovaInst } from '@/utils/request';
import type {
  UserAddressResponse,
  UserAddressUpsertRequest,
  AddressEntryResponse,
} from '@halo-dev/api-client';

const api = alovaInst;

export const addressApi = {
  /**
   * Fetch the current user's address list
   */
  getAddresses: () =>
    api.Get<UserAddressResponse[]>('/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses'),

  /**
   * Fetch single address details
   */
  getAddress: (id: number) =>
    api.Get<UserAddressResponse>(`/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/${id}`),

  /**
   * Create a shipping address
   */
  createAddress: (payload: UserAddressUpsertRequest) =>
    api.Post<UserAddressResponse>(
      '/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses',
      payload,
    ),

  /**
   * Update a shipping address
   */
  updateAddress: (id: number, payload: UserAddressUpsertRequest) =>
    api.Put<UserAddressResponse>(
      `/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/${id}`,
      payload,
    ),

  /**
   * Delete a shipping address
   */
  deleteAddress: (id: number) =>
    api.Delete(`/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/${id}`),

  /**
   * Fetch province list
   */
  getProvinces: () =>
    api.Get<AddressEntryResponse[]>('/apis/api.ecommerce.halo.run/v1alpha1/provinces'),

  /**
   * Fetch city list
   */
  getCities: (provinceCode: string) =>
    api.Get<AddressEntryResponse[]>(
      `/apis/api.ecommerce.halo.run/v1alpha1/provinces/${provinceCode}/cities`,
    ),

  /**
   * Fetch district/county list
   */
  getAreas: (cityCode: string) =>
    api.Get<AddressEntryResponse[]>(
      `/apis/api.ecommerce.halo.run/v1alpha1/cities/${cityCode}/areas`,
    ),
};
