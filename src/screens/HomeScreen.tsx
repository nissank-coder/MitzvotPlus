import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { shortcuts } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { FeatureKey } from '../types';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { ProgressRing } from '../components/ProgressRing';
import { SectionHeader } from '../components/SectionHeader';

type Props = {
  onOpenFeature: (feature: Exclude<FeatureKey, null>) => void;
  onOpenProfile: () => void;
  onOpenCommunity: () => void;
  onQuickAdd: () => void;
};

export function HomeScreen({ onOpenFeature, onOpenProfile, onOpenCommunity, onQuickAdd }: Props) {
  const { state, blessingTotal } = useAppStore();
  const dailyProgress = Math.min(1, state.dailyLogs.length / state.dailyGoal);
  const weeklyProgress = Math.min(1, state.weeklyProgress / state.weeklyGoal);
  const latestLogs = useMemo(
    () => [...state.dailyLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4),
    [state.dailyLogs],
  );

  const handleShortcut = (key: (typeof shortcuts)[number]['key']) => {
    if (key === 'blessings' || key === 'torah' || key === 'speech') {
      onOpenFeature(key);
      return;
    }
    onQuickAdd();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader onProfilePress={onOpenProfile} />

      <LinearGradient colors={['#F7FCFF', '#E7F5F5']} style={styles.hero}>
        <CitySilhouette opacity={0.23} />
        <View style={styles.heroRow}>
          <ProgressRing progress={dailyProgress} size={124} strokeWidth={12}>
            <AppIcon name="scroll" size={25} color={colors.teal} />
            <Text style={styles.ringValue}>{state.dailyLogs.length}/{state.dailyGoal}</Text>
          </ProgressRing>
          <View style={styles.heroText}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>היעד היומי</Text>
              <AppIcon name="target" size={18} color={colors.teal} />
            </View>
            <Text style={styles.heroTitle}>{state.dailyLogs.length} מתוך {state.dailyGoal} מצוות</Text>
            <Text style={styles.heroSubtitle}>
              {state.dailyLogs.length >= state.dailyGoal
                ? 'היעד הושלם. ממשיכים מתוך שמחה'
                : `עוד ${state.dailyGoal - state.dailyLogs.length} מצוות להשלמת היעד`}
            </Text>
            <View style={styles.heroProgressTrack}>
              <View style={[styles.heroProgressFill, { width: `${dailyProgress * 100}%` }]} />
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.metricRow}>
        <MetricChip icon="coin" label="ניקוד" value={state.points.toLocaleString('he-IL')} color={colors.gold} />
        <MetricChip icon="flame" label="רצף" value={`${state.torahStreak} ימים`} color={colors.coral} />
        <MetricChip icon="star" label="ברכות" value={`${blessingTotal}/100`} color={colors.teal} />
      </View>

      <SectionHeader title="פעולות מהירות" icon="plus" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shortcutRow}
      >
        {[...shortcuts].reverse().map((item) => (
          <Pressable key={item.key} style={styles.shortcut} onPress={() => handleShortcut(item.key)}>
            <View style={[styles.shortcutIcon, { backgroundColor: item.background }]}> 
              <AppIcon name={item.icon} size={25} color={item.color} />
            </View>
            <Text style={styles.shortcutTitle}>{item.title}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Card style={styles.sectionCard}>
        <SectionHeader title="היום שלי" icon="calendar" actionLabel="הוספה" onAction={onQuickAdd} />
        {latestLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="leaf" size={34} color={colors.teal} />
            <Text style={styles.emptyTitle}>היום מתחיל עכשיו</Text>
            <Text style={styles.emptyText}>הוסיפו את המצווה הראשונה שלכם להיום</Text>
          </View>
        ) : (
          latestLogs.map((item, index) => (
            <View key={item.id} style={[styles.logRow, index < latestLogs.length - 1 && styles.logBorder]}>
              <View style={styles.logStatus}>
                <AppIcon name="check" size={20} color={colors.green} />
                <Text style={styles.logTime}>{item.time}</Text>
              </View>
              <View style={styles.logTitleWrap}>
                <Text style={styles.logTitle}>{item.title}</Text>
                <View style={styles.logIcon}>
                  <AppIcon name={item.icon} size={19} color={colors.primary} />
                </View>
              </View>
            </View>
          ))
        )}
      </Card>

      <Pressable onPress={onOpenCommunity}>
        <Card style={styles.challengeCard}>
          <HillDecoration />
          <View style={styles.challengeText}>
            <View style={styles.challengeTitleRow}>
              <Text style={styles.challengeTitle}>האתגר השבועי</Text>
              <AppIcon name="trophy" size={21} color={colors.gold} />
            </View>
            <Text style={styles.challengeValue}>{state.weeklyProgress} מתוך {state.weeklyGoal} מצוות</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${weeklyProgress * 100}%` }]} />
            </View>
            <Text style={styles.challengeCaption}>כל מצווה שלך מקדמת גם את הקהילה</Text>
          </View>
        </Card>
      </Pressable>

      <Card style={styles.rewardCard}>
        <View style={styles.rewardIllustration}>
          <View style={styles.bookBack} />
          <View style={styles.bookMiddle} />
          <View style={styles.bookFront} />
        </View>
        <View style={styles.rewardTextWrap}>
          <View style={styles.rewardTitleRow}>
            <Text style={styles.rewardTitle}>הטבת השבוע</Text>
            <AppIcon name="gift" size={21} color={colors.teal} />
          </View>
          <Text style={styles.rewardText}>ספר מבחר דברי תורה בהנחה מיוחדת לחברי מצוות+</Text>
          <View style={styles.rewardPrice}>
            <AppIcon name="coin" size={15} color={colors.gold} />
            <Text style={styles.rewardPriceText}>2,000 נקודות</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

function MetricChip({
  icon,
  label,
  value,
  color,
}: {
  icon: 'coin' | 'flame' | 'star';
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.metricChip}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}1F` }]}> 
        <AppIcon name={icon} size={18} color={color} />
      </View>
      <View style={styles.metricTextWrap}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    minHeight: 178,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D5E8EC',
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  heroRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  heroText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eyebrowRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: spacing.sm,
  },
  heroSubtitle: {
    color: colors.textMuted,
    fontSize: typography.small,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: spacing.xs,
  },
  heroProgressTrack: {
    width: '100%',
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: '#D8E8EB',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.teal,
  },
  ringValue: {
    color: colors.text,
    fontSize: typography.h3,
    fontWeight: '900',
    marginTop: 2,
  },
  metricRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  metricChip: {
    flex: 1,
    minHeight: 72,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTextWrap: {
    alignItems: 'flex-end',
  },
  metricValue: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.tiny,
    marginTop: 2,
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  shortcut: {
    width: 92,
    minHeight: 102,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  shortcutTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  sectionCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  logRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  logBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  logStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logTime: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  logTitleWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    justifyContent: 'flex-start',
  },
  logTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  logIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.h3,
    fontWeight: '900',
  },
  emptyText: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.small,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  challengeCard: {
    minHeight: 132,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  challengeText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  challengeTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  challengeTitle: {
    color: colors.text,
    fontSize: typography.h3,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  challengeValue: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '700',
    marginTop: spacing.xs,
    writingDirection: 'rtl',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.teal,
  },
  challengeCaption: {
    color: colors.textMuted,
    fontSize: typography.tiny,
    marginTop: spacing.sm,
    writingDirection: 'rtl',
  },
  rewardCard: {
    minHeight: 148,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  rewardIllustration: {
    width: 112,
    height: 92,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bookBack: {
    position: 'absolute',
    width: 80,
    height: 72,
    borderRadius: 6,
    backgroundColor: '#274C67',
    transform: [{ rotate: '-7deg' }],
    bottom: 2,
    left: 12,
  },
  bookMiddle: {
    position: 'absolute',
    width: 86,
    height: 68,
    borderRadius: 6,
    backgroundColor: '#3B6A83',
    transform: [{ rotate: '4deg' }],
    bottom: 4,
    left: 17,
  },
  bookFront: {
    width: 78,
    height: 64,
    borderRadius: 6,
    backgroundColor: '#17324D',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  rewardTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  rewardTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rewardTitle: {
    color: colors.text,
    fontSize: typography.h3,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  rewardText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rewardPrice: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
  },
  rewardPriceText: {
    color: '#966500',
    fontSize: typography.tiny,
    fontWeight: '900',
  },
});
