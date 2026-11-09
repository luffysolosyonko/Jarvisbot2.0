import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/Button';
import { EmptyState, ErrorState, SkeletonEntries } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useAsk, useAskHistory, useClearAskHistory, useLogs, useMe, useSaveLog, useTz, useUnit } from '@/hooks/queries';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTitle } from '@/hooks/useTitle';
import { errorMessage } from '@/lib/api';
import { clockTime, dayIn, dayLabel, isoDate, parseDate, todayIn } from '@/lib/format';
import { load, save } from '@/lib/storage';
import type { Log, Mode } from '@/lib/types';
import { ToolPanel } from '@/tools/ToolPanel';
import { ToolsMenu } from '@/tools/ToolsMenu';
import type { ToolId } from '@/tools/registry';

import { Composer } from './Composer';
import { Entry } from './Entry';

const MODE_KEY = 'jarvis.mode';
const DEFAULT_DAYS = 14;

const isMode = (v: unknown): v is Mode => v === 'workout' || v === 'weight' || v === 'ask';

/** A question not saved yet: in flight, or failed (with a retry). */
type PendingAsk = { id: string; question: string; at: string; error?: string };

/** A question as shown in the feed: saved (with its answer) or pending. */
type AskView = { key: string; question: string; at: string; answer?: string; tokens?: number; error?: string; retryId?: string };

type FeedItem = { kind: 'log'; at: string; day: string; log: Log } | { kind: 'ask'; at: string; day: string; item: AskView };

function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function AskReply({ item, onRetry, tz }: { item: AskView; onRetry: () => void; tz: string | undefined }) {
  return (
    <article className="reply stack-2" aria-label="Question to Jarvis">
      <div className="t-caption secondary">{clockTime(item.at, tz)} · You asked</div>
      <p className="t-body">{item.question}</p>
      <div className="t-caption accent semibold">Jarvis</div>
      {item.answer !== undefined ? (
        <>
          <p className="t-body prewrap">{item.answer}</p>
          {item.tokens !== undefined ? (
            <p className="t-caption secondary mono">{item.tokens.toLocaleString('en-US')} tokens used</p>
          ) : null}
        </>
      ) : item.error ? (
        <div className="stack-2" role="alert">
          <p className="danger">{item.error}</p>
          <Button size="small" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <p className="secondary" aria-live="polite">
          Asking Jarvis…
        </p>
      )}
    </article>
  );
}

const MODES: Mode[] = ['workout', 'weight', 'ask'];

/** Typing into a field: single-key shortcuts must not fire. */
function isTyping(el: Element | null): boolean {
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);
}

export function NotebookPage() {
  useTitle('Notebook');
  const unit = useUnit();
  const me = useMe();
  const tz = useTz();
  const today = todayIn(tz);
  const [params, setParams] = useSearchParams();
  const jumpId = Number(params.get('log')) || null;
  const jumpDate = params.get('date');

  const [mode, setModeState] = useState<Mode>(() => load(MODE_KEY, 'workout', isMode));
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [pendingAsks, setPendingAsks] = useState<PendingAsk[]>([]);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const wide = useMediaQuery('(min-width: 1100px)');
  const { pendingDeletes } = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // A search result can point at an entry older than the default range: widen it.
  const from = useMemo(() => {
    const base = addDays(today, -(days - 1));
    return jumpDate && jumpDate < base ? jumpDate : base;
  }, [today, days, jumpDate]);
  const logs = useLogs(from, addDays(today, 1));
  const save_ = useSaveLog(today);
  const ask = useAsk();
  const askHistory = useAskHistory();
  const clearAsks = useClearAskHistory();

  const setMode = (m: Mode) => {
    setModeState(m);
    save(MODE_KEY, m);
    setSendError(null);
  };


  // Ctrl/Cmd+K from another page lands here with the input focused.
  useEffect(() => {
    if ((location.state as { focusInput?: boolean } | null)?.focusInput) {
      inputRef.current?.focus();
      navigate('.', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  // Shortcuts: Ctrl/Cmd+K focuses the input, 1/2/3 switch modes (when not typing),
  // Esc closes the open tool panel.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && tool) {
        setTool(null);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && ['1', '2', '3'].includes(e.key) && !isTyping(document.activeElement)) {
        const m = MODES[Number(e.key) - 1];
        setModeState(m);
        save(MODE_KEY, m);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  const visible = useMemo(() => (logs.data ?? []).filter((l) => !pendingDeletes.has(l.id)), [logs.data, pendingDeletes]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [
      ...visible.map((log) => ({ kind: 'log' as const, at: log.logged_at, day: log.local_date, log })),
      ...(askHistory.data ?? [])
        .filter((m) => dayIn(m.asked_at, tz) >= from)
        .map((m) => ({
          kind: 'ask' as const,
          at: m.asked_at,
          day: dayIn(m.asked_at, tz),
          item: { key: `s${m.id}`, question: m.question, at: m.asked_at, answer: m.answer, tokens: m.input_tokens + m.output_tokens },
        })),
      ...pendingAsks.map((p) => ({
        kind: 'ask' as const,
        at: p.at,
        day: dayIn(p.at, tz),
        item: { key: `p${p.id}`, question: p.question, at: p.at, error: p.error, retryId: p.id },
      })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [visible, askHistory.data, pendingAsks, from, tz]);


  // Start at the newest entry, like a chat; follow new entries as they arrive.
  const count = feed.length;
  const settled = pendingAsks.filter((a) => a.error).length; // a failure shows up in place, too
  // Scroll the page itself: the composer is sticky, so aligning the last entry with the
  // viewport bottom would leave it hidden behind the composer.
  // Only when the feed grows: clearing ?log= after a jump mustn't scroll away from it.
  const jumpRef = useRef(jumpId);
  useEffect(() => {
    jumpRef.current = jumpId;
  }, [jumpId]);
  useEffect(() => {
    if (!jumpRef.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [count, settled]);

  // Jump to a search result once it's loaded, then clear the URL.
  useEffect(() => {
    if (!jumpId || !logs.data) return;
    const el = document.getElementById(`log-${jumpId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    setParams({}, { replace: true });
  }, [jumpId, logs.data, setParams]);

  function runAsk(question: string, id: string = crypto.randomUUID()) {
    const at = new Date().toISOString();
    setPendingAsks((xs) => [...xs.filter((x) => x.id !== id), { id, question, at }]);
    ask.mutate(question, {
      // Saved on the server: it comes back in the history, so drop the local copy.
      onSuccess: () => setPendingAsks((xs) => xs.filter((x) => x.id !== id)),
      onError: (e) => setPendingAsks((xs) => xs.map((x) => (x.id === id ? { ...x, error: errorMessage(e) } : x))),
    });
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    setSendError(null);
    if (mode === 'ask') {
      runAsk(t);
      setText('');
      return;
    }
    const body = t;
    // Optimistic: clear the input and show the entry now; if the save fails, the entry
    // is removed again and the text comes back so nothing is lost.
    setText('');
    save_.mutate(
      { text: body, mode },
      {
        onError: (e) => {
          setText((current) => (current.trim() ? current : t));
          setSendError(`Not saved: ${errorMessage(e)} Your text is back in the box.`);
        },
      },
    );
  }

  function jump(log: Log) {
    // Widen the feed to include the entry (kept in state, so it survives clearing ?log=).
    const back = Math.round((parseDate(today).getTime() - parseDate(log.local_date).getTime()) / 86_400_000) + 1;
    setDays((d) => Math.max(d, back));
    setTool(wide ? tool : null);
    setHighlight(log.id);
    window.setTimeout(() => setHighlight((h) => (h === log.id ? null : h)), 3000);
    setParams({ log: String(log.id), date: log.local_date });
  }

  const panel = tool ? (
    <ToolPanel id={tool} variant={wide ? 'side' : 'inline'} onClose={() => setTool(null)} onJump={jump} />
  ) : null;

  let lastDay = '';
  return (
    <div className={`notebook${tool && wide ? ' with-panel' : ''}`}>
      <main className="main" id="main">
        <h1 className="visually-hidden">Notebook</h1>
        <div className="feed" aria-live="polite">
          <div className="row-between feed-bar">
            {feed.length ? (
              <Button size="small" variant="ghost" onClick={() => setDays((d) => d + 14)} disabled={logs.isFetching}>
                Show earlier
              </Button>
            ) : (
              <span />
            )}
            {me.data?.is_demo ? <span className="hint">Demo account: made-up data</span> : null}
          </div>
          {logs.error && !logs.data ? (
            <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
          ) : !logs.data ? (
            <SkeletonEntries count={4} />
          ) : !feed.length ? (
            <EmptyState message="Type a set like 8x 160lb bench in the box below to start your notebook." />
          ) : (
            feed.map((f) => {
              const header = f.day !== lastDay ? <h2 className="feed-day">{dayLabel(f.day, today)}</h2> : null;
              lastDay = f.day;
              return (
                <div key={f.kind === 'log' ? `l${f.log.id}` : f.item.key}>
                  {header}
                  {f.kind === 'log' ? (
                    <Entry log={f.log} unit={unit} highlight={highlight === f.log.id} />
                  ) : (
                    <AskReply item={f.item} tz={tz} onRetry={() => runAsk(f.item.question, f.item.retryId)} />
                  )}
                </div>
              );
            })
          )}
          {!wide ? panel : null}
        </div>
        <Composer
          mode={mode}
          onModeChange={setMode}
          text={text}
          onTextChange={(t) => {
            setText(t);
            if (sendError) setSendError(null);
          }}
          onSend={send}
          sending={mode === 'ask' && ask.isPending}
          error={sendError}
          unit={unit}
          tz={tz}
          tools={<ToolsMenu onPick={setTool} />}
          onClearAsks={
            (askHistory.data?.length ?? 0) + pendingAsks.length > 0
              ? () => {
                  setPendingAsks([]);
                  clearAsks.mutate();
                }
              : undefined
          }
          inputRef={inputRef}
        />
      </main>
      {wide ? panel : null}
    </div>
  );
}
