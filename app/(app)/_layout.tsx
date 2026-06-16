import { Stack } from 'expo-router';

import { colors, font } from '@/src/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.goldSoft,
        headerTitleStyle: { ...font.h3, color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="groups" options={{ title: 'Groups' }} />
      <Stack.Screen name="deals" options={{ title: 'My deals' }} />
      <Stack.Screen name="group/[id]" options={{ title: '' }} />
      <Stack.Screen name="listing/new" options={{ title: 'New listing', presentation: 'modal' }} />
      <Stack.Screen name="listing/[id]" options={{ title: '' }} />
      <Stack.Screen name="thread/[id]" options={{ title: '' }} />
    </Stack>
  );
}
