import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from '@/components/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useAsk, useLogs, useMe, useSaveLog, useTz, useUnit } from '@/hooks/queries';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { errorMessage } from '@/lib/api';
import { clockTime, dayIn, dayLabel, isoDate, parseDate, todayIn } from '@/lib/format';
import { load, save } from '@/lib/storage';
import { withUnit } from '@/lib/text';
import type { AskAnswer, Log, Mode, ParsedSet, Unit } from '@/lib/types';
import { ToolPanel } from '@/tools/ToolPanel';
import { ToolsMenu } from '@/tools/ToolsMenu';
import type { ToolId } from '@/tools/registry';

import { Composer } from './Composer';
import { Entry } from './Entry';

const MODE_KEY = 'jarvis.mode';
const WEIGHT_UNIT_KEY = 'jarvis.weightUnit';
const ASK_KEY = 'jarvis.ask';
const DEFAULT_DAYS = 14;

const isMode = (v: unknown): v is Mode => v === 'workout' || v === 'weight' || v === 'ask';
const isUnit = (v: unknown): v is Unit => v === 'lb' || v === 'kg';

type AskItem = {
  id: string;
  question: string;
  at: string;
  answer?: AskAnswer;
  error?: string;
};

type FeedItem = { kind: 'log'; at: string; day: string; log: Log } | { kind: 'ask'; at: string; day: string; item: AskItem };

function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function AskReply({ item, onRetry, tz }: { item: AskItem; onRetry: () => void; tz: string | undefined }) {
  const a = item.answer;
  return (
    <article className="reply stack-2" aria-label="Question to Jarvis">
      <div className="t-caption secondary">
        {clockTime(item.at, tz)} · You asked
      </div>
      <p className="t-body">{item.question}</p>
      <div className="t-caption accent semibold">Jarvis</div>
      {a ? (
        <>
          <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>
            {a.answer}
          </p>
          <p className="t-caption secondary mono">
            {(a.input_tokens + a.output_tokens).toLocaleString('en-US')} tokens used · {a.tokens_used_today.toLocaleString('en-US')} of{' '}
            {a.daily_token_cap.toLocaleString('en-US')} today
          </p>
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
          Thinking…
        </p>
      )}
    </article>
  );
}

export function NotebookPage() {
  const unit = useUnit();
  const me = useMe();
  const tz = useTz();
  const today = todayIn(tz);
  const [params, setParams] = useSearchParams();
  const jumpId = Number(params.get('log')) || null;
  const jumpDate = params.get('date');

  const [mode, setModeState] = useState<Mode>(() => load(MODE_KEY, 'workout', isMode));
  const [weightUnit, setWeightUnitState] = useState<Unit>(() => load(WEIGHT_UNIT_KEY, 'lb', isUnit));
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [asks, setAsks] = useState<AskItem[]>(() => load<AskItem[]>(ASK_KEY, [], Array.isArray as (v: unknown) => v is AskItem[]));
  const [tool, setTool] = useState<ToolId | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const wide = useMediaQuery('(min-width: 1100px)');
  const { pendingDeletes } = useToast();

  // A search result can point at an entry older than the default range: widen it.
  const from = useMemo(() => {
    const base = addDays(today, -(days - 1));
    return jumpDate && jumpDate < base ? jumpDate : base;
  }, [today, days, jumpDate]);
  const logs = useLogs(from, addDays(today, 1));
  const save_ = useSaveLog();
  const ask = useAsk();

  const setMode = (m: Mode) => {
    setModeState(m);
    save(MODE_KEY, m);
    setSendError(null);
  };
  const setWeightUnit = (u: Unit) => {
    setWeightUnitState(u);
    save(WEIGHT_UNIT_KEY, u);
  };

  useEffect(() => save(ASK_KEY, asks.slice(-20)), [asks]);

  const visible = useMemo(() => (logs.data ?? []).filter((l) => !pendingDeletes.has(l.id)), [logs.data, pendingDeletes]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [
      ...visible.map((log) => ({ kind: 'log' as const, at: log.logged_at, day: log.local_date, log })),
      ...asks
        .filter((a) => a.at.slice(0, 10) >= from)
        .map((item) => ({ kind: 'ask' as const, at: item.at, day: dayIn(item.at, tz), item })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [visible, asks, from, tz]);

  const lastSet: ParsedSet | null = useMemo(() => {
    for (const l of [...visible].sort((a, b) => b.logged_at.localeCompare(a.logged_at))) {
      if (l.sets.length) return l.sets[l.sets.length - 1];
    }
    return null;
  }, [visible]);
  const lastWeightLb = useMemo(() => {
    const w = [...visible].sort((a, b) => b.logged_at.localeCompare(a.logged_at)).find((l) => l.weigh_in);
    return w?.weigh_in?.weight_lb ?? null;
  }, [visible]);

  // Start at the newest entry, like a chat; follow new entries as they arrive.
  const count = feed.length;
  const settled = asks.filter((a) => a.answer || a.error).length; // an answer arriving grows the feed too
  // Scroll the page itself: the composer is sticky, so aligning the last entry with the
  // viewport bottom would leave it hidden behind the composer.
  useEffect(() => {
    if (!jumpId) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [count, settled, jumpId]);

  // Jump to a search result once it's loaded, then clear the URL.
  useEffect(() => {
    if (!jumpId || !logs.data) return;
    const el = document.getElementById(`log-${jumpId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    setParams({}, { replace: true });
  }, [jumpId, logs.data, setParams]);

  function runAsk(question: string, id: string = crypto.randomUUID()) {
    const at = new Date().toISOString();
    setAsks((xs) => [...xs.filter((x) => x.id !== id), { id, question, at }]);
    ask.mutate(question, {
      onSuccess: (answer) => setAsks((xs) => xs.map((x) => (x.id === id ? { ...x, answer } : x))),
      onError: (e) => setAsks((xs) => xs.map((x) => (x.id === id ? { ...x, error: errorMessage(e) } : x))),
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
    const body = mode === 'weight' ? withUnit(t, weightUnit) : t;
    save_.mutate(
      { text: body, mode },
      {
        onSuccess: () => setText(''),
        onError: (e) => setSendError(errorMessage(e)),
      },
    );
  }

  function jump(log: Log) {
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
          <div className="row-between" style={{ marginBottom: 8 }}>
            <Button size="small" variant="ghost" onClick={() => setDays((d) => d + 14)} disabled={logs.isFetching}>
              Show earlier
            </Button>
            {me.data?.is_demo ? <span className="hint">Demo account: made-up data</span> : null}
          </div>
          {logs.error && !logs.data ? (
            <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
          ) : !logs.data ? (
            <Skeleton lines={6} />
          ) : !feed.length ? (
            <EmptyState message="Nothing here yet. Type your first set below, like 8x 135lb bench." />
          ) : (
            feed.map((f) => {
              const header = f.day !== lastDay ? <h2 className="feed-day">{dayLabel(f.day, today)}</h2> : null;
              lastDay = f.day;
              return (
                <div key={f.kind === 'log' ? `l${f.log.id}` : `a${f.item.id}`}>
                  {header}
                  {f.kind === 'log' ? (
                    <Entry log={f.log} unit={unit} highlight={highlight === f.log.id} />
                  ) : (
                    <AskReply item={f.item} tz={tz} onRetry={() => runAsk(f.item.question, f.item.id)} />
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
          sending={save_.isPending || (mode === 'ask' && ask.isPending)}
          error={sendError}
          unit={unit}
          weightUnit={weightUnit}
          onWeightUnitChange={setWeightUnit}
          lastSet={lastSet}
          lastWeightLb={lastWeightLb}
          tools={<ToolsMenu onPick={setTool} />}
          onHelp={() => setTool('help')}
        />
      </main>
      {wide ? panel : null}
    </div>
  );
}
