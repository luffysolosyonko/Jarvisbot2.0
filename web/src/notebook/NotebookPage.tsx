import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/Button';
import { InkCursor } from '@/components/Loading';
import { EmptyState, ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useLogs, useSaveLog, useTz, useUnit } from '@/hooks/queries';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { useTitle } from '@/hooks/useTitle';
import { errorMessage } from '@/lib/api';
import { UNSAVED_KEY } from '@/lib/cache';
import { capsDate, dayHeading, isoDate, parseDate, todayIn } from '@/lib/format';
import { load, save } from '@/lib/storage';
import type { Log, LogMode } from '@/lib/types';

import { Composer } from './Composer';
import { Entry } from './Entry';

const MODE_KEY = 'jarvis.mode';
/** The feed starts with the last 30 days; scrolling to the top loads 30 more. */
const DEFAULT_DAYS = 30;
const MORE_DAYS = 30;
const MAX_DAYS = 366; // the API's limit for one request

const isMode = (v: unknown): v is LogMode => v === 'workout' || v === 'weight';

/** An entry whose save failed: kept (in this browser too) until it's saved or discarded. */
type Unsaved = { key: string; text: string; mode: LogMode; at: string; day: string; error: string };

const isUnsavedList = (v: unknown): v is Unsaved[] =>
  Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof (x as Unsaved).text === 'string');

type FeedItem = { at: string; day: string; log: Log };

function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** "2 sets · 1 weigh-in" for a day of the feed. */
function daySummary(items: FeedItem[]): string {
  let sets = 0;
  let weighIns = 0;
  for (const f of items) {
    sets += f.log.sets.length;
    if (f.log.weigh_in) weighIns += 1;
  }
  const parts: string[] = [];
  if (sets) parts.push(`${sets} set${sets === 1 ? '' : 's'}`);
  if (weighIns) parts.push(`${weighIns} weigh-in${weighIns === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

const MODES: LogMode[] = ['workout', 'weight'];

/** Typing into a field: single-key shortcuts must not fire. */
function isTyping(el: Element | null): boolean {
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);
}

/** Loading the feed: the ruled page with an ink cursor where the first entry goes,
 * shown only if the wait passes 300 ms (then for at least 400 ms). */
function FeedLoading() {
  const show = useDelayedFlag(true);
  return show ? <InkCursor label="Loading your notebook" /> : null;
}

export function NotebookPage() {
  useTitle('Notebook');
  const unit = useUnit();
  const tz = useTz();
  const today = todayIn(tz);
  const [params, setParams] = useSearchParams();
  const jumpId = Number(params.get('log')) || null;
  const jumpDate = params.get('date');

  const [mode, setModeState] = useState<LogMode>(() => load(MODE_KEY, 'workout', isMode));
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [unsaved, setUnsavedState] = useState<Unsaved[]>(() => load(UNSAVED_KEY, [], isUnsavedList));
  const setUnsaved = useCallback((f: (xs: Unsaved[]) => Unsaved[]) => {
    setUnsavedState((xs) => {
      const next = f(xs);
      save(UNSAVED_KEY, next);
      return next;
    });
  }, []);
  const [highlight, setHighlight] = useState<number | null>(null);
  const { pendingDeletes } = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const [shownDay, setShownDay] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // A search result can point at an entry older than the default range: widen it.
  const from = useMemo(() => {
    const base = addDays(today, -(days - 1));
    return jumpDate && jumpDate < base ? jumpDate : base;
  }, [today, days, jumpDate]);
  const logs = useLogs(from, addDays(today, 1));
  const save_ = useSaveLog(today);

  const setMode = (m: LogMode) => {
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

  // Shortcuts: Ctrl/Cmd+K focuses the input, 1/2 switch modes (when not typing).
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && ['1', '2'].includes(e.key) && !isTyping(document.activeElement)) {
        const m = MODES[Number(e.key) - 1];
        setModeState(m);
        save(MODE_KEY, m);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => (logs.data ?? []).filter((l) => !pendingDeletes.has(l.id)), [logs.data, pendingDeletes]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [
      ...visible.map((log) => ({ at: log.logged_at, day: log.local_date, log })),
      ...unsaved.map((u) => ({
        at: u.at,
        day: u.day,
        log: {
          id: -Number(u.key.replace(/\D/g, '').slice(0, 12) || 1),
          kind: u.mode,
          raw_text: u.text,
          logged_at: u.at,
          local_date: u.day,
          sets: [],
          weigh_in: null,
          warnings: [],
          failed: u.error,
          retryKey: u.key,
        } satisfies Log,
      })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [visible, unsaved]);

  const summaries = useMemo(() => {
    const byDay = new Map<string, FeedItem[]>();
    for (const f of feed) byDay.set(f.day, [...(byDay.get(f.day) ?? []), f]);
    return new Map([...byDay].map(([d, items]) => [d, daySummary(items)]));
  }, [feed]);

  // Start at the newest entry, like a chat; follow new entries as they arrive (but not
  // older ones loading in above).
  // Scroll the page itself: the composer is sticky, so aligning the last entry with the
  // viewport bottom would leave it hidden behind the composer.
  // Only when the feed grows: clearing ?log= after a jump mustn't scroll away from it.
  const jumpRef = useRef(jumpId);
  useEffect(() => {
    jumpRef.current = jumpId;
  }, [jumpId]);
  // Also when the newest entry comes back from the server (its note fills in).
  const last = feed[feed.length - 1];
  const tail = last ? `${last.log.id}:${!!last.log.pending}` : '';
  useEffect(() => {
    if (!jumpRef.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [tail]);

  // Scrolled to the top: load the 30 days before (until there's nothing older).
  const topRef = useRef<HTMLDivElement>(null);
  const [exhausted, setExhausted] = useState(false);
  const loadedCount = logs.data?.length ?? 0;
  const lastCount = useRef(-1);
  useEffect(() => {
    if (logs.isFetching || !logs.data) return;
    // A load that brought nothing new means we've reached the start of the notebook.
    if (days > DEFAULT_DAYS && loadedCount === lastCount.current) setExhausted(true);
    lastCount.current = loadedCount;
  }, [days, loadedCount, logs.isFetching, logs.data]);
  useEffect(() => {
    const el = topRef.current;
    if (!el || exhausted || !logs.data || jumpId) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !logs.isFetching && window.scrollY > 0) {
          setDays((d) => Math.min(MAX_DAYS, d + MORE_DAYS));
        }
      },
      { rootMargin: '400px 0px 0px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [exhausted, logs.data, logs.isFetching, jumpId]);

  // The header shows the date of the day you're reading: the last day heading that
  // has scrolled up to (or under) the header, the first day at the top of the page,
  // and the newest day at the bottom.
  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      const line = (headRef.current?.getBoundingClientRect().bottom ?? 0) + 1;
      const heads = document.querySelectorAll<HTMLElement>('.feed [data-day]');
      let day = heads[0]?.dataset.day ?? null;
      for (const h of heads) {
        if (h.getBoundingClientRect().top > line) break;
        day = h.dataset.day ?? day;
      }
      // Scrolled to the end: the newest day, even if the one before still peeks in.
      const doc = document.documentElement;
      if (heads.length && window.scrollY + window.innerHeight >= doc.scrollHeight - 2) {
        day = heads[heads.length - 1].dataset.day ?? day;
      }
      setShownDay(day);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [feed]);

  // Jump to a search result once it's loaded, then clear the URL.
  useEffect(() => {
    if (!jumpId || !logs.data) return;
    const el = document.getElementById(`log-${jumpId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    // Next tick, in one update: keep the feed wide enough to hold the entry once ?log=
    // is cleared, mark the entry briefly, and clear the URL.
    const back = jumpDate ? Math.round((parseDate(today).getTime() - parseDate(jumpDate).getTime()) / 86_400_000) + 1 : 0;
    const timer = window.setTimeout(() => {
      setDays((d) => Math.max(d, back));
      setHighlight(jumpId);
      window.setTimeout(() => setHighlight((h) => (h === jumpId ? null : h)), 3000);
      setParams({}, { replace: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [jumpId, jumpDate, today, logs.data, setParams]);

  function saveEntry(body: string, logMode: LogMode, retryKey?: string) {
    if (retryKey) setUnsaved((xs) => xs.filter((u) => u.key !== retryKey));
    const at = new Date().toISOString();
    // Optimistic: the entry shows now (pending); if the save fails it stays in the feed
    // as "not saved" with a retry, so the typed text is never lost.
    save_.mutate(
      { text: body, mode: logMode },
      {
        onError: (e) =>
          setUnsaved((xs) => [
            ...xs,
            { key: retryKey ?? crypto.randomUUID(), text: body, mode: logMode, at, day: today, error: errorMessage(e) },
          ]),
      },
    );
  }

  // A double tap (or a click and Enter together) sends the same text twice before
  // the cleared box re-renders: drop a repeat of the same text within a second.
  const lastSend = useRef<{ text: string; at: number } | null>(null);

  function send() {
    const t = text.trim();
    if (!t) return;
    const now = Date.now();
    if (lastSend.current && lastSend.current.text === t && now - lastSend.current.at < 1000) return;
    lastSend.current = { text: t, at: now };
    setSendError(null);
    setText('');
    saveEntry(t, mode);
  }

  let lastDay = '';
  return (
    <div className="notebook">
      <main className="main" id="main">
        <header className="nb-head" ref={headRef}>
          <h1 className="brand-row">
            <span className="wordmark">Jarvis</span>
            <img className="logo" src="/logo.png" alt="" width={40} height={40} />
          </h1>
          <time className="caps" dateTime={shownDay ?? today}>
            {capsDate(shownDay ?? today)}
          </time>
        </header>
        <div className="feed" aria-live="polite">
          <div ref={topRef} aria-hidden="true" />
          <div className="row-between feed-bar">
            {feed.length ? (
              <Button
                size="small"
                variant="ghost"
                onClick={() => setDays((d) => Math.min(MAX_DAYS, d + MORE_DAYS))}
                disabled={logs.isFetching || exhausted}>
                {exhausted ? 'Start of your notebook' : 'Show earlier'}
              </Button>
            ) : null}
          </div>
          {logs.error && !logs.data ? (
            <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
          ) : !logs.data ? (
            <FeedLoading />
          ) : !feed.length ? (
            <EmptyState message="Type a set like 8x 160lbs bench in the box below to start your notebook." />
          ) : (
            feed.map((f) => {
              const header =
                f.day !== lastDay ? (
                  <h2 className="day-divider" data-day={f.day}>
                    <span className="day">{dayHeading(f.day, today)}</span>
                    <span className="sum">{summaries.get(f.day)}</span>
                  </h2>
                ) : null;
              lastDay = f.day;
              return (
                <div key={f.log.retryKey ? `u${f.log.retryKey}` : `l${f.log.id}`}>
                  {header}
                  <Entry
                    log={f.log}
                    unit={unit}
                    highlight={highlight === f.log.id}
                    onRetry={f.log.failed ? () => saveEntry(f.log.raw_text, f.log.kind, f.log.retryKey) : undefined}
                    onDiscard={f.log.failed ? () => setUnsaved((xs) => xs.filter((u) => u.key !== f.log.retryKey)) : undefined}
                  />
                </div>
              );
            })
          )}
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
          error={sendError}
          unit={unit}
          inputRef={inputRef}
        />
      </main>
    </div>
  );
}
