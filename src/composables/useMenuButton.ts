const systemInfo = uni.getSystemInfoSync();

interface MenuButtonInfo {
  right: number;
  height: number;
  top: number;
  left: number;
  width: number;
}

let _cached: MenuButtonInfo | null = null;

function getMenuButtonInfo(): MenuButtonInfo {
  if (_cached) {
    return _cached;
  }
  const empty: MenuButtonInfo = { right: 0, height: 0, top: 0, left: 0, width: 0 };

  // #ifdef MP-WEIXIN
  try {
    const rect = uni.getMenuButtonBoundingClientRect();
    _cached = {
      right: systemInfo.windowWidth - rect.left,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      width: rect.width,
    };
    return _cached;
  } catch {
    _cached = { ...empty, right: 88 };
    return _cached;
  }
  // #endif

  return empty;
}

/**
 * useMenuButton
 *
 * Get the position of the WeChat Mini Program capsule button in the top-right corner for layout calculations,
 * avoiding content being covered by the system capsule button.
 *
 * On non-WeChat Mini Program platforms, all values are 0 and do not affect layout on other platforms.
 */
export function useMenuButton() {
  return getMenuButtonInfo();
}
