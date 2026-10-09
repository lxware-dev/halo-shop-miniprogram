<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  CustomerDigitalResourceUcResponse,
  FulfillmentUcResponse,
} from '@halo-dev/api-client';
import { collectVirtualFulfillment } from '@/helpers/virtual-fulfillment';
import { formatDate } from '@/utils/format';

const props = defineProps<{
  paid: boolean;
  cancelled: boolean;
  fulfillments: FulfillmentUcResponse[];
  loading: boolean;
  error: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  copy: [value: string];
  download: [resource: CustomerDigitalResourceUcResponse];
}>();

const content = computed(() => collectVirtualFulfillment(props.fulfillments));
const hasCompletedDelivery = computed(() =>
  content.value.deliveries.some((delivery) => delivery.status === 'COMPLETED'),
);
const visibleSecrets = ref(new Set<string>());

const statusMessageKeys: Record<string, string> = {
  PENDING: 'order.virtual.status.pending',
  READY: 'order.virtual.status.ready',
  PROCESSING: 'order.virtual.status.processing',
  SHIPPED: 'order.virtual.status.completed',
  COMPLETED: 'order.virtual.status.completed',
  FAILED: 'order.virtual.status.failed',
  CANCELLED: 'order.virtual.status.cancelled',
};

function statusMessageKey(status: FulfillmentUcResponse['status']) {
  return statusMessageKeys[status ?? ''] ?? 'order.virtual.status.pending';
}

function isProblemStatus(status: FulfillmentUcResponse['status']) {
  return status === 'FAILED' || status === 'CANCELLED';
}

function isPendingStatus(status: FulfillmentUcResponse['status']) {
  return status !== 'COMPLETED' && status !== 'SHIPPED' && !isProblemStatus(status);
}

function toggleSecret(key: string) {
  const next = new Set(visibleSecrets.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  visibleSecrets.value = next;
}
</script>

<template>
  <view class="mx-3 mt-3 rounded-2 bg-white p-4 shadow-card">
    <view class="flex min-h-[64rpx] items-center justify-between gap-3">
      <text class="text-sm font-medium text-slate-950">{{ $t('order.virtual.contentTitle') }}</text>
      <view
        v-if="paid && !loading && !error"
        role="button"
        class="flex min-h-[64rpx] shrink-0 items-center justify-center pl-2"
        @tap="emit('retry')"
      >
        <text class="text-xs text-brand">{{ $t('order.virtual.refresh') }}</text>
      </view>
    </view>

    <view
      v-if="!paid || loading || error || !content.deliveries.length"
      class="text-[26rpx] leading-relaxed text-slate-500"
    >
      <text v-if="cancelled">{{ $t('order.virtual.cancelled') }}</text>
      <text v-else-if="!paid">{{ $t('order.virtual.unpaid') }}</text>
      <text v-else-if="loading">{{ $t('common.loading') }}</text>
      <view v-else-if="error" class="flex items-center justify-between gap-2">
        <text>{{ $t('order.virtual.loadFailed') }}</text>
        <view
          role="button"
          class="flex min-h-[64rpx] shrink-0 items-center justify-center pl-2"
          @tap="emit('retry')"
        >
          <text class="text-xs text-brand">{{ $t('common.retry') }}</text>
        </view>
      </view>
      <text v-else>{{ $t('order.virtual.awaiting') }}</text>
    </view>

    <template v-else>
      <view v-if="content.cdks.length" class="mt-4">
        <text class="text-xs font-medium text-slate-500">{{ $t('order.virtual.cdks') }}</text>
        <view
          v-for="(entry, entryIndex) in content.cdks"
          :key="entry.key"
          class="py-3"
          :class="entryIndex > 0 ? 'border-t border-t-solid border-t-slate-100' : ''"
        >
          <text class="block break-all text-[23rpx] leading-snug text-slate-500">{{
            entry.title || $t('order.virtual.unknownItem')
          }}</text>
          <view class="mt-1 flex items-center gap-2">
            <text
              class="min-w-0 flex-1 break-all font-mono text-[29rpx] font-semibold leading-snug text-slate-950"
              >{{ entry.cdk.code }}</text
            >
            <view
              role="button"
              class="flex min-h-[64rpx] shrink-0 items-center justify-center pl-2"
              @tap="emit('copy', entry.cdk.code!)"
            >
              <text class="text-xs text-brand">{{ $t('common.copy') }}</text>
            </view>
          </view>
          <view v-if="entry.cdk.secret" class="flex flex-wrap items-center gap-2">
            <text class="text-[23rpx] text-slate-400">{{ $t('order.virtual.secret') }}</text>
            <text class="min-w-[100rpx] flex-1 break-all font-mono text-[25rpx] text-slate-700">
              {{ visibleSecrets.has(entry.key) ? entry.cdk.secret : '••••••••' }}
            </text>
            <view
              role="button"
              class="flex min-h-[64rpx] shrink-0 items-center justify-center"
              @tap="toggleSecret(entry.key)"
            >
              <text class="text-xs text-slate-500">{{
                $t(visibleSecrets.has(entry.key) ? 'order.virtual.hide' : 'order.virtual.show')
              }}</text>
            </view>
            <view
              role="button"
              class="flex min-h-[64rpx] shrink-0 items-center justify-center pl-2"
              @tap="emit('copy', entry.cdk.secret!)"
            >
              <text class="text-xs text-brand">{{ $t('common.copy') }}</text>
            </view>
          </view>
          <text
            v-if="entry.cdk.remark"
            class="mt-1.5 block break-all text-[22rpx] leading-relaxed text-slate-500"
            >{{ entry.cdk.remark }}</text
          >
          <text
            v-if="entry.cdk.expireAt"
            class="mt-1.5 block break-all text-[22rpx] leading-relaxed text-slate-500"
          >
            {{ $t('order.virtual.expiresAt') }}{{ formatDate(entry.cdk.expireAt) }}
          </text>
        </view>
      </view>

      <view v-if="content.resources.length" class="mt-4">
        <text class="text-xs font-medium text-slate-500">{{ $t('order.virtual.resources') }}</text>
        <view
          v-for="(entry, entryIndex) in content.resources"
          :key="entry.key"
          class="flex items-start gap-3 py-3"
          :class="entryIndex > 0 ? 'border-t border-t-solid border-t-slate-100' : ''"
        >
          <view class="flex min-w-0 flex-1 flex-col gap-1">
            <text class="break-all text-[26rpx] font-semibold leading-snug text-slate-950">
              {{ entry.resource.resourceName || $t('order.virtual.unnamedResource') }}
            </text>
            <text class="block break-all text-[23rpx] leading-snug text-slate-500">{{
              entry.title || $t('order.virtual.unknownItem')
            }}</text>
            <view
              v-if="entry.resource.resourceUrl"
              role="button"
              class="flex min-h-[56rpx] items-center"
              @tap="emit('copy', entry.resource.resourceUrl)"
            >
              <text class="text-xs text-brand">{{ $t('order.virtual.copyLink') }}</text>
            </view>
          </view>
          <view
            role="button"
            class="flex min-h-[64rpx] shrink-0 items-center justify-center rounded-full border border-solid border-brand px-3"
            @tap="emit('download', entry.resource)"
          >
            <text class="text-xs text-brand">{{ $t('order.virtual.openResource') }}</text>
          </view>
        </view>
      </view>

      <text
        v-if="!content.cdks.length && !content.resources.length && hasCompletedDelivery"
        class="text-[26rpx] leading-relaxed text-slate-500"
      >
        {{ $t('order.virtual.noContent') }}
      </text>

      <view class="mt-5 border-t border-t-solid border-t-slate-100 pt-3.5">
        <text class="mb-3 block text-[24rpx] font-semibold text-slate-600">{{
          $t('order.virtual.history')
        }}</text>
        <view
          v-for="(delivery, index) in content.deliveries"
          :key="index"
          class="relative flex gap-2.5 pb-3.5 last:pb-0"
        >
          <view
            v-if="index < content.deliveries.length - 1"
            class="absolute bottom-0 left-[7rpx] top-[22rpx] w-[1rpx] bg-slate-200"
          />
          <view
            class="relative z-1 mt-1.5 h-2 w-2 shrink-0 rounded-full"
            :class="
              isProblemStatus(delivery.status)
                ? 'bg-brand'
                : isPendingStatus(delivery.status)
                  ? 'bg-orange-400'
                  : 'bg-emerald-500'
            "
          />
          <view class="min-w-0 flex-1">
            <view class="flex items-center justify-between gap-1.5">
              <text class="text-xs font-semibold text-slate-600">
                {{ $t('order.virtual.deliveryNumber', { number: index + 1 }) }}
              </text>
              <text
                class="text-[22rpx] font-medium"
                :class="
                  isProblemStatus(delivery.status)
                    ? 'text-brand'
                    : isPendingStatus(delivery.status)
                      ? 'text-orange-700'
                      : 'text-emerald-700'
                "
              >
                {{ $t(statusMessageKey(delivery.status)) }}
              </text>
            </view>
            <text v-if="delivery.completedAt" class="mt-0.5 block text-[22rpx] text-slate-500">
              {{ formatDate(delivery.completedAt) }}
            </text>
            <view
              v-for="(item, itemIndex) in delivery.items"
              :key="itemIndex"
              class="mt-1 break-all text-[23rpx] leading-relaxed text-slate-600"
            >
              <text>{{ item.title || $t('order.virtual.unknownItem') }} × {{ item.quantity }}</text>
              <text v-if="item.instructions" class="mt-0.5 block whitespace-pre-wrap">
                {{ $t('order.virtual.instructions') }}{{ item.instructions }}
              </text>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>
