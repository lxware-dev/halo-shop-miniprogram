<script setup lang="ts">
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { computed, ref } from 'vue';
import { useAppConfig } from '@/config';
import type { HelpCenterFaqItem } from '@/config/types';

const appConfig = useAppConfig();
const { helpCenterFaqs } = appConfig.business;

interface FaqItem {
  question: string;
  answer: string;
  expanded: boolean;
}

interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

function createFaqList(faqs: HelpCenterFaqItem[]): FaqItem[] {
  return faqs.map((faq, index) => ({
    ...faq,
    expanded: index === 0,
  }));
}

const faqList = ref<FaqItem[]>(createFaqList(helpCenterFaqs));

const keyword = ref('');

const searchKeyword = computed(() => keyword.value.trim());

const filteredFaqList = computed(() => {
  const searchValue = searchKeyword.value;

  if (!searchValue) {
    return faqList.value;
  }

  return faqList.value.filter(
    (faq) => faq.question.includes(searchValue) || faq.answer.includes(searchValue),
  );
});

function toggleFaq(faq: FaqItem) {
  faq.expanded = !faq.expanded;
}

function getHighlightSegments(text: string): HighlightSegment[] {
  const searchValue = searchKeyword.value;

  if (!searchValue) {
    return [{ text, highlighted: false }];
  }

  const segments: HighlightSegment[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const matchIndex = text.indexOf(searchValue, startIndex);

    if (matchIndex === -1) {
      segments.push({
        text: text.slice(startIndex),
        highlighted: false,
      });
      break;
    }

    if (matchIndex > startIndex) {
      segments.push({
        text: text.slice(startIndex, matchIndex),
        highlighted: false,
      });
    }

    segments.push({
      text: text.slice(matchIndex, matchIndex + searchValue.length),
      highlighted: true,
    });
    startIndex = matchIndex + searchValue.length;
  }

  return segments.filter((segment) => segment.text);
}
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <view class="bg-white px-4 pt-6 pb-6 flex flex-col gap-4">
      <text class="text-slate-950 text-2xl font-bold leading-8">{{ $t('help.title') }}</text>
      <view class="flex items-center h-12 bg-slate-100 rounded-2 overflow-hidden">
        <view class="flex items-center justify-center pl-4 pr-2 h-full bg-slate-100 shrink-0">
          <TIcon name="search" v-bind="{ size: '36rpx', color: '#94a3b8' }" />
        </view>
        <input
          v-model="keyword"
          class="flex-1 h-full text-sm text-slate-950 bg-slate-100 px-2"
          confirm-type="search"
          :placeholder="$t('help.searchPlaceholder')"
          placeholder-style="color: #94a3b8"
        />
      </view>
    </view>

    <view class="mt-2 bg-white px-4 py-2 flex-1">
      <view class="py-4">
        <text class="text-slate-950 text-lg font-bold -tracking-[0.45px]">{{
          $t('help.guessQuestion')
        }}</text>
      </view>

      <view
        v-for="(faq, idx) in filteredFaqList"
        :key="`${faq.question}-${idx}`"
        class="border-t border-slate-100"
      >
        <view class="flex items-center justify-between py-3" @tap="toggleFaq(faq)">
          <text class="text-slate-900 text-sm leading-5 flex-1 pr-4">
            <text
              v-for="(segment, segmentIdx) in getHighlightSegments(faq.question)"
              :key="`${faq.question}-${segmentIdx}`"
              :class="segment.highlighted ? 'text-brand font-medium' : ''"
            >
              {{ segment.text }}
            </text>
          </text>
          <TIcon
            :name="faq.expanded ? 'chevron-up' : 'chevron-down'"
            v-bind="{ size: '28rpx', color: '#94a3b8' }"
          />
        </view>
        <view v-if="faq.expanded" class="pb-3">
          <text class="text-slate-500 text-sm leading-[22.75px]">
            <text
              v-for="(segment, segmentIdx) in getHighlightSegments(faq.answer)"
              :key="`${faq.answer}-${segmentIdx}`"
              :class="segment.highlighted ? 'text-brand font-medium' : ''"
            >
              {{ segment.text }}
            </text>
          </text>
        </view>
      </view>

      <view
        v-if="keyword.trim() && !filteredFaqList.length"
        class="flex flex-col items-center justify-center py-10 text-center"
      >
        <text class="text-slate-900 text-sm font-medium leading-5">{{ $t('help.notFound') }}</text>
        <text class="mt-2 text-slate-500 text-xs leading-4">{{ $t('help.notFoundDesc') }}</text>
      </view>
    </view>
  </view>
</template>
