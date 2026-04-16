import type { HaloProblemDetail } from '@/types/api';
import { translate } from '@/locales';

export function isHaloProblem(error: unknown): error is HaloProblemDetail {
  return typeof error === 'object' && error !== null && 'status' in error && 'title' in error;
}

/**
 * Show an error toast
 * Prefer `detail`, with `title` as the fallback
 */
export function showErrorToast(messageOrProblem: string | HaloProblemDetail): void {
  const message =
    typeof messageOrProblem === 'string'
      ? messageOrProblem
      : (messageOrProblem.detail ?? messageOrProblem.title ?? translate('common.unknownError'));

  uni.showToast({
    title: message.slice(0, 30),
    icon: 'none',
    duration: 2500,
  });
}
