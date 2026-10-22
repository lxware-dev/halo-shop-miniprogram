import { onScopeDispose, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ContactInformation } from '@halo-dev/api-client';
import { shopApi } from '@/api/modules/shop';
import { sendRequest } from '@/hooks/useRequest';
import { resolveInquiryAction, resolveInquiryTarget } from '@/helpers/inquiry';
import { useAppConfig } from '@/config';
import { openLinkTarget } from '@/helpers/link';
import { formatImageUrl } from '@/helpers/image';

export function useProductInquiry() {
  const { t } = useI18n();
  const { halo } = useAppConfig();
  const visible = shallowRef(false);
  const loading = shallowRef(false);
  const error = shallowRef<'loadFailed' | 'unavailable' | 'openFailed' | null>(null);
  const contacts = ref<ContactInformation[]>([]);
  let active = true;
  let version = 0;

  function dispose() {
    active = false;
    version++;
  }
  onScopeDispose(dispose);

  function close() {
    version++;
    visible.value = false;
    loading.value = false;
  }

  function showOpenError() {
    if (active) {
      visible.value = true;
      error.value = 'openFailed';
    }
  }

  function openTarget(target: string) {
    const actionVersion = version;
    const onError = () => {
      if (actionVersion === version) {
        showOpenError();
      }
    };
    try {
      const resolvedTarget = resolveInquiryTarget(target, halo.baseURL);
      if (!resolvedTarget) {
        onError();
        return;
      }
      visible.value = false;
      if (
        !openLinkTarget(resolvedTarget, { copyMessage: t('product.inquiryLinkCopied'), onError })
      ) {
        onError();
      }
    } catch {
      showOpenError();
    }
  }

  async function inquire() {
    if (!active || loading.value) {
      return;
    }
    const requestVersion = ++version;
    visible.value = true;
    loading.value = true;
    error.value = null;
    contacts.value = [];
    try {
      const setting = await sendRequest(shopApi.getShopConfig());
      if (!active || requestVersion !== version) {
        return;
      }
      const action = resolveInquiryAction(setting);
      if (action.type === 'redirect') {
        openTarget(action.target);
      } else if (action.type === 'contacts') {
        contacts.value = action.contacts;
      } else {
        error.value = 'unavailable';
      }
    } catch {
      if (active && requestVersion === version) {
        error.value = 'loadFailed';
      }
    } finally {
      if (active && requestVersion === version) {
        loading.value = false;
      }
    }
  }

  function openContact(contact: ContactInformation) {
    if (!active) {
      return;
    }
    if (contact.type === 'LINK' && contact.linkUrl) {
      openTarget(contact.linkUrl);
    } else if (contact.type === 'IMAGE' && contact.image) {
      if (contact.imageHref?.trim()) {
        openTarget(contact.imageHref);
        return;
      }
      const actionVersion = version;
      const onError = () => {
        if (actionVersion === version) {
          showOpenError();
        }
      };
      try {
        uni.previewImage({ urls: [formatImageUrl(contact.image)], fail: onError });
      } catch {
        onError();
      }
    }
  }

  return { visible, loading, error, contacts, inquire, close, openContact, dispose };
}
