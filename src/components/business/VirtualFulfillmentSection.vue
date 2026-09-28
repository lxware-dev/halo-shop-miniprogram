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
  <view class="mx-3 mt-3 bg-white rounded-2 p-4 shadow-card border border-solid border-brand/5">
    <view class="flex items-center gap-2 mb-4">
      <view class="rounded-full bg-brand w-1 h-4" />
      <text class="text-sm text-slate-950 font-medium">{{ $t('order.virtual.title') }}</text>
      <button
        v-if="paid && !loading"
        class="m-0 ml-auto px-2 py-1 text-xs text-brand bg-brand/10 rounded-1.5"
        @tap="emit('retry')"
      >
        {{ $t('order.virtual.refresh') }}
      </button>
    </view>

    <text v-if="!paid" class="text-sm text-slate-500">{{ $t('order.virtual.unpaid') }}</text>
    <text v-else-if="loading" class="text-sm text-slate-500">{{ $t('common.loading') }}</text>
    <view v-else-if="error" class="flex items-center justify-between gap-3">
      <text class="text-sm text-slate-500">{{ $t('order.virtual.loadFailed') }}</text>
      <button
        class="m-0 px-3 py-1.5 text-xs text-brand bg-brand/10 rounded-1.5"
        @tap="emit('retry')"
      >
        {{ $t('common.retry') }}
      </button>
    </view>
    <text v-else-if="!content.deliveries.length" class="text-sm text-slate-500">
      {{ $t('order.virtual.awaiting') }}
    </text>

    <view v-else class="flex flex-col gap-4">
      <view
        v-for="(delivery, index) in content.deliveries"
        :key="index"
        class="rounded-2 bg-slate-50 p-3 flex flex-col gap-2"
      >
        <view class="flex items-center justify-between gap-3">
          <text class="text-sm text-slate-950 font-medium">
            {{ $t('order.virtual.deliveryNumber', { number: index + 1 }) }}
          </text>
          <text
            class="text-xs font-medium"
            :class="delivery.status === 'FAILED' ? 'text-brand' : 'text-slate-500'"
          >
            {{ $t(statusMessageKey(delivery.status)) }}
          </text>
        </view>
        <text v-if="delivery.completedAt" class="text-xs text-slate-400">
          {{ formatDate(delivery.completedAt) }}
        </text>
        <view
          v-for="(item, itemIndex) in delivery.items"
          :key="itemIndex"
          class="flex flex-col gap-1"
        >
          <text class="text-xs text-slate-700">
            {{ item.title || $t('order.virtual.unknownItem') }} × {{ item.quantity }}
          </text>
          <text
            v-if="item.instructions"
            class="text-xs text-slate-500 leading-relaxed"
            style="white-space: pre-wrap"
          >
            {{ $t('order.virtual.instructions') }}{{ item.instructions }}
          </text>
        </view>
      </view>

      <view v-if="content.cdks.length || content.resources.length" class="flex flex-col gap-4">
        <view v-if="content.cdks.length" class="flex flex-col gap-2">
          <text class="text-sm text-slate-950 font-medium">{{ $t('order.virtual.cdks') }}</text>
          <view
            v-for="entry in content.cdks"
            :key="entry.key"
            class="rounded-2 border border-solid border-slate-100 p-3 flex flex-col gap-2"
          >
            <text class="text-xs text-slate-500">{{
              entry.title || $t('order.virtual.unknownItem')
            }}</text>
            <view class="flex items-center justify-between gap-2">
              <text class="text-sm text-slate-900 break-all flex-1">{{ entry.cdk.code }}</text>
              <button
                class="m-0 px-2 py-1 text-xs text-brand bg-brand/10 rounded-1"
                @tap="emit('copy', entry.cdk.code!)"
              >
                {{ $t('common.copy') }}
              </button>
            </view>
            <view v-if="entry.cdk.secret" class="flex items-center justify-between gap-2">
              <text class="text-xs text-slate-500 shrink-0">{{ $t('order.virtual.secret') }}</text>
              <text class="text-sm text-slate-900 break-all flex-1 text-right">
                {{ visibleSecrets.has(entry.key) ? entry.cdk.secret : '••••••••' }}
              </text>
              <button
                class="m-0 px-2 py-1 text-xs text-brand bg-brand/10 rounded-1"
                @tap="toggleSecret(entry.key)"
              >
                {{
                  $t(visibleSecrets.has(entry.key) ? 'order.virtual.hide' : 'order.virtual.show')
                }}
              </button>
              <button
                class="m-0 px-2 py-1 text-xs text-brand bg-brand/10 rounded-1"
                @tap="emit('copy', entry.cdk.secret!)"
              >
                {{ $t('common.copy') }}
              </button>
            </view>
            <text v-if="entry.cdk.remark" class="text-xs text-slate-500">{{
              entry.cdk.remark
            }}</text>
            <text v-if="entry.cdk.expireAt" class="text-xs text-slate-500">
              {{ $t('order.virtual.expiresAt') }}{{ formatDate(entry.cdk.expireAt) }}
            </text>
          </view>
        </view>

        <view v-if="content.resources.length" class="flex flex-col gap-2">
          <text class="text-sm text-slate-950 font-medium">{{
            $t('order.virtual.resources')
          }}</text>
          <view
            v-for="entry in content.resources"
            :key="entry.key"
            class="rounded-2 border border-solid border-slate-100 p-3 flex flex-col gap-2"
          >
            <text class="text-xs text-slate-500">{{
              entry.title || $t('order.virtual.unknownItem')
            }}</text>
            <view class="flex items-center justify-between gap-2">
              <text class="text-sm text-slate-900 flex-1 break-all">
                {{ entry.resource.resourceName || $t('order.virtual.unnamedResource') }}
              </text>
              <button
                class="m-0 px-3 py-1.5 text-xs text-white bg-brand rounded-1.5"
                @tap="emit('download', entry.resource)"
              >
                {{ $t('order.virtual.openResource') }}
              </button>
            </view>
            <button
              v-if="entry.resource.resourceUrl"
              class="m-0 p-0 text-xs text-brand text-left bg-transparent"
              @tap="emit('copy', entry.resource.resourceUrl)"
            >
              {{ $t('order.virtual.copyLink') }}
            </button>
          </view>
        </view>
      </view>

      <text v-else-if="hasCompletedDelivery" class="text-xs text-slate-500">
        {{ $t('order.virtual.noContent') }}
      </text>
    </view>
  </view>
</template>
