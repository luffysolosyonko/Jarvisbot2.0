import { useColorScheme } from 'react-native';

import { palettes, type ColorTokens, type Scheme } from './colors';

export * from './colors';
export * from './spacing';
export * from './typography';

export type Theme = { scheme: Scheme; colors: ColorTokens };

/** Light or dark, following the system setting. */
export function useTheme(): Theme {
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: palettes[scheme] };
}
