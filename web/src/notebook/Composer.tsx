import { CircleHelp, Send } from 'lucide-react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from '@/components/Button';
import { ICON } from '@/components/icons';
import { Segmented } from '@/components/Segmented';
import { useRecentExercises } from '@/hooks/queries';
import { exerciseName, fromLb, num } from '@/lib/format';
import { appendLine, insertToken, insertWord, setToLine, type Edit } from '@/lib/text';
import { SYNTAX_TOKENS } from '@/lib/syntax';
import type { LogMode, Mode, ParsedSet, Unit } from '@/lib/types';

import { Preview } from './Preview';

const PLACEHOLDER: Record<Mode, string> = {
  workout: '5x 155lb 2x1x1xf bench',
  weight: '83.9kg',
  ask: 'Ask Jarvis, e.g. Is my bench still improving?',
};

type Props = {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  text: string;
  onTextChange: (t: string) => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
  unit: Unit;
  weightUnit: Unit;
  onWeightUnitChange: (u: Unit) => void;
  lastSet: ParsedSet | null;
  lastWeightLb: number | null;
  tools: ReactNode;
  onHelp: () => void;
};

export function Composer(props: Props) {
  const { mode, text, onTextChange, onSend, sending, unit } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const recentId = useId();
  const recent = useRecentExercises();
  const isAsk = mode === 'ask';

  /** Apply an edit and put the cursor after it. */
  function apply(edit: Edit) {
    onTextChange(edit.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.cursor, edit.cursor);
    });
  }

  function selection(): [number, number] {
    const el = ref.current;
    return el ? [el.selectionStart, el.selectionEnd] : [text.length, text.length];
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (text.trim() && !sending) onSend();
    }
  }

  const lastName = props.lastSet ? (props.lastSet.matched_exercise ?? props.lastSet.exercise) : null;
  const rows = Math.min(8, Math.max(2, text.split('\n').length));

  return (
    <div className="composer stack-2">
      <div className="composer-bar">
        <Segmented<Mode>
          label="Mode"
          value={mode}
          onChange={props.onModeChange}
          options={[
            { value: 'workout', label: 'Workout' },
            { value: 'weight', label: 'Weight' },
            { value: 'ask', label: 'Ask', accent: true },
          ]}
        />
        {props.tools}
        {!isAsk ? (
          <Button size="small" variant="ghost" icon={<CircleHelp {...ICON} aria-hidden="true" />} onClick={props.onHelp}>
            Syntax help
          </Button>
        ) : null}
      </div>

      {isAsk ? (
        <p className="mode-note accent" role="status">
          Ask mode: your question goes to Claude and uses AI tokens. Nothing is logged.
        </p>
      ) : (
        <>
          <div className="chips" role="toolbar" aria-label="Insert syntax">
            {SYNTAX_TOKENS.map(({ token, label }) => (
              <button
                key={token}
                type="button"
                className="chip"
                title={label}
                aria-label={`Insert ${token} (${label})`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(insertToken(text, ...selection(), token))}>
                {token}
              </button>
            ))}
          </div>
          <div className="row quick-row" role="toolbar" aria-label="Quick inserts">
            {mode === 'workout' ? (
              <>
                <Button
                  size="small"
                  disabled={!props.lastSet}
                  onClick={() => props.lastSet && apply({ text: appendLine(text, setToLine(props.lastSet)), cursor: appendLine(text, setToLine(props.lastSet)).length })}>
                  Repeat last set
                </Button>
                <Button size="small" disabled={!lastName} onMouseDown={(e) => e.preventDefault()} onClick={() => lastName && apply(insertWord(text, ...selection(), lastName))}>
                  Same exercise
                </Button>
                <label htmlFor={recentId} className="visually-hidden">
                  Insert a recent exercise
                </label>
                <select
                  id={recentId}
                  className="select"
                  style={{ width: 'auto', minHeight: 44 }}
                  value=""
                  disabled={!recent.length}
                  onChange={(e) => {
                    if (e.target.value) apply(insertWord(text, ...selection(), e.target.value));
                  }}>
                  <option value="">Recent exercises</option>
                  {recent.slice(0, 15).map((n) => (
                    <option key={n} value={n}>
                      {exerciseName(n)}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <Button
                  size="small"
                  disabled={props.lastWeightLb === null}
                  onClick={() => {
                    if (props.lastWeightLb === null) return;
                    const v = `${num(fromLb(props.lastWeightLb, props.weightUnit))}${props.weightUnit}`;
                    apply({ text: v, cursor: v.length });
                  }}>
                  Same as last
                </Button>
                <Segmented<Unit>
                  label="Weigh-in unit"
                  value={props.weightUnit}
                  onChange={props.onWeightUnitChange}
                  options={[
                    { value: 'lb', label: 'lb' },
                    { value: 'kg', label: 'kg' },
                  ]}
                />
                <span className="hint">A bare number is read as {props.weightUnit}.</span>
              </>
            )}
          </div>
          <Preview
            text={text}
            mode={mode as LogMode}
            unit={unit}
            onTextChange={onTextChange}
            onModeChange={(m) => props.onModeChange(m)}
          />
        </>
      )}

      {props.error ? (
        <p className="error-text" role="alert">
          {props.error}
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
        <Button
          variant="primary"
          loading={sending}
          disabled={!text.trim() || (isAsk && text.trim().length < 3)}
          onClick={onSend}
          icon={<Send {...ICON} aria-hidden="true" />}>
          {isAsk ? 'Ask' : 'Log'}
        </Button>
      </div>
      <p className="hint">Enter to {isAsk ? 'ask' : 'log'} · Shift+Enter for a new line</p>
    </div>
  );
}
