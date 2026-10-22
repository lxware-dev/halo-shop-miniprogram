<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import type { ContactInformation } from '@halo-dev/api-client';
import AppLoadError from '@/components/common/AppLoadError.vue';
import { formatImageUrl } from '@/helpers/image';
import { ICON_COLOR } from '@/helpers/icon';

defineProps<{
  visible: boolean;
  loading: boolean;
  error: 'loadFailed' | 'unavailable' | 'openFailed' | null;
  contacts: ContactInformation[];
}>();
const emit = defineEmits<{
  close: [];
  retry: [];
  select: [contact: ContactInformation];
}>();
const { t } = useI18n();
</script>

<template>
  <view v-if="visible" class="fixed inset-0 z-60 flex flex-col justify-end" @touchmove.stop.prevent>
    <view class="absolute inset-0 bg-slate-950/60" @tap="emit('close')" />
    <view
      class="relative bg-white rounded-t-5 px-4 pt-5 pb-safe max-h-80vh flex flex-col"
      @tap.stop
    >
      <view class="flex items-center justify-between mb-4">
        <text class="text-slate-950 text-base font-bold">{{ t('product.inquiry') }}</text>
        <view class="flex items-center justify-center w-8 h-8" @tap="emit('close')">
          <TIcon name="close" v-bind="{ size: '40rpx', color: ICON_COLOR.muted }" />
        </view>
      </view>
      <text v-if="loading" class="text-slate-400 text-sm text-center py-8">{{
        t('common.loading')
      }}</text>
      <AppLoadError
        v-else-if="error"
        :text="t(`product.inquiry.${error}`)"
        @retry="emit('retry')"
      />
      <scroll-view v-else scroll-y class="flex-1 overflow-auto" @touchmove.stop>
        <view class="flex flex-col gap-3">
          <view
            v-for="(contact, index) in contacts"
            :key="index"
            class="flex flex-col gap-2 rounded-2 bg-slate-50 p-4"
          >
            <text class="text-slate-950 text-sm font-medium">{{ contact.label }}</text>
            <view v-if="contact.type === 'LINK'" @tap="emit('select', contact)">
              <text class="text-brand text-sm break-all">{{
                contact.linkLabel || contact.linkUrl
              }}</text>
            </view>
            <image
              v-else-if="contact.type === 'IMAGE'"
              :src="formatImageUrl(contact.image)"
              mode="aspectFit"
              class="w-40 h-40"
              @tap="emit('select', contact)"
            />
            <text v-if="contact.help" class="text-slate-500 text-xs break-all">{{
              contact.help
            }}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>
