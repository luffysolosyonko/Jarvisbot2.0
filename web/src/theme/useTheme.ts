import { useSyncExternalStore } from 'react';

import { palettes, type ColorTokens, type Scheme } from './tokens';

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

function getScheme(): Scheme {
  return window.matchMedia?.(QUERY).matches ? 'dark' : 'light';
}

/** Light or dark, following the system setting (for charts, which need real colors). */
export function useTheme(): { scheme: Scheme; colors: ColorTokens } {
  const scheme = useSyncExternalStore(subscribe, getScheme, () => 'light' as Scheme);
  return { scheme, colors: palettes[scheme] };
}
