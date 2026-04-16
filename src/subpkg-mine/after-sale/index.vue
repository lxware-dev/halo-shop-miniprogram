<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <view class="p-md">
    <text>{{ t('afterSale.title') }}</text>
  </view>
</template>
