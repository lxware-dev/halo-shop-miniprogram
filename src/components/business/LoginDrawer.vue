<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useDrawer } from '@/composables/useDrawer';
import LoginPanel from './LoginPanel.vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  success: [];
}>();

const forceMethodSelection = ref(false);

function resetState() {
  forceMethodSelection.value = false;
}

const { show, panelTranslate } = useDrawer(() => props.visible, resetState);

function onShowLoginDrawer(options?: { forceMethods?: boolean }) {
  forceMethodSelection.value = !!options?.forceMethods;
  emit('update:visible', true);
}

onMounted(() => {
  uni.$on('show-login-drawer', onShowLoginDrawer);
});

onUnmounted(() => {
  uni.$off('show-login-drawer', onShowLoginDrawer);
});

function close() {
  emit('update:visible', false);
}

function handleSuccess() {
  emit('success');
  close();
}
</script>

<template>
  <view v-if="show" class="fixed inset-0 z-50 flex flex-col justify-end" @touchmove.stop.prevent>
    <view class="absolute inset-0 bg-slate-950/60 backdrop-blur-2" @tap="close" />

    <view
      class="relative w-full transition-transform duration-300 ease-drawer"
      :style="{ transform: panelTranslate }"
      @tap.stop
    >
      <LoginPanel
        :force-methods="forceMethodSelection"
        mode="drawer"
        :show-close="true"
        @close="close"
        @success="handleSuccess"
      />
    </view>
  </view>
</template>
