<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import AppLogo from '@/components/common/AppLogo.vue';
import { useAppConfig } from '@/config';
import { isLegalDocumentConfigured, openLegalDocument } from '@/helpers/legal';
import type { LegalDocumentKey } from '@/config/types';

const appConfig = useAppConfig();
const {
  name: appName,
  brandDescription,
  companyName,
  copyrightOwner,
  copyrightStartYear,
} = appConfig.app;
const { t } = useI18n();

interface LegalItem {
  key: LegalDocumentKey;
  label: string;
  icon: string;
  configured: boolean;
}

const legalItems = computed<LegalItem[]>(() => [
  {
    key: 'userAgreement',
    label: t('legal.userAgreement'),
    icon: 'file-paste',
    configured: isLegalDocumentConfigured('userAgreement'),
  },
  {
    key: 'privacyPolicy',
    label: t('legal.privacyPolicy'),
    icon: 'secured',
    configured: isLegalDocumentConfigured('privacyPolicy'),
  },
  {
    key: 'platformRules',
    label: t('legal.platformRules'),
    icon: 'view-list',
    configured: isLegalDocumentConfigured('platformRules'),
  },
  {
    key: 'qualification',
    label: t('legal.qualification'),
    icon: 'file',
    configured: isLegalDocumentConfigured('qualification'),
  },
]);

const showBrandDescription = computed(() => !!brandDescription?.trim());
const copyrightText = computed(() => {
  const owner = copyrightOwner?.trim();
  if (!owner) {
    return '';
  }
  const currentYear = new Date().getFullYear();
  const startYear =
    typeof copyrightStartYear === 'number' && copyrightStartYear > 0
      ? copyrightStartYear
      : currentYear;
  const yearText = startYear < currentYear ? `${startYear}-${currentYear}` : `${currentYear}`;
  return `Copyright © ${yearText} ${owner}`;
});
const displayCompanyName = computed(() => companyName?.trim() ?? '');

function onLegalTap(item: LegalItem) {
  openLegalDocument(item.key);
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="bg-white px-8 py-8 flex flex-col items-center gap-4">
      <AppLogo width="192rpx" />

      <view class="flex flex-col items-center gap-2">
        <text class="text-slate-950 text-2xl font-bold -tracking-.15">{{ appName }}</text>
      </view>
    </view>

    <view v-if="showBrandDescription" class="mt-2 bg-white px-4 py-4 flex flex-col gap-3">
      <text class="text-slate-950 text-base font-semibold leading-5">{{
        $t('about.brandIntro')
      }}</text>
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
    <view
      v-if="copyrightText || displayCompanyName"
      class="flex flex-col items-center gap-2 py-10 mt-4"
    >
      <text v-if="copyrightText" class="text-slate-400 text-xs">{{ copyrightText }}</text>
      <text v-if="displayCompanyName" class="text-slate-400 text-xs" style="font-size: 20rpx">
        {{ displayCompanyName }}
      </text>
    </view>
  </view>
</template>
