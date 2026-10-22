<script setup lang="ts">
import { shallowRef } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import type { FulfillmentLabelResponse } from '@halo-dev/api-client';
import AppContactButton from '@/components/common/AppContactButton.vue';
import AppLoadError from '@/components/common/AppLoadError.vue';
import { useAppConfig } from '@/config';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { getTrackingUrl } from '@/helpers/fulfillment';
import { ICON_COLOR } from '@/helpers/icon';
import { openLinkTarget } from '@/helpers/link';
import { usePagePullRefresh } from '@/hooks/usePullRefresh';
import { useShippingRecords } from '@/hooks/useShippingRecords';
import ShippingRecordCard from './components/ShippingRecordCard.vue';

const { contactServiceEnabled } = useAppConfig().business;
const { t } = useI18n();
const orderCode = shallowRef('');
const { data: records, loading, error, run } = useShippingRecords();

async function loadRecords() {
  if (!guardCurrentPageAccess() || !orderCode.value || loading.value) {
    return;
  }
  try {
    await run(orderCode.value);
  } catch {
    // The query keeps the error for the inline retry state.
  }
}

onLoad((options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  orderCode.value = options?.orderCode?.trim() ?? '';
  uni.setNavigationBarTitle({ title: t('logistics.title') });
  void loadRecords();
});

usePagePullRefresh(loadRecords);

function copyTrackingNumber(trackingNumber: string) {
  uni.setClipboardData({
    data: trackingNumber,
    success: () => uni.showToast({ title: t('logistics.copied'), icon: 'none' }),
    fail: () => uni.showToast({ title: t('order.actionFailed'), icon: 'none' }),
  });
}

function openTrackingUrl(label: FulfillmentLabelResponse) {
  openLinkTarget(getTrackingUrl(label), { copyMessage: t('logistics.trackingUrlCopied') });
}
</script>

<template>
  <view class="min-h-screen bg-bg-page px-3 pt-3 pb-safe-sm">
    <view class="flex items-center justify-between gap-3 px-1 mb-3">
      <view class="min-w-0 flex-1">
        <text class="text-xs text-slate-500">{{ t('order.code') }}</text>
        <text class="block text-sm text-slate-950 mt-1 break-all">{{ orderCode || '—' }}</text>
      </view>
      <view
        v-if="orderCode"
        class="shrink-0 rounded-1.5 border border-solid border-slate-200 bg-white px-3 py-2"
        :class="{ 'opacity-50': loading }"
        @tap="loadRecords"
      >
        <text class="text-xs text-slate-600">
          {{ loading ? t('common.loading') : t('logistics.refresh') }}
        </text>
      </view>
    </view>

    <view v-if="loading && !records" class="flex justify-center py-20">
      <text class="text-sm text-slate-400">{{ t('common.loading') }}</text>
    </view>
    <AppLoadError v-else-if="error" @retry="loadRecords" />
    <view v-else-if="records?.length" class="flex flex-col gap-3">
      <ShippingRecordCard
        v-for="(record, index) in records"
        :key="record.key"
        :record="record"
        :number="index + 1"
        @copy-tracking-number="copyTrackingNumber"
        @open-tracking-url="openTrackingUrl"
      />
    </view>
    <view v-else class="flex flex-col items-center justify-center py-20 gap-3">
      <TIcon name="car" v-bind="{ size: '80rpx', color: ICON_COLOR.subtle }" />
      <text class="text-sm text-slate-400">
        {{ orderCode ? t('logistics.empty') : t('logistics.invalidOrder') }}
      </text>
    </view>

    <AppContactButton
      v-if="contactServiceEnabled"
      class="flex items-center justify-center gap-2 py-4 mt-3"
    >
      <TIcon name="service" v-bind="{ size: '28rpx', color: ICON_COLOR.muted }" />
      <text class="text-sm text-slate-500">{{ t('logistics.contactService') }}</text>
    </AppContactButton>
  </view>
</template>
