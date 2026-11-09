import { Send } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { EmptyState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useAsk } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { AskAnswer } from '@/lib/types';
import { layout, MAX_FONT_SCALE, radii, space, textStyle, useTheme } from '@/theme';

type Turn =
  | { id: number; question: string; state: 'pending' }
  | { id: number; question: string; state: 'answered'; answer: AskAnswer }
  | { id: number; question: string; state: 'failed'; error: string };

const EXAMPLE = 'Is my bench going up?';
const MAX_QUESTION = 500;

export default function AskScreen() {
  const { colors } = useTheme();
  const ask = useAsk();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);
  const list = useRef<FlatList<Turn>>(null);
  const pending = turns.some((t) => t.state === 'pending');

  function send(question: string, replaceId?: number) {
    const q = question.trim();
    if (q.length < 3 || pending) return;
    const id = replaceId ?? nextId.current++;
    setTurns((ts) =>
      replaceId
        ? ts.map((t) => (t.id === id ? { id, question: q, state: 'pending' } : t))
        : [...ts, { id, question: q, state: 'pending' }],
    );
    if (!replaceId) setDraft('');
    ask.mutate(q, {
      onSuccess: (answer) =>
        setTurns((ts) => ts.map((t) => (t.id === id ? { id, question: q, state: 'answered', answer } : t))),
      onError: (e) =>
        setTurns((ts) =>
          ts.map((t) => (t.id === id ? { id, question: q, state: 'failed', error: errorMessage(e) } : t)),
        ),
    });
  }

  const composer = (
    <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
      <TextInput
        accessibilityLabel="Your question"
        placeholder="Ask about your training"
        placeholderTextColor={colors.inkSecondary}
        selectionColor={colors.accent}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        value={draft}
        onChangeText={setDraft}
        maxLength={MAX_QUESTION}
        multiline
        style={[
          textStyle('body'),
          styles.input,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
      <IconButton
        icon={Send}
        accessibilityLabel="Send question"
        onPress={() => send(draft)}
        disabled={pending || draft.trim().length < 3}
        active={draft.trim().length >= 3 && !pending}
      />
    </View>
  );

  return (
    <Screen title="Ask Jarvis" subtitle="Answers use only your own logged data." scroll={false} footer={composer}>
      {turns.length === 0 ? (
        <EmptyState
          message={`Ask about your lifts or weight, like “${EXAMPLE}”`}
          actionLabel="Ask that"
          onAction={() => send(EXAMPLE)}
        />
      ) : (
        <FlatList
          ref={list}
          data={turns}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => <TurnView turn={item} onRetry={() => send(item.question, item.id)} />}
        />
      )}
    </Screen>
  );
}

function TurnView({ turn, onRetry }: { turn: Turn; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.turn, { borderBottomColor: colors.border }]}>
      <Text variant="label" weight="semibold" tone="secondary">
        You
      </Text>
      <Text>{turn.question}</Text>
      <Text variant="label" weight="semibold" tone="secondary" style={styles.speaker}>
        Jarvis
      </Text>
      {turn.state === 'pending' ? (
        <Skeleton rows={2} label="Jarvis is thinking" />
      ) : turn.state === 'failed' ? (
        <View style={styles.failed} accessibilityLiveRegion="polite">
          <Text tone="danger">{turn.error}</Text>
          <View style={styles.left}>
            <Button label="Try again" variant="secondary" onPress={onRetry} />
          </View>
        </View>
      ) : (
        <>
          <Text accessibilityLiveRegion="polite">{turn.answer.answer}</Text>
          <Text variant="caption" tone="secondary" mono tabular>
            {(turn.answer.input_tokens + turn.answer.output_tokens).toLocaleString('en-US')} tokens ·{' '}
            {turn.answer.tokens_used_today.toLocaleString('en-US')} of{' '}
            {turn.answer.daily_token_cap.toLocaleString('en-US')} today
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: layout.itemGap, paddingBottom: space.md },
  turn: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: layout.hairline },
  speaker: { marginTop: space.xs },
  failed: { gap: space.sm },
  left: { alignSelf: 'flex-start' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.xs,
    borderTopWidth: layout.hairline,
  },
  input: {
    flex: 1,
    minHeight: layout.touchTarget,
    maxHeight: layout.touchTarget * 3,
    borderWidth: layout.hairline,
    borderRadius: radii.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
});
