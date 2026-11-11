import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/Button';
import { Dots, InkCursor } from '@/components/Loading';
import { ErrorState } from '@/components/States';
import { useAskHistory, useTz } from '@/hooks/queries';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { useTitle } from '@/hooks/useTitle';
import { errorMessage } from '@/lib/api';
import { askStream } from '@/lib/askStream';
import { clockTime, dayHeading, dayIn, todayIn } from '@/lib/format';

const MIN_LENGTH = 3;
const MAX_LENGTH = 500;

const EXAMPLES = ['How is my bench progressing?', 'How many sets did I do this week?', 'Is my weight trending down?'];

/** A question not saved yet: in flight (its answer streaming in), or failed. */
type PendingAsk = { id: string; question: string; at: string; answer?: string; error?: string };

/** A question as shown on the page: saved (with its answer) or pending. */
type AskView = {
  key: string;
  question: string;
  at: string;
  day: string;
  answer?: string;
  streaming?: boolean;
  error?: string;
  retryId?: string;
};

/** A question in the margin-timed column, then Jarvis's answer under it. */
function AskReply({ item, onRetry, tz }: { item: AskView; onRetry: () => void; tz: string | undefined }) {
  return (
    <div className="entry" role="group" aria-label="Question to Jarvis">
      <time className="entry-time" dateTime={item.at}>
        {clockTime(item.at, tz)}
      </time>
      <div className="entry-main">
        <p className="entry-text prose">{item.question}</p>
        <div className="answer">
          <p className="answer-label">Jarvis</p>
          {item.error ? (
            <div className="stack-2" role="alert">
              {item.answer ? <p className="answer-text">{item.answer}</p> : null}
              <p className="danger">{item.error}</p>
              <Button size="small" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : item.answer ? (
            <p className={`answer-text${item.streaming ? ' streaming' : ''}`} aria-busy={item.streaming || undefined}>
              {item.answer}
            </p>
          ) : (
            <p className="note thinking" role="status">
              ↳ thinking
              <Dots />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Loading the history: an ink cursor, shown only if the wait passes 300 ms. */
function HistoryLoading() {
  const show = useDelayedFlag(true);
  return show ? <InkCursor label="Loading your questions" /> : null;
}

/**
 * Ask Jarvis about your training: every question and answer so far (oldest first,
 * under day headings like the Notebook's), and the question box at the bottom.
 * Enter sends; the answer streams in under the question.
 */
export function AskPage() {
  useTitle('Ask');
  const tz = useTz();
  const today = todayIn(tz);
  const history = useAskHistory();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<PendingAsk[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  const items: AskView[] = useMemo(
    () =>
      [
        ...(history.data ?? []).map((m) => ({
          key: `s${m.id}`,
          question: m.question,
          at: m.asked_at,
          day: dayIn(m.asked_at, tz),
          answer: m.answer,
        })),
        ...pending.map((p) => ({
          key: `p${p.id}`,
          question: p.question,
          at: p.at,
          day: dayIn(p.at, tz),
          answer: p.answer,
          streaming: !p.error,
          error: p.error,
          retryId: p.id,
        })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [history.data, pending, tz],
  );

  // Start at the newest answer, like a chat, and follow new ones as they arrive (a
  // failure shows up in place, too). The page itself scrolls: the question box is sticky.
  const settled = pending.filter((a) => a.error).length;
  const tail = items[items.length - 1]?.key ?? '';
  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [settled, tail]);
  // A streaming answer grows: keep its end in view if you're reading at the bottom.
  const streamed = pending.reduce((n, a) => n + (a.answer?.length ?? 0), 0);
  useEffect(() => {
    const doc = document.documentElement;
    if (streamed && window.scrollY + window.innerHeight >= doc.scrollHeight - 160) {
      window.scrollTo({ top: doc.scrollHeight });
    }
  }, [streamed]);

  const update = (id: string, f: (a: PendingAsk) => PendingAsk) => setPending((xs) => xs.map((x) => (x.id === id ? f(x) : x)));

  /** "↳ thinking" at once, then the answer streams in word by word. */
  function runAsk(question: string, id: string = crypto.randomUUID()) {
    const at = new Date().toISOString();
    setPending((xs) => [...xs.filter((x) => x.id !== id), { id, question, at }]);
    askStream(question, (piece) => update(id, (a) => ({ ...a, answer: (a.answer ?? '') + piece })))
      .then(async () => {
        // Saved on the server: once the history has it, drop the local copy.
        await qc.invalidateQueries({ queryKey: ['ask-history'] });
        setPending((xs) => xs.filter((x) => x.id !== id));
      })
      .catch((e: unknown) => update(id, (a) => ({ ...a, error: errorMessage(e) })));
  }

  const sending = pending.some((a) => !a.error);
  const question = text.trim();
  const canSend = question.length >= MIN_LENGTH && !sending;

  function send() {
    if (!canSend) return;
    runAsk(question);
    setText('');
    inputRef.current?.focus(); // the Send button is disabled while Jarvis answers
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  // Grows with the text (Shift+Enter for a new line), up to 8 lines.
  const rows = Math.min(8, Math.max(1, text.split('\n').length));

  let lastDay = '';
  return (
    <div className="notebook">
      <main className="main" id="main">
        <header className="nb-head">
          <h1 className="t-title">Ask</h1>
        </header>
        <div className="feed" aria-live="polite">
          {items.length ? (
            items.map((item) => {
              const header =
                item.day !== lastDay ? (
                  <h2 className="day-divider">
                    <span className="day">{dayHeading(item.day, today)}</span>
                  </h2>
                ) : null;
              lastDay = item.day;
              return (
                <div key={item.key}>
                  {header}
                  <AskReply item={item} tz={tz} onRetry={() => runAsk(item.question, item.retryId)} />
                </div>
              );
            })
          ) : history.error && !history.data ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          ) : !history.data ? (
            <HistoryLoading />
          ) : (
            <div className="state">
              <p>No questions yet. Ask Jarvis about your training, or start with one of these:</p>
              <ul className="ask-examples">
                {EXAMPLES.map((q) => (
                  <li key={q}>
                    <Button
                      size="small"
                      onClick={() => {
                        setText(q);
                        inputRef.current?.focus();
                      }}>
                      {q}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="composer">
          <label htmlFor={inputId} className="composer-label caps">
            Ask Jarvis
          </label>
          <div className="input-row ask">
            <textarea
              id={inputId}
              ref={inputRef}
              className="textarea"
              rows={rows}
              placeholder="Ask about your training"
              value={text}
              maxLength={MAX_LENGTH}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button
              type="button"
              className="save-btn"
              aria-label="Send question"
              title="Ask (Enter)"
              disabled={!canSend}
              aria-busy={sending || undefined}
              onClick={send}>
              <ArrowUp size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
