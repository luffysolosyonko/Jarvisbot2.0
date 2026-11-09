import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { layout, space, useTheme } from '@/theme';

import { Text } from './Text';

type Props = {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  edges?: Edge[];
  footer?: ReactNode;
};

/** Safe-area screen with 24pt side padding and a left-aligned title. */
export function Screen({
  title,
  subtitle,
  headerRight,
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  edges = ['top'],
  footer,
}: Props) {
  const { colors } = useTheme();
  const header = title ? (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text variant="title" weight="semibold" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerRight}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={Platform.OS !== 'web'} // the browser column scrolls like a phone
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.inkSecondary}
                  colors={[colors.accent]}
                />
              ) : undefined
            }>
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.content]}>
            {header}
            {children}
          </View>
        )}
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.sm,
  },
  headerText: { flex: 1, gap: space.xxs },
});
