import { ArrowUp } from 'lucide-react';
import { useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import { Segmented } from '@/components/Segmented';
import type { LogMode, Unit } from '@/lib/types';

import { ParseLine } from './ParseLine';

/** The box shows the pattern; the line under it, an example of it. */
const PLACEHOLDER: Record<LogMode, string> = {
  workout: '(reps)x (weight) (lift)',
  weight: '(weight)kg/lb',
};

const EXAMPLE: Record<LogMode, string> = {
  workout: 'e.g. 8x 135lb bench',
  weight: 'e.g. 70.3kg or 155lb',
};

const LABEL: Record<LogMode, string> = {
  workout: 'Log a set',
  weight: 'Log weight',
};

type Props = {
  mode: LogMode;
  onModeChange: (m: LogMode) => void;
  text: string;
  onTextChange: (t: string) => void;
  onSend: () => void;
  error: string | null;
  unit: Unit;
  tools: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
};

/**
 * The bottom of the page: Workout or Weight, a labelled mono input, a square save
 * button, and a live "↳" read of what the text will log. Enter saves.
 */
export function Composer({ mode, onModeChange, text, onTextChange, onSend, error, unit, tools, inputRef }: Props) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const inputId = useId();

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  }

  // Grows with the text (Shift+Enter for a new line), up to 8 lines.
  const rows = Math.min(8, Math.max(1, text.split('\n').length));
  const canSend = !!text.trim();

  return (
    <div className="composer">
      <div className="composer-bar">
        <Segmented<LogMode>
          label="Entry type"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: 'workout', label: 'Workout' },
            { value: 'weight', label: 'Weight' },
          ]}
        />
        <span className="spacer" />
        {tools}
      </div>

      <label htmlFor={inputId} className="composer-label caps">
        {LABEL[mode]}
      </label>
      <div className="input-row">
        <textarea
          id={inputId}
          ref={ref}
          className="textarea"
          rows={rows}
          placeholder={PLACEHOLDER[mode]}
          value={text}
          maxLength={2000}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="done"
        />
        <button type="button" className="save-btn" aria-label="Save entry" title="Save (Enter)" disabled={!canSend} onClick={onSend}>
          <ArrowUp size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <ParseLine text={text} mode={mode} unit={unit} example={EXAMPLE[mode]} />
    </div>
  );
}
