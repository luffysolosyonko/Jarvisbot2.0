/**
 * Show the last session's data while Firebase restores the sign-in (it re-checks the
 * saved user over the network, ~1 s, before saying who's signed in).
 *
 * - A session hint (the signed-in uid) lets the app render straight away instead of a
 *   blank splash. If Firebase then says nobody (or someone else) is signed in, the
 *   cache is dropped and the app follows Firebase.
 * - A few queries (me, the notebook's logs, Ask history, the dashboard, the calendar,
 *   exercises) are saved to localStorage and restored on load, then refreshed.
 *
 * It lives in this browser only and is cleared on sign-out.
 */
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

const HINT_KEY = 'jarvis.session';
const CACHE_KEY = 'jarvis.cache.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Entries whose save failed, kept by the Notebook until they're saved or discarded. */
export const UNSAVED_KEY = 'jarvis.unsaved';
const PERSIST = new Set(['me', 'logs', 'ask-history', 'dashboard', 'calendar', 'exercises']);

type Saved = { uid: string; savedAt: number; state: DehydratedState };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // full or blocked: the app works without the cache
  }
}

/** The uid that was signed in last time, if any. */
export function sessionHint(): string | null {
  return read<{ uid: string }>(HINT_KEY)?.uid ?? null;
}

export function setSessionHint(uid: string | null): void {
  if (uid) write(HINT_KEY, { uid });
  else clearCache();
}

export function clearCache(): void {
  try {
    localStorage.removeItem(HINT_KEY);
    localStorage.removeItem(CACHE_KEY);
    // Typed by whoever was signed in: never shown to (or saved by) the next account.
    localStorage.removeItem(UNSAVED_KEY);
  } catch {
    // nothing to clear
  }
}

/** Restore the saved queries for the hinted user. */
export function restoreCache(client: QueryClient): void {
  const uid = sessionHint();
  const saved = read<Saved>(CACHE_KEY);
  if (!uid || !saved || saved.uid !== uid || Date.now() - saved.savedAt > MAX_AGE_MS) return;
  try {
    hydrate(client, saved.state);
  } catch {
    // an old or broken cache: ignore it
  }
}

/** Save the persisted queries (debounced) whenever the cache changes. */
export function persistCache(client: QueryClient): () => void {
  let timer = 0;
  const save = () => {
    const uid = sessionHint();
    if (!uid) return;
    const state = dehydrate(client, {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSIST.has(String(q.queryKey[0])),
    });
    write(CACHE_KEY, { uid, savedAt: Date.now(), state } satisfies Saved);
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    window.clearTimeout(timer);
    timer = window.setTimeout(save, 1000);
  });
  return () => {
    window.clearTimeout(timer);
    unsubscribe();
  };
}
