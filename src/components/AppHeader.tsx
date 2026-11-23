import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../store/AppStore';
import { colors, radius, spacing, typography } from '../theme';
import { AppIcon } from './AppIcon';

export function AppHeader({ onProfilePress }: { onProfilePress?: () => void }) {
  const { state } = useAppStore();

  return (
    <View style={styles.header}>
      <View style={styles.sideColumn}>
        <View style={styles.pointsPill}>
          <AppIcon name="coin" size={18} color={colors.gold} strokeWidth={2} />
          <Text style={styles.pointsText}>{state.points.toLocaleString('he-IL')}</Text>
        </View>
      </View>

      <View style={styles.logoWrap} accessibilityLabel="מצוות פלוס">
        <Text style={styles.logo}>
          מצוות<Text style={styles.plus}>+</Text>
        </Text>
        <View style={styles.logoLine} />
      </View>

      <Pressable style={[styles.sideColumn, styles.profileSide]} onPress={onProfilePress} hitSlop={8}>
        <View style={styles.greetingWrap}>
          <Text style={styles.greeting}>שלום {state.userName}</Text>
          <Text style={styles.subGreeting}>ממשיכים קדימה</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{state.userName.charAt(0)}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sideColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileSide: {
    justifyContent: 'flex-end',
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointsText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '800',
  },
  logoWrap: {
    alignItems: 'center',
    width: 112,
  },
  logo: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
    writingDirection: 'rtl',
  },
  plus: {
    color: colors.teal,
  },
  logoLine: {
    marginTop: 2,
    width: 48,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.teal,
    transform: [{ rotate: '-3deg' }],
  },
  greetingWrap: {
    alignItems: 'flex-end',
    marginRight: spacing.sm,
  },
  greeting: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  subGreeting: {
    color: colors.textMuted,
    fontSize: typography.tiny,
    marginTop: 2,
    writingDirection: 'rtl',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sky,
    borderWidth: 2,
    borderColor: colors.white,
  },
  avatarText: {
    fontSize: 17,
    color: colors.primaryDark,
    fontWeight: '900',
  },
});
