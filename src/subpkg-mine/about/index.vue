<script setup lang="ts">
import { computed } from 'vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { useAppConfig } from '@/config';
import { isLegalDocumentConfigured, openLegalDocument } from '@/helpers/legal';
import type { LegalDocumentKey } from '@/config/types';

const appConfig = useAppConfig();
const { name: appName, version: appVersion, brandDescription } = appConfig.app;

interface LegalItem {
  key: LegalDocumentKey;
  label: string;
  icon: string;
  configured: boolean;
}

const legalItems = computed<LegalItem[]>(() => [
  {
    key: 'userAgreement',
    label: '用户协议',
    icon: 'file-paste',
    configured: isLegalDocumentConfigured('userAgreement'),
  },
  {
    key: 'privacyPolicy',
    label: '隐私政策',
    icon: 'secured',
    configured: isLegalDocumentConfigured('privacyPolicy'),
  },
  {
    key: 'platformRules',
    label: '平台规则',
    icon: 'shield',
    configured: isLegalDocumentConfigured('platformRules'),
  },
  {
    key: 'qualification',
    label: '资质证照',
    icon: 'file',
    configured: isLegalDocumentConfigured('qualification'),
  },
]);

function onLegalTap(item: LegalItem) {
  openLegalDocument(item.key);
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="bg-white px-8 py-8 flex flex-col items-center gap-4">
      <view
        class="w-24 h-24 rounded-4 flex items-center justify-center bg-brand overflow-hidden shadow-brand"
      >
        <TIcon name="shop" v-bind="{ size: '80rpx', color: '#ffffff' }" />
      </view>

      <view class="flex flex-col items-center gap-2">
        <text class="text-slate-950 text-2xl font-bold -tracking-.15">{{ appName }}</text>
        <view class="px-3 py-1 rounded-full bg-slate-100">
          <text class="text-slate-500 text-sm">版本号 {{ appVersion }}</text>
        </view>
      </view>
    </view>

    <view class="mt-2 bg-white px-4 py-4 flex flex-col gap-3">
      <text class="text-slate-950 text-base font-semibold leading-5">品牌简介</text>
      <text class="text-slate-600 text-sm leading-[22.75px]">{{ brandDescription }}</text>
    </view>

    <view class="mt-2 bg-white">
      <view
        v-for="(item, idx) in legalItems"
        :key="item.label"
        class="flex items-center justify-between px-4 py-4"
        :class="[
          idx < legalItems.length - 1 ? 'border-b border-slate-50' : '',
          item.configured ? '' : 'opacity-60',
        ]"
        @tap="onLegalTap(item)"
      >
        <view class="flex items-center gap-3">
          <view class="w-9 h-9 rounded-2 flex items-center justify-center bg-brand/10 shrink-0">
            <TIcon :name="item.icon" v-bind="{ size: '34rpx', color: '#ee2b2b' }" />
          </view>
          <text class="text-slate-950 text-sm">{{ item.label }}</text>
        </view>
        <TIcon name="chevron-right" v-bind="{ size: '24rpx', color: '#cbd5e1' }" />
      </view>
    </view>
    <view class="flex flex-col items-center gap-2 py-10 mt-4">
      <text class="text-slate-400 text-xs"
        >Copyright © 2014-{{ new Date().getFullYear() }} Halo Mall Inc.</text
      >
      <text class="text-slate-400 text-xs" style="font-size: 20rpx">
        杭州飞致云科技有限公司 版权所有
      </text>
    </view>
  </view>
</template>
