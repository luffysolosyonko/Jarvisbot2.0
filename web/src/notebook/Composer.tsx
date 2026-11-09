import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import { Segmented } from '@/components/Segmented';
import { clockTime, longDate, todayIn } from '@/lib/format';
import type { LogMode, Mode, Unit } from '@/lib/types';

import { ParseLine } from './ParseLine';

const PLACEHOLDER: Record<Mode, string> = {
  workout: '5x 155lb 2x1x1xf bench',
  weight: '83.9kg',
  ask: 'Is my bench still improving?',
};

/** The current time, refreshed every 15 seconds. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

type Props = {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  text: string;
  onTextChange: (t: string) => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
  unit: Unit;
  tz: string | undefined;
  tools: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  header?: ReactNode; // shown above the mode switch (the slim goal bar)
};

/**
 * Like a chat box: pick a mode, type, press Enter. Above the box, the time the entry
 * will be logged at and a one-line read of what the text parses to.
 */
export function Composer({ mode, onModeChange, text, onTextChange, onSend, sending, error, unit, tz, tools, inputRef, header }: Props) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const inputId = useId();
  const now = useNow();
  const isAsk = mode === 'ask';

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (text.trim() && !sending) onSend();
    }
  }

  const rows = Math.min(8, Math.max(1, text.split('\n').length));
  const stamp = `${longDate(todayIn(tz))} · ${clockTime(now.toISOString(), tz)}`;
  const canSend = !!text.trim() && !(isAsk && text.trim().length < 3) && !sending;

  return (
    <div className="composer stack-2">
      {header}
      <div className="composer-bar">
        <Segmented<Mode>
          label="Mode"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: 'workout', label: 'Workout' },
            { value: 'weight', label: 'Weight' },
            { value: 'ask', label: 'Ask' },
          ]}
        />
        {tools}
      </div>

      <div className="composer-meta">
        {isAsk ? null : (
          <>
            <time className="secondary tnum">{stamp}</time>
            <ParseLine text={text} mode={mode as LogMode} unit={unit} onTextChange={onTextChange} onModeChange={onModeChange} />
          </>
        )}
      </div>

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      <div className={`input-row${isAsk ? ' ask' : ''}`}>
        <label htmlFor={inputId} className="visually-hidden">
          {isAsk ? 'Question for Jarvis' : mode === 'weight' ? 'Weigh-in' : 'Sets, one per line'}
        </label>
        <textarea
          id={inputId}
          ref={ref}
          className="textarea"
          rows={rows}
          placeholder={PLACEHOLDER[mode]}
          value={text}
          maxLength={isAsk ? 500 : 2000}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={isAsk}
          autoComplete="off"
        />
        <button type="button" className="btn btn-primary send-btn" title="Send (Enter)" disabled={!canSend} onClick={onSend}>
          Send
        </button>
      </div>
    </div>
  );
}
