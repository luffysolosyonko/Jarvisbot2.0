/** localStorage that never throws (private windows, blocked storage). */
export function load<T>(key: string, fallback: T, valid?: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const v: unknown = JSON.parse(raw);
    return valid && !valid(v) ? fallback : (v as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the setting just won't stick.
  }
}
