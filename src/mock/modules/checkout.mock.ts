import { defineMock } from '@alova/mock';
import { applyMockPromotions, consumeMockCoupons } from './coupon.mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type {
  CheckoutContextResponse,
  CheckoutItemResponse,
  CalculateResult,
  MpCheckoutSubmitRequest,
  OrderCreateResponse,
  PaymentMethodPublicResponse,
  PrepareCheckoutRequest,
  UserAddressUpsertRequest,
  OrderResponse,
} from '@halo-dev/api-client';

/**
 * New orders created after checkout submission are stored in this map and read by order.mock.ts
 */
type CheckoutItemWithCartId = CheckoutItemResponse & {
  cartItemId?: number;
};

export interface MockCreatedOrder extends Pick<
  OrderResponse,
  | 'subtotalAmount'
  | 'shippingAmount'
  | 'couponDiscountAmount'
  | 'appliedCoupons'
  | 'discountAmount'
  | 'discountCode'
  | 'discountName'
> {
  orderCode: string;
  contextId?: string;
  totalAmount: number;
  payableAmount: number;
  items: CheckoutItemResponse[];
  selectedAddressId?: number;
  customerNotes?: string;
  createdAt: string;
}

export const createdOrdersMap = new Map<string, MockCreatedOrder>();

function generateInlineUserAddress(): UserAddressUpsertRequest {
  return {
    firstName: faker.person.lastName(),
    lastName: faker.person.firstName(),
    contactPhone: `1${faker.string.numeric(10)}`,
    provinceCode: '440000',
    cityCode: '440100',
    districtCode: '440106',
    streetAddress: `${faker.location.street()}${faker.number.int({ min: 1, max: 999 })}号`,
  };
}

function generateCheckoutContext(
  contextId: string,
  source?: PrepareCheckoutRequest['source'],
  sourceItems?: PrepareCheckoutRequest['items'],
  selectedAddressId?: number,
): CheckoutContextResponse {
  const itemCount = Math.max(sourceItems?.length ?? 0, 1);
  const items: CheckoutItemWithCartId[] = Array.from({ length: itemCount }, (_, i) => {
    const price = Number(faker.commerce.price({ min: 29.9, max: 599 }));
    const item: CheckoutItemWithCartId = {
      quantity: faker.number.int({ min: 1, max: 3 }),
      price,
      product: {
        id: i + 1,
        title: faker.helpers.arrayElement([
          '2024新款法式复古碎花连衣裙中长款收腰显瘦气质长裙',
          '日系简约纯棉透气防晒外套男女同款休闲夹克',
          '高腰显瘦牛仔裤女直筒宽松小个子九分裤',
          '复古港风格子西装外套女小个子英伦风',
          '软糯奶fufu针织毛衣女秋冬宽松慵懒风',
        ]),
        coverImageUrl: faker.image.urlPicsumPhotos({ width: 300, height: 300 }),
        status: 'PUBLISHED',
        productType: 'PHYSICAL',
        minPrice: price,
        maxPrice: price,
      },
      productVariant: {
        id: sourceItems?.[i]?.productVariantId ?? (i + 1) * 10 + 1,
        productId: i + 1,
        price,
        stock: faker.number.int({ min: 10, max: 200 }),
        status: 'PUBLISHED',
        specValues: [
          {
            specId: 'color',
            name: '颜色',
            value: faker.helpers.arrayElement(['米白色', '象牙白', '浅粉色', '天蓝色', '卡其色']),
          },
          {
            specId: 'size',
            name: '尺码',
            value: faker.helpers.arrayElement(['S', 'M', 'L', 'XL']),
          },
        ],
        imageUrl: faker.image.urlPicsumPhotos({ width: 200, height: 200 }),
      },
    };
    if (source === 'CART') {
      item.cartItemId = sourceItems?.[i]?.cartItemId;
      item.quantity = sourceItems?.[i]?.quantity ?? item.quantity;
    } else if (source === 'BUY_NOW') {
      item.quantity = sourceItems?.[i]?.quantity ?? item.quantity;
    }
    return item;
  });

  const originalTotalAmount = items.reduce(
    (sum, item) => sum + (item.price ?? 0) * 1.25 * (item.quantity ?? 1),
    0,
  );
  const saleTotalAmount = items.reduce(
    (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1),
    0,
  );
  // Free shipping for orders over 99 yuan
  const shippingFee = saleTotalAmount >= 99 ? 0 : 10;
  const totalDiscountAmount = Number((originalTotalAmount - saleTotalAmount).toFixed(2));
  const payableAmount = saleTotalAmount + shippingFee;

  const calculateResult: CalculateResult = {
    originalTotalAmount: Number(originalTotalAmount.toFixed(2)),
    saleTotalAmount: Number(saleTotalAmount.toFixed(2)),
    shippingFeeAmount: shippingFee,
    totalDiscountAmount,
    payableAmount: Number(payableAmount.toFixed(2)),
    itemDetails: items.map((item) => ({
      productVariantId: item.productVariant?.id,
      originalPrice: Number(((item.price ?? 0) * 1.25).toFixed(2)),
      salePrice: item.price,
      quantity: item.quantity,
    })),
    shippingDetails:
      shippingFee > 0
        ? [
            {
              shippingRateId: 1,
              shippingFee,
              shippingRateName: '标准快递',
              productVariantId: undefined,
              productVariantName: undefined,
              description: '预计 3-5 个工作日送达',
            },
          ]
        : [],
  };

  const paymentMethods: PaymentMethodPublicResponse[] = [
    {
      id: 1,
      name: '微信支付',
      provider: 'WECHAT_PAY',
      enabled: true,
    },
    {
      id: 2,
      name: '支付宝',
      provider: 'ALIPAY',
      enabled: true,
    },
    {
      id: 3,
      name: '银联支付',
      provider: 'BANK_TRANSFER',
      enabled: true,
    },
  ];

  return {
    id: contextId,
    isShippingRequired: true,
    items,
    calculateResult,
    availablePaymentMethods: paymentMethods,
    selectedAddressId,
    userAddress: selectedAddressId ? undefined : generateInlineUserAddress(),
    source: source ?? (contextId.startsWith('buynow_') ? 'BUY_NOW' : 'CART'),
  };
}

// Generate a unique order number (timestamp + random suffix)
function generateOrderCode(): string {
  const ts = Date.now().toString().slice(-10);
  const rand = faker.string.numeric(4);
  return `ORD${ts}${rand}`;
}

const baseContextCache = new Map<string, CheckoutContextResponse>();

const contextCache = new Map<string, CheckoutContextResponse>();

function getSubmitItemsKey(items?: MpCheckoutSubmitRequest['items']): string {
  return (items ?? [])
    .map((item) => `${item.cartItemId ?? item.productVariantId ?? 'x'}:${item.quantity ?? 1}`)
    .sort()
    .join('|');
}

function resolveContextBySubmitPayload(payload: MpCheckoutSubmitRequest): CheckoutContextResponse {
  const submitItemsKey = getSubmitItemsKey(payload.items);
  const matched = [...contextCache.values()].find((ctx) => {
    if ((ctx.source ?? 'CART') !== payload.source) {
      return false;
    }
    const ctxItemsKey = getSubmitItemsKey(
      (ctx.items ?? []).map((item) => ({
        cartItemId: (item as CheckoutItemWithCartId).cartItemId,
        productVariantId: item.productVariant?.id,
        quantity: item.quantity ?? 1,
      })),
    );
    return ctxItemsKey === submitItemsKey;
  });
  return (
    matched ??
    generateCheckoutContext(
      faker.string.uuid(),
      payload.source,
      payload.items,
      payload.selectedAddressId,
    )
  );
}

function createContext(body: PrepareCheckoutRequest) {
  const id = faker.string.uuid();
  const key = `${body.source}:${getSubmitItemsKey(body.items)}`;
  const base =
    baseContextCache.get(key) ??
    generateCheckoutContext(id, body.source, body.items, body.selectedAddressId);
  baseContextCache.set(key, base);
  const context = { ...base, id, selectedAddressId: body.selectedAddressId };
  contextCache.set(id, context);
  return context;
}

function priceContext(context: CheckoutContextResponse, code?: string, ids?: number[]) {
  const key = `${context.source}:${getSubmitItemsKey(
    (context.items ?? []).map((item) => ({
      cartItemId: (item as CheckoutItemWithCartId).cartItemId,
      productVariantId: item.productVariant?.id,
      quantity: item.quantity ?? 1,
    })),
  )}`;
  const base = baseContextCache.get(key) ?? context;
  context.calculateResult = applyMockPromotions(base.calculateResult!, code, ids);
  return context;
}

function createOrder(
  context: CheckoutContextResponse,
  body: Pick<MpCheckoutSubmitRequest, 'selectedAddressId' | 'customerNotes'>,
) {
  const result = context.calculateResult!;
  if (result.rejectedCoupons?.length) {
    throw Object.assign(new Error('订单优惠已变化，请重新确认'), {
      status: 400,
      title: 'Bad Request',
    });
  }
  const orderCode = generateOrderCode();
  createdOrdersMap.set(orderCode, {
    orderCode,
    contextId: context.id,
    totalAmount: result.payableAmount ?? 0,
    payableAmount: result.payableAmount ?? 0,
    subtotalAmount: result.saleTotalAmount,
    shippingAmount: result.shippingFeeAmount,
    couponDiscountAmount: result.couponDiscountAmount,
    appliedCoupons: result.appliedCoupons,
    discountAmount: result.discountAmount,
    discountCode: result.discountCode,
    discountName: result.discountName,
    items: context.items ?? [],
    selectedAddressId: body.selectedAddressId,
    customerNotes: body.customerNotes,
    createdAt: new Date().toISOString(),
  });
  consumeMockCoupons(
    (result.appliedCoupons ?? []).flatMap((coupon) =>
      coupon.customerCouponId ? [coupon.customerCouponId] : [],
    ),
    orderCode,
  );
  return {
    order: { orderCode, paymentStatus: result.payableAmount === 0 ? 'PAID' : 'PENDING' },
  } satisfies OrderCreateResponse;
}

function withProblem(handler: (request: any) => unknown) {
  return (request: any) => {
    try {
      return handler(request);
    } catch (error) {
      const problem = error as { status?: number; title?: string; detail?: string };
      if (problem.status !== 400) {
        throw error;
      }
      return {
        status: 400,
        statusText: 'Bad Request',
        body: { ...problem, status: 400, title: 'Bad Request', detail: problem.detail },
      };
    }
  };
}

// Draft contract for halo-pro#670; these extensions are used only by Mock.
type MockPrepareRequest = PrepareCheckoutRequest & {
  discountCode?: string;
  customerCouponIds?: number[];
};
type MockSubmitRequest = MpCheckoutSubmitRequest & {
  discountCode?: string;
  customerCouponIds?: number[];
};

export default defineMock({
  '[POST]/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/prepare': withProblem(({ data }) => {
    const body = data as MockPrepareRequest;
    return priceContext(createContext(body), body.discountCode, body.customerCouponIds);
  }),
  '[POST]/apis/mp.api.ecommerce.halo.run/v1alpha1/checkout/-/submit': withProblem(({ data }) => {
    const body = data as MockSubmitRequest;
    const context = priceContext(
      resolveContextBySubmitPayload(body),
      body.discountCode,
      body.customerCouponIds,
    );
    if (
      body.expectedPayableAmount != null &&
      body.expectedPayableAmount !== context.calculateResult?.payableAmount
    ) {
      throw Object.assign(new Error('Price changed'), {
        status: 400,
        title: 'Price changed',
        detail: '订单金额已变化，请重新确认',
      });
    }
    return createOrder(context, body);
  }),
});
