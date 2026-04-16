import { faker } from '@faker-js/faker/locale/zh_CN';
import type { ProductCategoryResponse } from '@halo-dev/api-client';

function generateChild(id: number, parentId: number, name: string): ProductCategoryResponse {
  return {
    id,
    parentId,
    name,
    slug: name,
    image: faker.image.urlPicsumPhotos({ width: 200, height: 200 }),
  };
}

function generateCategory(
  id: number,
  name: string,
  childNames: string[],
  idBase: number,
): ProductCategoryResponse {
  return {
    id,
    name,
    slug: name,
    image: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
    children: childNames.map((childName, i) => generateChild(idBase + i, id, childName)),
  };
}

/**
 * Top-level categories + child-category tree
 */
export const CATEGORY_TREES: ProductCategoryResponse[] = [
  generateCategory(
    1,
    '潮流服饰',
    [
      '品质外套',
      '潮流上衣',
      '时尚裤装',
      '优雅长裙',
      '精美配饰',
      '运动鞋',
      '高跟鞋',
      '休闲鞋',
      '帆布鞋',
      '凉拖鞋',
    ],
    101,
  ),
  generateCategory(
    2,
    '数码家电',
    ['手机', '平板', '耳机', '智能手表', '相机', '冰箱', '洗衣机', '空调', '微波炉', '吸尘器'],
    201,
  ),
  generateCategory(
    3,
    '美妆护肤',
    ['洁面', '精华', '面霜', '面膜', '防晒', '口红', '粉底', '眼影', '睫毛膏', '腮红'],
    301,
  ),
  generateCategory(
    4,
    '居家生活',
    ['床品', '收纳', '厨具', '灯具', '装饰', '洗衣液', '洗碗机', '地板清洁', '空气清新', '垃圾袋'],
    401,
  ),
  generateCategory(
    5,
    '零食特产',
    [
      '坚果',
      '糖果',
      '饼干',
      '果干',
      '茶叶',
      '云南火腿',
      '新疆葡萄干',
      '四川腊肉',
      '西藏牦牛肉',
      '东北大米',
    ],
    501,
  ),
  generateCategory(
    6,
    '母婴童装',
    [
      '婴儿车',
      '奶粉',
      '纸尿裤',
      '安抚玩具',
      '婴儿床',
      '童装上衣',
      '童装裤子',
      '童鞋',
      '儿童外套',
      '校服',
    ],
    601,
  ),
  generateCategory(
    7,
    '运动户外',
    ['跑步鞋', '健身服', '瑜伽垫', '哑铃', '跳绳', '登山包', '帐篷', '登山鞋', '冲锋衣', '望远镜'],
    701,
  ),
  generateCategory(
    8,
    '宠物生活',
    [
      '猫粮',
      '狗粮',
      '猫窝',
      '狗窝',
      '宠物玩具',
      '宠物沐浴露',
      '宠物梳子',
      '驱虫药',
      '宠物牙刷',
      '宠物香水',
    ],
    801,
  ),
];

/**
 * Top-level category list (used for global filters on the product list page)
 */
export const TOP_CATEGORIES: ProductCategoryResponse[] = CATEGORY_TREES.map(
  ({ id, name, slug }) => ({
    id,
    name,
    slug,
  }),
);

/**
 * Flat list of all child categories (includes the parent top-level category ID and is used to build filter options)
 */
export interface FlatSubCategory {
  id: number;
  name: string;
  parentId: number;
}

export const FLAT_SUB_CATEGORIES: FlatSubCategory[] = CATEGORY_TREES.flatMap((tree) =>
  (tree.children ?? []).map((child) => ({
    id: child.id!,
    name: child.name!,
    parentId: tree.id!,
  })),
);
