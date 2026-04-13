const systemInfo = uni.getSystemInfoSync();
const TAB_BAR_HEIGHT = 60;
const TAB_BAR_BOTTOM_OFFSET = 0;
const TAB_BAR_EXTRA_BOTTOM = 0;

interface TabBarInfo {
  height: number;
  safeBottom: number;
  bottomOffset: number;
  extraBottom: number;
  barBottom: number;
  totalHeight: number;
}

let _cached: TabBarInfo | null = null;

function getTabBarInfo(): TabBarInfo {
  if (_cached) {
    return _cached;
  }

  const height = TAB_BAR_HEIGHT;
  const safeBottom = systemInfo.safeAreaInsets?.bottom ?? 0;
  let bottomOffset = TAB_BAR_BOTTOM_OFFSET;
  const romName = systemInfo.romName;
  if (romName !== 'ios') {
    bottomOffset += 12;
  }
  const extraBottom = TAB_BAR_EXTRA_BOTTOM;
  const barBottom = safeBottom + bottomOffset + extraBottom;
  _cached = {
    height,
    safeBottom,
    bottomOffset,
    extraBottom,
    barBottom,
    totalHeight: height + barBottom,
  };
  return _cached;
}

/**
 * useTabBar
 *
 * Get TabBar height information for calculating the safe bottom offset of page content,
 * avoiding fixed-position content from being covered by the TabBar.
 *
 * Returns:
 * - height: TabBar height itself (px)
 * - safeBottom: device safe-area bottom inset (px)
 * - bottomOffset: extra offset between the TabBar and the bottom (px)
 * - extraBottom: extra visual bottom spacing (px)
 * - barBottom: actual distance from the TabBar to the screen bottom (px)
 * - totalHeight: TabBar height + actual bottom distance, i.e. the total height content should reserve
 */
export function useTabBar() {
  return getTabBarInfo();
}
