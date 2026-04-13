import { navigateToPage } from '@/helpers/auth';

const HTTP_LINK_REGEXP = /^https?:\/\//i;
const PHONE_LINK_REGEXP = /^tel:/i;

export function openLinkTarget(
  target: string | null | undefined,
  options?: { copyMessage?: string },
): boolean {
  const value = (target ?? '').trim();
  if (!value) {
    return false;
  }

  if (PHONE_LINK_REGEXP.test(value)) {
    uni.makePhoneCall({ phoneNumber: value.replace(PHONE_LINK_REGEXP, '') });
    return true;
  }

  if (value.startsWith('/') || (!HTTP_LINK_REGEXP.test(value) && !value.includes(':'))) {
    navigateToPage(value);
    return true;
  }

  if (HTTP_LINK_REGEXP.test(value)) {
    // #ifdef H5
    window.location.href = value;
    return true;
    // #endif
    uni.setClipboardData({
      data: value,
      success: () => {
        uni.showToast({ title: options?.copyMessage ?? '链接已复制', icon: 'none' });
      },
    });
    return true;
  }

  return false;
}
