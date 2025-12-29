/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Burgundy color palette (matching AnimatedWelcomeBackground)
export const BURGUNDY_PRIMARY = '#800020';
export const BURGUNDY_DARK = '#5C0015';
export const BURGUNDY_LIGHT = '#A0002A';
export const BURGUNDY_ACCENT = '#B80035';
export const BURGUNDY_DEEP = '#4A0010';

// Coffee accent colors (playful roaster theme)
export const COFFEE_MEDIUM = '#A9745B'; // Medium Coffee Brown
export const COFFEE_LATTE = '#C68642'; // Latte Tone

// Status colors
export const STATUS_SCHEDULED = '#3B82F6'; // Blue
export const STATUS_CONFIRMED = BURGUNDY_ACCENT; // Burgundy tint
export const STATUS_COMPLETED = '#10B981'; // Green

const tintColorLight = BURGUNDY_PRIMARY; // Burgundy primary
const tintColorDark = BURGUNDY_LIGHT; // Lighter burgundy for dark mode

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    burgundy: BURGUNDY_PRIMARY,
    burgundyLight: BURGUNDY_LIGHT,
    burgundyDark: BURGUNDY_DARK,
    burgundyAccent: BURGUNDY_ACCENT,
    burgundyDeep: BURGUNDY_DEEP,
    coffeeMedium: COFFEE_MEDIUM,
    coffeeLatte: COFFEE_LATTE,
    statusScheduled: STATUS_SCHEDULED,
    statusConfirmed: STATUS_CONFIRMED,
    statusCompleted: STATUS_COMPLETED,
  },
  dark: {
    text: '#ECEDEE',
    background: '#2A2A2A',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    burgundy: BURGUNDY_LIGHT,
    burgundyLight: BURGUNDY_ACCENT,
    burgundyDark: BURGUNDY_PRIMARY,
    burgundyAccent: BURGUNDY_ACCENT,
    burgundyDeep: BURGUNDY_DARK,
    coffeeMedium: COFFEE_MEDIUM,
    coffeeLatte: COFFEE_LATTE,
    statusScheduled: STATUS_SCHEDULED,
    statusConfirmed: STATUS_CONFIRMED,
    statusCompleted: STATUS_COMPLETED,
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
