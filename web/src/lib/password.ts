/**
 * Password rules for new passwords: 12+ characters, and not one of the ~10,000 most
 * common breached passwords. The list is bundled (src/lib/common-passwords.txt, from
 * SecLists, MIT) and loaded on demand as its own chunk: no network call to any
 * password service.
 *
 * Firebase's password policy enforces the 12-character minimum on its side too
 * (python -m jarvis_api.password_policy). The common-password check runs here only:
 * Firebase can't check a list without a paid blocking function.
 */
import { useEffect, useState } from 'react';

export const MIN_LENGTH = 12;

export type PasswordRule = { id: 'length' | 'common'; label: string; ok: boolean };

let loading: Promise<Set<string>> | null = null;

/** The common-password list, loaded once. */
export function loadCommonPasswords(): Promise<Set<string>> {
  loading ??= import('./common-passwords.txt?raw').then(
    (m) => new Set(m.default.split('\n').filter(Boolean)),
  );
  return loading;
}

/** The list once it's loaded (null until then, or while `enabled` is false). */
export function useCommonPasswords(enabled = true): Set<string> | null {
  const [list, setList] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadCommonPasswords().then((l) => {
      if (live) setList(l);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return list;
}

/** Both rules start unmet: nothing typed yet, or the list not loaded yet. */
export function passwordRules(pw: string, common: Set<string> | null): PasswordRule[] {
  return [
    { id: 'length', label: `${MIN_LENGTH}+ characters`, ok: pw.length >= MIN_LENGTH },
    { id: 'common', label: 'not a common password', ok: !!pw && !!common && !common.has(pw.toLowerCase()) },
  ];
}

export function passwordOk(pw: string, common: Set<string> | null): boolean {
  return passwordRules(pw, common).every((r) => r.ok);
}
