<script setup lang="ts">
import { computed } from 'vue';
import { useAppConfig } from '@/config';

const appConfig = useAppConfig();
const enabled = computed(() => appConfig.business.contactServiceEnabled);
</script>

<template>
  <!-- #ifdef MP-WEIXIN -->
  <button v-if="enabled" open-type="contact" class="app-contact-button">
    <slot>
      <text>联系客服</text>
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
