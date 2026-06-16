import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/src/theme';

/**
 * Entry route. The redirect logic in app/_layout.tsx immediately routes to
 * /sign-in or /groups depending on auth state; this is just what shows during
 * that first tick.
 */
export default function Index() {
  return (
    <View style={styles.center}>
      <Text style={styles.mark}>◆</Text>
      <ActivityIndicator color={colors.gold} style={{ marginTop: spacing(4) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  mark: { fontSize: 48, color: colors.gold },
});
