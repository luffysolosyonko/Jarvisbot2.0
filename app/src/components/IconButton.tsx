import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { icon, layout, useTheme } from '@/theme';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  icon: LucideIcon;
  /** Required: icon-only buttons must be labelled for screen readers. */
  accessibilityLabel: string;
  active?: boolean;
};

export function IconButton({ icon: Icon, active = false, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.base, { opacity: pressed ? 0.6 : 1 }]}
      {...rest}>
      <Icon size={icon.size} strokeWidth={icon.stroke} color={active ? colors.accent : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
