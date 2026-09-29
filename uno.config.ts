import { defineConfig } from 'unocss';
import { presetUni } from '@uni-helper/unocss-preset-uni';

export default defineConfig({
  presets: [presetUni()],
  safelist: [
    'text-slate-500',
    'bg-slate-100',
    'bg-slate-400',
    'bg-slate-500',
    'text-emerald-700',
    'bg-emerald-100',
    'bg-emerald-500',
    'text-blue-700',
    'bg-blue-100',
    'text-orange-700',
    'bg-orange-100',
    'text-brand',
    'bg-brand',
    'bg-red-100',
  ],
  theme: {
    colors: {
      brand: {
        DEFAULT: '#ee2b2b',
        dark: '#cc1a1a',
        muted: '#f1a0a0',
      },
      bg: {
        page: '#f8f6f6',
      },
      status: {
        success: '#10b981',
        danger: '#f87171',
        info: '#1978e5',
        wechat: '#22c55e',
        alipay: '#1677ff',
      },
      icon: {
        brand: '#ee2b2b',
        default: '#64748b',
        muted: '#94a3b8',
        subtle: '#cbd5e1',
        inverse: '#ffffff',
      },
    },
    boxShadow: {
      xs: '0 2rpx 4rpx rgba(0,0,0,0.05)',
      card: '0 2rpx 8rpx rgba(0,0,0,0.05)',
      sm: '0 1px 2px rgba(0,0,0,0.05)',
      md: '0 4rpx 16rpx rgba(0,0,0,0.05)',
      lg: '0 8rpx 32rpx rgba(0,0,0,0.08)',
      up: '0 -8rpx 40rpx rgba(0,0,0,0.05)',
      image: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
      brand: '0 8rpx 24rpx rgba(238,43,43,0.25)',
      'brand-btn': '0 4rpx 12rpx rgba(238,43,43,0.2), 0 2rpx 6rpx rgba(238,43,43,0.15)',
      overlay: '0px 25px 50px -12px rgba(0,0,0,0.25)',
    },
    transitionTimingFunction: {
      drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      slide: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    },
  },
  shortcuts: {
    'pb-safe-sm': 'pb-[calc(32rpx+env(safe-area-inset-bottom))]',
    'pb-safe': 'pb-[calc(64rpx+env(safe-area-inset-bottom))]',
    'pb-safe-xs': 'pb-[calc(34rpx+env(safe-area-inset-bottom))]',
    'pb-safe-raw': 'pb-[env(safe-area-inset-bottom)]',
    'bg-brand-gradient': 'bg-[linear-gradient(145deg,#ee2b2b_0%,#cc1a1a_100%)]',
  },
});
