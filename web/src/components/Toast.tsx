import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { useDeleteLog } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';

type Toast = { id: number; message: string; actionLabel?: string; onAction?: () => void };
type ToastInput = Omit<Toast, 'id'> & { durationMs?: number };

type Ctx = {
  show: (t: ToastInput) => void;
  /** Log ids hidden while their delete can still be undone. */
  pendingDeletes: ReadonlySet<number>;
  deleteWithUndo: (id: number) => void;
};

const ToastContext = createContext<Ctx | null>(null);

export const UNDO_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingDeletes, setPending] = useState<ReadonlySet<number>>(new Set());
  const nextId = useRef(1);
  const del = useDeleteLog();

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const show = useCallback(
    ({ durationMs = 4000, ...t }: ToastInput) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { id, ...t }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const setHidden = useCallback((id: number, hidden: boolean) => {
    setPending((s) => {
      const next = new Set(s);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /** Hide the entry now; really delete it only if Undo isn't pressed in time. */
  const deleteWithUndo = useCallback(
    (id: number) => {
      setHidden(id, true);
      let undone = false;
      show({
        message: 'Entry deleted.',
        actionLabel: 'Undo',
        durationMs: UNDO_MS,
        onAction: () => {
          undone = true;
          setHidden(id, false);
        },
      });
      window.setTimeout(() => {
        if (undone) return;
        del.mutate(id, {
          onError: (e) => {
            setHidden(id, false);
            show({ message: errorMessage(e) });
          },
          onSuccess: () => setHidden(id, false),
        });
      }, UNDO_MS);
    },
    [del, setHidden, show],
  );

  const value = useMemo(() => ({ show, pendingDeletes, deleteWithUndo }), [show, pendingDeletes, deleteWithUndo]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span className="t-label">{t.message}</span>
            {t.actionLabel && t.onAction ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}>
                {t.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
