<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppConfig } from '@/config';

const appConfig = useAppConfig();
const enabled = computed(() => appConfig.business.contactServiceEnabled);
const { t } = useI18n();
</script>

<template>
  <!-- #ifdef MP-WEIXIN -->
  <button v-if="enabled" open-type="contact" class="app-contact-button">
    <slot>
      <text>{{ t('logistics.contactService') }}</text>
    </slot>
  </button>
  <!-- #endif -->
</template>

<style scoped>
.app-contact-button {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  line-height: 1;
}

.app-contact-button::after {
  border: 0;
}
</style>
