import { defineMock } from '@alova/mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type { Banner, QuickEntry } from '@halo-dev/api-client';

/**
 * Home aggregate data mock
 * Note: used to align with the latest Mini Program home API
 */
function generateBanner(): Banner {
  const linkType = faker.helpers.arrayElement(['product', 'category', 'none'] as const);
  return {
    title: faker.commerce.productName(),
    description: faker.helpers.arrayElement([
      '秋冬流行趋势，抢先上新',
      '春夏新品发布，清爽来袭',
      '限时特惠，好物低价不等人',
      '品质生活，从这里开始',
      '爆款热销，口碑之选',
      '全场满减，超值优惠等你来',
      '新品上市，尝鲜价限时抢购',
      '甄选好货，匠心品质',
    ]),
    imageUrl: faker.image.urlPicsumPhotos({ width: 750, height: 300 }),
    linkType,
    linkValue: linkType === 'none' ? '' : String(faker.number.int({ min: 1, max: 20 })),
    priority: faker.number.int({ min: 0, max: 10 }),
  };
}

function generateQuickEntry(): QuickEntry {
  const linkType = faker.helpers.arrayElement(['product', 'category', 'none'] as const);
  return {
    title: faker.helpers.arrayElement([
      '新品上市',
      '热销榜单',
      '品牌特惠',
      '限时秒杀',
      '精选好物',
      '换季折扣',
      '明星同款',
      '今日推荐',
    ]),
    imageUrl: faker.image.urlPicsumPhotos({ width: 160, height: 160 }),
    linkType,
    linkValue: linkType === 'none' ? '' : String(faker.number.int({ min: 1, max: 20 })),
    priority: faker.number.int({ min: 0, max: 10 }),
  };
}

export default defineMock({
  /**
   * Home banner list
   */
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/banners': () =>
    Array.from({ length: 4 }).map(() => generateBanner()),

  /**
   * Home quick entry list
   */
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/quick-entries': () =>
    Array.from({ length: 8 }).map(() => generateQuickEntry()),
});
