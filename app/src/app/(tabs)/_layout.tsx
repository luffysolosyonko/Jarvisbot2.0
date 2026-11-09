import { Tabs } from 'expo-router/js-tabs';
import { History, LayoutDashboard, MessageCircle, NotebookPen, Settings, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Platform, type ColorValue } from 'react-native';

import { useMe, useUpdateSettings } from '@/hooks/queries';
import { deviceTimeZone } from '@/lib/format';
import { fonts, icon, layout, scale, space, useTheme } from '@/theme';

function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon size={icon.size} strokeWidth={icon.stroke} color={String(color)} />;
  };
}

/** New accounts start in UTC; adopt the device's time zone once. */
function useAdoptDeviceTimeZone() {
  const { data: me } = useMe();
  const update = useUpdateSettings();
  const device = deviceTimeZone();
  const needsTz = !!me && !me.is_demo && me.settings.tz_name === 'UTC' && device !== 'UTC';
  useEffect(() => {
    if (needsTz && update.isIdle) update.mutate({ tz_name: device });
  }, [needsTz, device, update]);
}

export default function TabsLayout() {
  const { colors } = useTheme();
  useAdoptDeviceTimeZone();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSecondary,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: layout.hairline,
          elevation: 0,
          shadowOpacity: 0,
          // The web tab bar has no safe-area inset to grow into, so give the labels room.
          ...(Platform.OS === 'web' ? { height: layout.touchTarget + space.sm, paddingBottom: space.xs } : null),
        },
        tabBarLabelStyle: { fontFamily: fonts.uiSemiBold, fontSize: scale.caption.fontSize },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: tabIcon(LayoutDashboard) }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: tabIcon(NotebookPen) }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: tabIcon(History) }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask', tabBarIcon: tabIcon(MessageCircle) }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon(Settings) }} />
    </Tabs>
  );
}
