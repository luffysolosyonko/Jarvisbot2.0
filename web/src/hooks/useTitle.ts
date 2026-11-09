import { useEffect } from 'react';

/** The browser tab title: "Notebook · Jarvis". */
export function useTitle(page: string): void {
  useEffect(() => {
    document.title = page ? `${page} · Jarvis` : 'Jarvis';
  }, [page]);
}
