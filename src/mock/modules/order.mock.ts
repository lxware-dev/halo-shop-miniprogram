import { defineMock } from '@alova/mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type {
  OrderResponse,
  OrderItemResponse,
  OrderShippingAddress,
  CustomerResponse,
  ProductVariantSnapshot,
  PaymentMethodPublicResponse,
  FulfillmentUcResponse,
} from '@halo-dev/api-client';
import {
  FulfillmentUcResponseStatusEnum,
  FulfillmentUcResponseTypeEnum,
} from '@halo-dev/api-client';
import type { PageResponse } from '@/types/api';
import { createdOrdersMap } from './checkout.mock';

function generateShippingAddress(): OrderShippingAddress {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    contactPhone: `1${faker.string.numeric(10)}`,
    province: faker.helpers.arrayElement(['广东省', '北京市', '上海市', '浙江省', '江苏省']),
    provinceCode: faker.string.numeric(6),
    city: faker.helpers.arrayElement(['广州市', '深圳市', '杭州市', '南京市', '苏州市']),
    cityCode: faker.string.numeric(6),
    district: faker.helpers.arrayElement(['天河区', '福田区', '西湖区', '玄武区', '姑苏区']),
    districtCode: faker.string.numeric(6),
    streetAddress: `${faker.location.street()}${faker.number.int({ min: 1, max: 999 })}号`,
    postalCode: faker.string.numeric(6),
  };
}

function generateOrderItem(productId: number, shippingRequired: boolean): OrderItemResponse {
  const price = Number(faker.commerce.price({ min: 29.9, max: 599 }));
  const quantity = faker.number.int({ min: 1, max: 3 });
  const variantSnapshot: ProductVariantSnapshot = {
    productVariantId: productId * 10 + 1,
    skuCode: `SKU-${productId}-1`,
    imageUrl: faker.image.urlPicsumPhotos({ width: 200, height: 200 }),
    shippingRequired,
    specValues: [
      {
        specId: 'color',
        name: '颜色',
        value: faker.helpers.arrayElement(['黑色', '白色', '米白色', '卡其色']),
      },
      {
        specId: 'size',
        name: '尺码',
        value: faker.helpers.arrayElement(['S', 'M', 'L', 'XL']),
      },
    ],
    weightG: faker.number.int({ min: 100, max: 2000 }),
  };

  return {
    productId,
    productVariantId: productId * 10 + 1,
    itemTitle: faker.helpers.arrayElement([
      '2024新款法式复古碎花连衣裙中长款收腰显瘦气质长裙',
      '日系简约纯棉透气防晒外套男女同款休闲夹克',
      '高腰显瘦牛仔裤女直筒宽松小个子九分裤',
      '复古港风格子西装外套女小个子英伦风',
      '软糯奶fufu针织毛衣女秋冬宽松慵懒风',
    ]),
    itemImageUrl: faker.image.urlPicsumPhotos({ width: 200, height: 200 }),
    unitPrice: price,
    quantity,
    productVariantSnapshot: variantSnapshot,
    fulfilledQuantity: 0,
    refundedQuantity: 0,
  };
}

const PAYMENT_STATUSES = ['PENDING', 'PAID', 'REFUNDED', 'FAILED', 'CANCELLED'] as const;
const FULFILLMENT_STATUSES = ['PENDING', 'PROCESSING', 'FULFILLED'] as const;
const ORDER_STATUSES = ['OPEN', 'ARCHIVED', 'CANCELLED'] as const;

function generateOrder(index: number): OrderResponse {
  const orderRequiresShipping = faker.datatype.boolean();
  const items = Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, (_, i) =>
    generateOrderItem(i + 1, orderRequiresShipping),
  );
  const saleTotalAmount = items.reduce(
    (sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 1),
    0,
  );
  const shippingFee = orderRequiresShipping && saleTotalAmount < 99 ? 10 : 0;
  const totalAmount = Number((saleTotalAmount + shippingFee).toFixed(2));
  const paymentStatus = faker.helpers.arrayElement(PAYMENT_STATUSES);
  const fulfillmentStatus =
    paymentStatus === 'PAID' && orderRequiresShipping
      ? faker.helpers.arrayElement(FULFILLMENT_STATUSES)
      : 'PENDING';
  const customer: CustomerResponse = {
    id: 1,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    phone: `1${faker.string.numeric(10)}`,
    email: faker.internet.email(),
    status: 'ACTIVE',
    type: 'USER',
    ordersCount: faker.number.int({ min: 1, max: 50 }),
    totalSpent: faker.number.float({ min: 100, max: 50000, fractionDigits: 2 }),
  };

  return {
    orderCode: `ORD${Date.now()}${String(index).padStart(4, '0')}`,
    status: faker.helpers.arrayElement(ORDER_STATUSES),
    paymentStatus,
    fulfillmentStatus,
    refundStatus: 'NONE',
    totalAmount: Number(totalAmount.toFixed(2)),
    items,
    shippingAddress: orderRequiresShipping ? generateShippingAddress() : undefined,
    customer,
    customerNotes: faker.datatype.boolean() ? faker.lorem.sentence() : undefined,
    createdAt: faker.date.recent({ days: 90 }).toISOString(),
    updatedAt: faker.date.recent({ days: 30 }).toISOString(),
    paidAt: paymentStatus === 'PAID' ? faker.date.recent({ days: 60 }).toISOString() : undefined,
  };
}

function requiresShipping(order: OrderResponse): boolean {
  const items = order.items ?? [];
  if (!items.length) {
    return false;
  }
  return items.some((item) => item.productVariantSnapshot?.shippingRequired !== false);
}

/**
 * Pre-generated historical orders (fixed list)
 */
const HISTORICAL_ORDERS = Array.from({ length: 15 }, (_, i) => generateOrder(i + 1));

function getAllOrders(): OrderResponse[] {
  const newOrders: OrderResponse[] = Array.from(createdOrdersMap.values(), (mock) => {
    const customer: CustomerResponse = {
      id: 1,
      firstName: '前',
      lastName: '当',
      phone: '13800000000',
      status: 'ACTIVE',
      type: 'USER',
    };
    const items: OrderItemResponse[] = mock.items.map((item) => ({
      productId: item.product?.id,
      productVariantId: item.productVariant?.id,
      itemTitle: item.product?.title ?? '商品',
      itemImageUrl: item.productVariant?.imageUrl ?? item.product?.coverImageUrl,
      unitPrice: item.price,
      quantity: item.quantity,
      productVariantSnapshot: {
        productVariantId: item.productVariant?.id,
        imageUrl: item.productVariant?.imageUrl,
        specValues: item.productVariant?.specValues ?? [],
        shippingRequired: item.productVariant?.shippingRequired ?? true,
      },
      fulfilledQuantity: 0,
      refundedQuantity: 0,
    }));

    return {
      orderCode: mock.orderCode,
      status: 'OPEN',
      paymentStatus: 'PENDING',
      fulfillmentStatus: 'PENDING',
      refundStatus: 'NONE',
      totalAmount: mock.payableAmount,
      items,
      shippingAddress: generateShippingAddress(),
      customer,
      createdAt: mock.createdAt,
      updatedAt: mock.createdAt,
    };
  });

  // Latest orders appear first
  return [...newOrders.reverse(), ...HISTORICAL_ORDERS];
}

/**
 * Payment session status store
 * sessionCode -> status (the first query returns PENDING, and the second returns the final result)
 */
const sessionStatusMap = new Map<
  string,
  { status: string; queryCount: number; finalStatus: 'SUCCESS' | 'FAILED' }
>();

export default defineMock({
  /**
   * Paginated order list
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/orders
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders': ({ query }) => {
    const page = Number(query?.page ?? 0);
    const size = Number(query?.size ?? 10);
    const paymentStatuses = query?.paymentStatuses as string[] | undefined;
    const fulfillmentStatuses = query?.fulfillmentStatuses as string[] | undefined;
    const statuses = query?.statuses as string[] | undefined;

    let filtered = getAllOrders();
    if (paymentStatuses?.length) {
      filtered = filtered.filter((o) => paymentStatuses.includes(o.paymentStatus ?? ''));
    }
    if (fulfillmentStatuses?.length) {
      filtered = filtered.filter((o) => fulfillmentStatuses.includes(o.fulfillmentStatus ?? ''));
    }
    if (statuses?.length) {
      filtered = filtered.filter((o) => statuses.includes(o.status ?? ''));
    }

    const total = filtered.length;
    const content = filtered.slice(page * size, (page + 1) * size);

    return {
      content,
      totalElements: total,
      totalPages: Math.ceil(total / size),
      number: page,
      size,
      first: page === 0,
      last: page >= Math.ceil(total / size) - 1,
      empty: content.length === 0,
      numberOfElements: content.length,
    } satisfies PageResponse<OrderResponse>;
  },

  /**
   * Order details
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}': ({ params }) => {
    const all = getAllOrders();
    return all.find((o) => o.orderCode === params.orderCode) ?? all[0];
  },

  /**
   * Order fulfillment info
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/fulfillments
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/fulfillments': ({ params }) => {
    const all = getAllOrders();
    const order = all.find((o) => o.orderCode === params.orderCode);
    // Non-physical or unpaid orders have no fulfillment info
    if (!order || order.paymentStatus !== 'PAID' || !requiresShipping(order)) {
      return [];
    }
    return [
      {
        status: FulfillmentUcResponseStatusEnum.Pending,
        type: FulfillmentUcResponseTypeEnum.Shipping,
        items: [],
        labels: [
          {
            trackingNumber: faker.string.alphanumeric(12).toUpperCase(),
            carrier: faker.helpers.arrayElement(['顺丰速运', '中通快递', '圆通速递', '韵达快递']),
          },
        ],
      } satisfies FulfillmentUcResponse,
    ];
  },

  /**
   * Available payment methods for an order
   * GET /apis/mp.api.ecommerce.halo.run/v1alpha1/payment-methods
   */
  '[GET]/apis/mp.api.ecommerce.halo.run/v1alpha1/payment-methods': () => {
    return [
      {
        enabled: true,
        icon: 'string',
        id: 0,
        name: 'string',
        provider: 'WECHAT_PAY',
        providerDisplayName: 'string',
        providerIconUrl: 'string',
        scene: 'MINI_PROGRAM',
      },
    ] satisfies PaymentMethodPublicResponse[];
  },

  /**
   * Initiate order payment
   * In mock mode, if package.prepay_id starts with mock_, the frontend skips uni.requestPayment and enters polling directly.
   * POST /apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/initiate-payment
   */
  '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/initiate-payment': ({
    params,
  }) => {
    const sessionCode = `pay_${params.orderCode}_${faker.string.alphanumeric(16)}`;
    const finalStatus = faker.helpers.arrayElement(['SUCCESS', 'FAILED'] as const);
    sessionStatusMap.set(sessionCode, { status: 'PENDING', queryCount: 0, finalStatus });
    const prepayId = `mock_prepay_${faker.string.alphanumeric(20)}`;

    return {
      sessionCode,
      paymentProvider: 'WECHAT_PAY',
      paymentScene: 'MINI_PROGRAM',
      payload: {
        success: true,
        responseType: 'MINI_PROGRAM',
        payload: {
          wechatPay: {
            jsapi: {
              package: `prepay_id=${prepayId}`,
              timeStamp: String(Math.floor(Date.now() / 1000)),
              nonceStr: faker.string.alphanumeric(32),
              signType: 'RSA',
              paySign: `mock_sign_${faker.string.alphanumeric(32)}`,
            },
          },
        },
      },
    };
  },

  /**
   * Confirm receipt
   * POST /apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/mark-as-received
   */
  '[POST]/apis/uc.api.ecommerce.halo.run/v1alpha1/orders/{orderCode}/mark-as-received': () => null,

  /**
   * Query payment session status (polling endpoint)
   * GET /apis/uc.api.ecommerce.halo.run/v1alpha1/payment-sessions/{sessionCode}/status
   *
   * Simulate real-world behavior:
   * 1) The first query returns PENDING
   * 2) Starting from the second query, return the final status (SUCCESS / FAILED, each with a 50% chance when the session is created)
   */
  '[GET]/apis/uc.api.ecommerce.halo.run/v1alpha1/payment-sessions/{sessionCode}/status': ({
    params,
  }) => {
    const session = sessionStatusMap.get(params.sessionCode);
    if (!session) {
      // Return SUCCESS for unknown sessionCode values (for example, when entering the result page directly from URL params)
      return 'SUCCESS';
    }

    session.queryCount += 1;
    if (session.queryCount >= 2) {
      session.status = session.finalStatus;
    }
    return session.status;
  },
});
