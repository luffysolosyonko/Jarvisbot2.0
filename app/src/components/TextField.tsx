import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { layout, MAX_FONT_SCALE, radii, sizes, space, textStyle, useTheme } from '@/theme';

import { Text } from './Text';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  mono?: boolean;
};

export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, hint, mono = false, multiline, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text variant="label" weight="semibold" tone="secondary" nativeID={`${label}-label`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${label}-label`}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholderTextColor={colors.inkSecondary}
        selectionColor={colors.accent}
        multiline={multiline}
        style={[
          textStyle('body', 'regular', mono),
          styles.input,
          multiline && styles.multiline,
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="label" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  input: {
    minHeight: layout.touchTarget,
    borderWidth: layout.hairline,
    borderRadius: radii.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  multiline: { minHeight: sizes.multilineMinHeight, paddingTop: space.sm, textAlignVertical: 'top' },
});
