import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout, space, useTheme } from '@/theme';

import { Text } from './Text';

type Props = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  first?: boolean;
};

/** A flat section: 48pt above, a single hairline rule, a heading, then content. */
export function Section({ title, action, children, first = false }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        !first && styles.notFirst,
        !first && { borderTopColor: colors.border, borderTopWidth: layout.hairline },
      ]}>
      <View style={styles.head}>
        <Text variant="heading" weight="semibold" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {action}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  notFirst: { marginTop: layout.sectionGap, paddingTop: space.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.touchTarget,
  },
  title: { flex: 1 },
  body: { gap: layout.itemGap, marginTop: space.xs },
});
