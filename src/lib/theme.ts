import { Platform, useColorScheme, useWindowDimensions } from 'react-native';

const light = {
  canvas: '#E5E8E3',
  bg: '#F4F5F2',
  surface: '#FFFFFF',
  surface2: '#ECEEEA',
  line: '#DADED8',
  off: '#A3ABA7',
  text: '#18211F',
  text2: '#46524E',
  text3: '#5C6864',
  primary: '#33479E',
  onPrimary: '#FFFFFF',
  primaryBg: '#E7EBF8',
  primaryText: '#283A85',
  ok: '#16703F',
  okBg: '#E2F2E9',
  okBar: '#2B9A5E',
  warn: '#7F4D00',
  warnBg: '#FFF0D2',
  warnBorder: '#E3A72F',
  warnBar: '#C98000',
  err: '#B0231B',
  errBg: '#FCE3E0',
  errBar: '#D6453A',
  overlay: 'rgba(24,33,31,0.5)',
};

const dark: typeof light = {
  canvas: '#0A0D0C',
  bg: '#101413',
  surface: '#191F1E',
  surface2: '#242C2B',
  line: '#2E3837',
  off: '#4C5755',
  text: '#EDF1EF',
  text2: '#B6C1BD',
  text3: '#93A09B',
  primary: '#93A6F6',
  onPrimary: '#0D1430',
  primaryBg: '#232C55',
  primaryText: '#BCC8FA',
  ok: '#62D192',
  okBg: '#14301F',
  okBar: '#3FBF78',
  warn: '#F3C062',
  warnBg: '#35290E',
  warnBorder: '#B37C18',
  warnBar: '#EBAA3A',
  err: '#FF8F87',
  errBg: '#3A1A18',
  errBar: '#F2675D',
  overlay: 'rgba(0,0,0,0.62)',
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const fonts = {
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;

export type Weight = keyof typeof fonts;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 18, xl: 20, pill: 999 } as const;

export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

export function shadow(c: Palette) {
  return c === dark
    ? {}
    : {
        shadowColor: '#18211F',
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 1,
      };
}
