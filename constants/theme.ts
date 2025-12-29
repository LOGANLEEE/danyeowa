/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Luxury dark palette
export const OBSIDIAN = '#0F1115'; // Primary background
export const CHARCOAL = '#1A1D23'; // Secondary background / cards
export const GRAPHITE = '#2A2E36'; // Borders / dividers
export const PLATINUM = '#E5E7EB'; // Primary text
export const SILVER = '#9CA3AF'; // Secondary text
export const GOLD = '#C9A24D'; // Accent / CTA
export const GOLD_SOFT = '#E6C878'; // Highlight
export const EMERALD = '#10B981'; // Success
export const RUBY = '#EF4444'; // Destructive
export const SAPPHIRE = '#3B82F6'; // Info

const tintColorLight = GOLD;
const tintColorDark = GOLD;

export const Colors = {
  light: {
    text: '#0B0D12',
    background: '#FFFFFF',
    surface: '#F7F7F8',
    border: '#E5E7EB',
    tint: tintColorLight,
    icon: '#6B7280',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: tintColorLight,

    // Luxury accents
    primary: GOLD,
    primarySoft: GOLD_SOFT,
    success: EMERALD,
    danger: RUBY,
    info: SAPPHIRE,
  },
  dark: {
    text: PLATINUM,
    background: OBSIDIAN,
    surface: CHARCOAL,
    border: GRAPHITE,
    tint: tintColorDark,
    icon: SILVER,
    tabIconDefault: SILVER,
    tabIconSelected: tintColorDark,

    // Luxury accents
    primary: GOLD,
    primarySoft: GOLD_SOFT,
    success: EMERALD,
    danger: RUBY,
    info: SAPPHIRE,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
