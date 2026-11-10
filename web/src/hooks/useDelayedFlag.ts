import { useEffect, useRef, useState } from 'react';

/**
 * Whether to show a loading indicator for a wait that is `active`: only once the wait
 * passes `delay` ms (quick answers never flash a spinner), and then for at least
 * `minShow` ms (it never blinks on and off).
 */
export function useDelayedFlag(active: boolean, delay = 300, minShow = 400): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active) {
      if (shown) return;
      const t = window.setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, delay);
      return () => window.clearTimeout(t);
    }
    if (!shown) return;
    const left = minShow - (Date.now() - shownAt.current);
    if (left <= 0) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(false), left);
    return () => window.clearTimeout(t);
  }, [active, shown, delay, minShow]);

  return shown;
}
