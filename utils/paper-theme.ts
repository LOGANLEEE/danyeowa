import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import { Colors } from '@/constants/theme';

/**
 * Converts hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Creates an rgba color string with opacity overlay
 */
function createOverlay(baseColor: string, overlayColor: string, opacity: number): string {
  const base = hexToRgb(baseColor);
  const overlay = hexToRgb(overlayColor);
  const r = Math.round(base.r + (overlay.r - base.r) * opacity);
  const g = Math.round(base.g + (overlay.g - base.g) * opacity);
  const b = Math.round(base.b + (overlay.b - base.b) * opacity);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Creates a react-native-paper MD3 theme based on the app's color scheme
 * Following Material Design 3 guidelines from react-native-paper documentation
 * @param colorScheme - 'light' or 'dark'
 * @returns Configured MD3 theme for react-native-paper
 */
export function getPaperTheme(colorScheme: 'light' | 'dark') {
  const baseTheme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const colors = Colors[colorScheme];

  // Calculate elevation overlays: surfaces at elevation levels are tinted via color overlays
  // based on the primary color with increasing opacity (5%, 8%, 11%, 12%, 14%)
  const surfaceColor = colors.surface;
  const whiteOverlay = '#FFFFFF';

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      // Primary colors
      primary: colors.primary, // GOLD (#C9A24D)
      primaryContainer: colors.primarySoft, // GOLD_SOFT (#E6C878)
      onPrimary: colorScheme === 'dark' ? '#1A1D27' : '#FFFFFF', // Dark text on gold for contrast
      onPrimaryContainer: colorScheme === 'dark' ? '#1A1D27' : '#0B0D12', // Dark text on soft gold

      // Secondary colors (using info/sapphire as secondary)
      secondary: colors.info, // SAPPHIRE (#3B82F6)
      secondaryContainer: colorScheme === 'dark' ? '#1E3A5F' : '#DBEAFE',
      onSecondary: '#FFFFFF',
      onSecondaryContainer: colorScheme === 'dark' ? '#DBEAFE' : '#1E3A5F',

      // Tertiary colors (using success/emerald)
      tertiary: colors.success, // EMERALD (#10B981)
      tertiaryContainer: colorScheme === 'dark' ? '#064E3B' : '#D1FAE5',
      onTertiary: '#FFFFFF',
      onTertiaryContainer: colorScheme === 'dark' ? '#D1FAE5' : '#064E3B',

      // Surface colors
      surface: colors.surface,
      surfaceVariant: colorScheme === 'dark' ? '#3A3F47' : '#E5E7EB',
      // surfaceDisabled uses onSurface color with 0.12 opacity
      surfaceDisabled: colorScheme === 'dark' ? 'rgba(229, 231, 235, 0.12)' : 'rgba(11, 13, 18, 0.12)',
      onSurface: colors.text,
      onSurfaceVariant: colorScheme === 'dark' ? '#9CA3AF' : '#6B7280',
      // onSurfaceDisabled uses onSurface color with 0.38 opacity
      onSurfaceDisabled: colorScheme === 'dark' ? 'rgba(229, 231, 235, 0.38)' : 'rgba(11, 13, 18, 0.38)',

      // Background
      background: colors.background,
      onBackground: colors.text,

      // Error colors
      error: colors.danger, // RUBY (#EF4444)
      errorContainer: colorScheme === 'dark' ? '#7F1D1D' : '#FEE2E2',
      onError: '#FFFFFF',
      onErrorContainer: colorScheme === 'dark' ? '#FEE2E2' : '#7F1D1D',

      // Outline
      outline: colors.border,
      outlineVariant: colorScheme === 'dark' ? '#3A3F47' : '#E5E7EB',

      // Shadow and scrim
      shadow: '#000000',
      scrim: '#000000',

      // Inverse colors
      inverseSurface: colorScheme === 'dark' ? '#E5E7EB' : '#1A1D27',
      inverseOnSurface: colorScheme === 'dark' ? '#1A1D27' : '#E5E7EB',
      inversePrimary: colors.primary,

      // Backdrop
      backdrop: colorScheme === 'dark' ? 'rgba(51, 47, 55, 0.4)' : 'rgba(51, 47, 55, 0.4)',

      // Elevation levels: surfaces tinted via color overlays based on primary color
      // Following MD3 spec: level0 (transparent), level1 (5%), level2 (8%), level3 (11%), level4 (12%), level5 (14%)
      elevation: {
        level0: 'transparent',
        level1: createOverlay(surfaceColor, whiteOverlay, 0.05),
        level2: createOverlay(surfaceColor, whiteOverlay, 0.08),
        level3: createOverlay(surfaceColor, whiteOverlay, 0.11),
        level4: createOverlay(surfaceColor, whiteOverlay, 0.12),
        level5: createOverlay(surfaceColor, whiteOverlay, 0.14),
      },
    },
  };
}
