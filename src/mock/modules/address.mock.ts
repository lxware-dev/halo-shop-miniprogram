import { defineMock } from '@alova/mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type { UserAddressResponse, AddressEntryResponse } from '@halo-dev/api-client';

/**
 * Province data
 */
const PROVINCES: AddressEntryResponse[] = [
  { code: '110000', name: '北京市' },
  { code: '310000', name: '上海市' },
  { code: '440000', name: '广东省' },
  { code: '330000', name: '浙江省' },
  { code: '320000', name: '江苏省' },
  { code: '510000', name: '四川省' },
  { code: '420000', name: '湖北省' },
  { code: '610000', name: '陕西省' },
];

/**
 * City data
 */
const CITIES_MAP: Record<string, AddressEntryResponse[]> = {
  '440000': [
    { code: '440100', name: '广州市' },
    { code: '440300', name: '深圳市' },
    { code: '440600', name: '佛山市' },
    { code: '441900', name: '东莞市' },
  ],
  '330000': [
    { code: '330100', name: '杭州市' },
    { code: '330200', name: '宁波市' },
    { code: '330300', name: '温州市' },
  ],
  '320000': [
    { code: '320100', name: '南京市' },
    { code: '320500', name: '苏州市' },
    { code: '320600', name: '南通市' },
  ],
  '110000': [{ code: '110100', name: '北京市' }],
  '310000': [{ code: '310100', name: '上海市' }],
};

/**
 * District/county data
 */
const AREAS_MAP: Record<string, AddressEntryResponse[]> = {
  '440100': [
    { code: '440103', name: '荔湾区' },
    { code: '440104', name: '越秀区' },
    { code: '440105', name: '海珠区' },
    { code: '440106', name: '天河区' },
  ],
  '440300': [
    { code: '440303', name: '罗湖区' },
    { code: '440304', name: '福田区' },
    { code: '440305', name: '南山区' },
    { code: '440306', name: '宝安区' },
  ],
  '330100': [
    { code: '330102', name: '上城区' },
    { code: '330105', name: '拱墅区' },
    { code: '330106', name: '西湖区' },
  ],
  '320100': [
    { code: '320102', name: '玄武区' },
    { code: '320104', name: '秦淮区' },
    { code: '320105', name: '建邺区' },
  ],
};

function generateAddress(id: number): UserAddressResponse {
  const province = faker.helpers.arrayElement(PROVINCES);
  const cities = CITIES_MAP[province.code ?? ''] ?? [{ code: '000000', name: '未知市' }];
  const city = faker.helpers.arrayElement(cities);
  const areas = AREAS_MAP[city.code ?? ''] ?? [{ code: '000000', name: '未知区' }];
  const area = faker.helpers.arrayElement(areas);

  return {
    id,
    customerId: 1,
    firstName: faker.person.lastName(),
    lastName: faker.person.firstName(),
    contactPhone: `1${faker.string.numeric(10)}`,
    province: province.name,
    provinceCode: province.code,
    city: city.name,
    cityCode: city.code,
    district: area.name,
    districtCode: area.code,
    streetAddress: `${faker.location.street()}${faker.number.int({ min: 1, max: 999 })}号${faker.number.int({ min: 1, max: 20 })}楼`,
    isDefault: id === 1,
    createdAt: faker.date.recent({ days: 90 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString(),
  };
}

let mockAddresses: UserAddressResponse[] = [generateAddress(1), generateAddress(2)];

export default defineMock({
  /**
   * Fetch user address list
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses': () => mockAddresses,

  /**
   * Fetch a single address
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/{id}
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/{id}': ({ params }) => {
    const id = Number(params.id);
    return mockAddresses.find((a) => a.id === id) ?? mockAddresses[0];
  },

  /**
   * Create address
   * POST /apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses
   */
  '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses': ({ data }) => {
    const id = mockAddresses.length + 1;
    const newAddr: UserAddressResponse = {
      id,
      customerId: 1,
      ...(data as object),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // If marked as default, unset all other defaults
    if (newAddr.isDefault) {
      mockAddresses.forEach((a) => {
        a.isDefault = false;
      });
    }
    mockAddresses.push(newAddr);
    return newAddr;
  },

  /**
   * Update address
   * PUT /apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/{id}
   */
  '[PUT]/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/{id}': ({ params, data }) => {
    const id = Number(params.id);
    const idx = mockAddresses.findIndex((a) => a.id === id);
    if (idx === -1) {
      return null;
    }

    const updated: UserAddressResponse = {
      ...mockAddresses[idx],
      ...(data as object),
      id,
      updatedAt: new Date().toISOString(),
    };
    if (updated.isDefault) {
      mockAddresses.forEach((a) => {
        a.isDefault = false;
      });
    }
    mockAddresses[idx] = updated;
    return updated;
  },

  /**
   * Delete address
   * DELETE /apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/{id}
   */
  '[DELETE]/apis/uc.api.ecommerce.halo.run/v1alpha1/user-addresses/{id}': ({ params }) => {
    const id = Number(params.id);
    mockAddresses = mockAddresses.filter((a) => a.id !== id);
    return null;
  },

  /**
   * Fetch province list
   * GET /apis/api.ecommerce.halo.run/v1alpha1/provinces
   */
  '[GET]/apis/api.ecommerce.halo.run/v1alpha1/provinces': () => PROVINCES,

  /**
   * Fetch city list
   * GET /apis/api.ecommerce.halo.run/v1alpha1/provinces/{provinceCode}/cities
   */
  '[GET]/apis/api.ecommerce.halo.run/v1alpha1/provinces/{provinceCode}/cities': ({ params }) => {
    return CITIES_MAP[params.provinceCode] ?? [];
  },

  /**
   * Fetch district/county list
   * GET /apis/api.ecommerce.halo.run/v1alpha1/cities/{cityCode}/areas
   */
  '[GET]/apis/api.ecommerce.halo.run/v1alpha1/cities/{cityCode}/areas': ({ params }) => {
    return AREAS_MAP[params.cityCode] ?? [];
  },
});
