import { defineMock } from '@alova/mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type { LogisticsInfo, LogisticsStatus } from '@/types/logistics';

const CARRIERS = ['顺丰速运', '中通快递', '圆通速递', '韵达快递', '京东物流'];

const TRACK_TEMPLATES: Record<LogisticsStatus, string[][]> = {
  IN_TRANSIT: [
    [
      '已离开 [上海转运中心]，发往 [北京分拨中心]',
      '[上海转运中心] 已收入',
      '包裹已揽收，感谢选择中通快递',
      '商家已下单，等待快递员揽收',
    ],
    [
      '已到达 [北京分拨中心]，正在分拣',
      '已离开 [郑州转运中心]，发往 [北京]',
      '[郑州转运中心] 已收入',
      '包裹已揽收',
      '商家已发货',
    ],
  ],
  DELIVERED: [
    [
      '您的快递已签收，签收人：本人，感谢使用顺丰速运',
      '快件到达 [北京朝阳区望京营业部]，准备派送',
      '正在派送中，派送员：张师傅，联系电话：138****0000',
      '已到达 [北京分拨中心]，正在分拣',
      '[上海转运中心] 已收入',
      '包裹已揽收',
    ],
  ],
  PENDING: [['商家已下单，等待快递员揽收'], ['商家已发货，等待揽收']],
  PICKED_UP: [['包裹已揽收，感谢选择中通快递', '商家已下单']],
  EXCEPTION: [
    [
      '快件异常：无人签收，已放置快递柜，请及时取件',
      '快件到达 [北京朝阳区营业部]，准备派送',
      '已到达 [北京分拨中心]',
      '包裹已揽收',
    ],
  ],
};

const DELIVERY_ESTIMATE: Record<LogisticsStatus, string> = {
  IN_TRANSIT: '预计明天送达',
  DELIVERED: '已于昨天签收',
  PENDING: '商家正在备货',
  PICKED_UP: '预计3天内送达',
  EXCEPTION: '配送异常，请联系客服',
};

function generateTracks(status: LogisticsStatus) {
  const templateGroups = TRACK_TEMPLATES[status];
  const descriptions = faker.helpers.arrayElement(templateGroups);

  const baseDate = new Date();
  return descriptions.map((description, index) => {
    const date = new Date(baseDate.getTime() - index * 6 * 3600 * 1000);
    const time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    return { description, time };
  });
}

export default defineMock({
  /**
   * Logistics details
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/logistics
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/logistics': () => {
    const status = faker.helpers.arrayElement<LogisticsStatus>([
      'IN_TRANSIT',
      'DELIVERED',
      'IN_TRANSIT',
      'IN_TRANSIT',
    ]);

    return {
      carrier: faker.helpers.arrayElement(CARRIERS),
      trackingNumber: faker.string.numeric(12),
      status,
      deliveryEstimate: DELIVERY_ESTIMATE[status],
      productImage: faker.image.urlPicsumPhotos({ width: 200, height: 200 }),
      productTitle: faker.helpers.arrayElement([
        '简约多功能商务双肩包 极简黑 15.6寸电脑适用',
        '2024新款法式复古碎花连衣裙中长款收腰显瘦气质长裙',
        '日系简约纯棉透气防晒外套男女同款休闲夹克',
        '高腰显瘦牛仔裤女直筒宽松小个子九分裤',
      ]),
      totalQuantity: faker.number.int({ min: 1, max: 3 }),
      tracks: generateTracks(status),
    } satisfies LogisticsInfo;
  },
});
