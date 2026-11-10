import { ArrowUp, MessageCircle } from 'lucide-react';
import { useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import { Segmented } from '@/components/Segmented';
import type { LogMode, Mode, Unit } from '@/lib/types';

import { ParseLine } from './ParseLine';

/** The box shows the pattern; the line under it, an example of it. */
const PLACEHOLDER: Record<Mode, string> = {
  workout: '(reps)x (weight) (lift)',
  weight: '(weight)kg/lbs',
  ask: 'Is my bench still improving?',
};

const EXAMPLE: Record<Mode, string> = {
  workout: 'e.g. 8x 135lb bench',
  weight: 'e.g. 70.3kg or 155lbs',
  ask: '',
};

const LABEL: Record<Mode, string> = {
  workout: 'Log a set',
  weight: 'Log weight',
  ask: 'Ask Jarvis',
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
  tools: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
};

/**
 * The bottom of the page: Workout or Weight (or Ask), a labelled mono input, a
 * square save button, and a live "↳" read of what the text will log. Enter saves.
 */
export function Composer({ mode, onModeChange, text, onTextChange, onSend, sending, error, unit, tools, inputRef }: Props) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const inputId = useId();
  const isAsk = mode === 'ask';

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  }

  // Grows with the text (Shift+Enter for a new line), up to 8 lines.
  const rows = Math.min(8, Math.max(1, text.split('\n').length));
  const canSend = !!text.trim() && !(isAsk && text.trim().length < 3) && !sending;

  return (
    <div className="composer">
      <div className="composer-bar">
        <Segmented<LogMode>
          label="Entry type"
          value={isAsk ? null : mode}
          onChange={onModeChange}
          options={[
            { value: 'workout', label: 'Workout' },
            { value: 'weight', label: 'Weight' },
          ]}
        />
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-accent-outline"
          aria-pressed={isAsk}
          onClick={() => onModeChange(isAsk ? 'workout' : 'ask')}>
          <MessageCircle size={18} strokeWidth={1.8} aria-hidden="true" />
          Ask
        </button>
        {tools}
      </div>

      <label htmlFor={inputId} className="composer-label caps">
        {LABEL[mode]}
      </label>
      <div className={`input-row${isAsk ? ' ask' : ''}`}>
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
          enterKeyHint={isAsk ? 'send' : 'done'}
        />
        <button
          type="button"
          className="save-btn"
          aria-label={isAsk ? 'Send question' : 'Save entry'}
          title={isAsk ? 'Ask (Enter)' : 'Save (Enter)'}
          disabled={!canSend}
          aria-busy={sending || undefined}
          onClick={onSend}>
          <ArrowUp size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      {isAsk ? null : (
        <ParseLine text={text} mode={mode} unit={unit} example={EXAMPLE[mode]} />
      )}
    </div>
  );
}
