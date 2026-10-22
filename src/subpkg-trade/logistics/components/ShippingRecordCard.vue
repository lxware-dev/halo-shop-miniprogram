<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import type { FulfillmentLabelResponse } from '@halo-dev/api-client';
import type { ShippingRecord } from '@/helpers/fulfillment';
import { getShippingLabelStatusKey, getTrackingUrl } from '@/helpers/fulfillment';
import { getSpecText } from '@/helpers/order';
import { formatImageUrlWithThumbnail } from '@/helpers/image';
import { ICON_COLOR } from '@/helpers/icon';
import { formatDate } from '@/utils/format';

defineProps<{
  record: ShippingRecord;
  number: number;
}>();
const emit = defineEmits<{
  copyTrackingNumber: [trackingNumber: string];
  openTrackingUrl: [label: FulfillmentLabelResponse];
}>();
const { t } = useI18n();
</script>

<template>
  <view class="bg-white rounded-2 p-4 border border-solid border-slate-100">
    <view class="flex items-center justify-between gap-3">
      <text class="text-sm font-medium text-slate-950">
        {{ t('logistics.recordTitle', { number }) }}
      </text>
      <text class="text-xs text-slate-600">{{ t(record.statusKey) }}</text>
    </view>
    <view v-if="record.completedAt" class="mt-2 text-xs text-slate-500">
      {{ t('logistics.completedAt') }} {{ formatDate(record.completedAt) }}
    </view>

    <view v-if="record.items.length" class="flex flex-col gap-3 mt-4">
      <text class="text-xs text-slate-500">{{ t('logistics.itemsTitle') }}</text>
      <view
        v-for="(item, index) in record.items"
        :key="`${item.orderItem?.productVariantId ?? index}-${index}`"
        class="flex items-start gap-3"
      >
        <view class="w-14 h-14 rounded-1.5 bg-slate-100 overflow-hidden shrink-0">
          <image
            v-if="item.orderItem?.itemImageUrl"
            :src="formatImageUrlWithThumbnail(item.orderItem.itemImageUrl, 'S')"
            class="w-full h-full"
            mode="aspectFill"
          />
          <view v-else class="w-full h-full flex items-center justify-center">
            <TIcon name="image" v-bind="{ size: '36rpx', color: ICON_COLOR.subtle }" />
          </view>
        </view>
        <view class="flex-1 min-w-0">
          <text class="text-sm text-slate-950 line-clamp-2 leading-snug">
            {{ item.orderItem?.itemTitle || t('logistics.unknownItem') }}
          </text>
          <text class="block text-xs text-slate-500 mt-1">
            {{ getSpecText(item.orderItem?.productVariantSnapshot?.specValues) }}
          </text>
        </view>
        <text class="text-xs text-slate-500 shrink-0">× {{ item.quantity ?? '—' }}</text>
      </view>
    </view>

    <view class="mt-4 pt-4 border-0 border-t border-solid border-slate-100">
      <text class="text-xs text-slate-500">{{ t('logistics.labelsTitle') }}</text>
      <view v-if="!record.labels.length" class="text-sm text-slate-400 mt-3">
        {{ t('logistics.noLabels') }}
      </view>
      <view v-else class="flex flex-col gap-3 mt-3">
        <view
          v-for="(label, index) in record.labels"
          :key="`${label.trackingNumber ?? ''}-${index}`"
          class="rounded-1.5 bg-slate-50 p-3"
        >
          <view class="flex items-start justify-between gap-3">
            <text class="text-sm text-slate-950 break-all">
              {{ label.carrier || t('logistics.unknownCarrier') }}
            </text>
            <text class="text-xs text-slate-500 shrink-0">
              {{ t(getShippingLabelStatusKey(label.status)) }}
            </text>
          </view>
          <view class="flex items-start gap-2 mt-2">
            <text class="text-sm text-slate-600 break-all flex-1 min-w-0">
              {{ label.trackingNumber || t('logistics.noTrackingNumber') }}
            </text>
            <view
              v-if="label.trackingNumber"
              class="shrink-0 px-2 py-0.5 bg-white rounded-1 border border-solid border-slate-200"
              @tap="emit('copyTrackingNumber', label.trackingNumber)"
            >
              <text class="text-xs text-slate-600">{{ t('common.copy') }}</text>
            </view>
          </view>
          <view class="flex flex-col gap-1 text-xs text-slate-500 mt-2">
            <text v-if="label.shippedAt">
              {{ t('logistics.shippedAt') }} {{ formatDate(label.shippedAt) }}
            </text>
            <text v-if="label.deliveredAt">
              {{ t('logistics.deliveredAt') }} {{ formatDate(label.deliveredAt) }}
            </text>
            <text v-if="label.canceledAt">
              {{ t('logistics.canceledAt') }} {{ formatDate(label.canceledAt) }}
            </text>
          </view>
          <view
            v-if="getTrackingUrl(label)"
            class="inline-flex mt-2 py-1"
            @tap="emit('openTrackingUrl', label)"
          >
            <text class="text-xs text-brand">{{ t('logistics.openTrackingUrl') }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
