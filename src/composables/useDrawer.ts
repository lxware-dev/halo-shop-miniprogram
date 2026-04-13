import { ref, watch } from 'vue';

/**
 * useDrawer - visibility transition logic for bottom/side drawers
 *
 * @param getVisible   getter function that returns the current visible prop
 * @param onAfterClose callback after the closing animation ends (optional, used to reset form state, etc.)
 * @param duration     closing animation duration (ms); should match the CSS transition duration, default 300
 */
export function useDrawer(getVisible: () => boolean, onAfterClose?: () => void, duration = 300) {
  const show = ref(false);
  const panelTranslate = ref('translateY(100%)');

  watch(
    getVisible,
    (val) => {
      if (val) {
        show.value = true;
        setTimeout(() => {
          panelTranslate.value = 'translateY(0)';
        }, 16);
        return;
      }

      panelTranslate.value = 'translateY(100%)';
      setTimeout(() => {
        show.value = false;
        onAfterClose?.();
      }, duration);
    },
    { immediate: true },
  );

  return { show, panelTranslate };
}
