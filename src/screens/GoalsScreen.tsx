import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ProgressRing } from '../components/ProgressRing';
import { SectionHeader } from '../components/SectionHeader';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { IconName } from '../types';

type Props = {
  onOpenProfile: () => void;
  onOpenBlessings: () => void;
  onOpenTorah: () => void;
};

const week = [
  { day: 'א׳', value: 7 },
  { day: 'ב׳', value: 10 },
  { day: 'ג׳', value: 8 },
  { day: 'ד׳', value: 12 },
  { day: 'ה׳', value: 9 },
  { day: 'ו׳', value: 6 },
  { day: 'ש׳', value: 4 },
];

export function GoalsScreen({ onOpenProfile, onOpenBlessings, onOpenTorah }: Props) {
  const { state, blessingTotal } = useAppStore();
  const dailyProgress = Math.min(1, state.dailyLogs.length / state.dailyGoal);
  const weeklyProgress = Math.min(1, state.weeklyProgress / state.weeklyGoal);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader onProfilePress={onOpenProfile} />

      <View style={styles.titleRow}>
        <View style={styles.titleIcon}>
          <AppIcon name="target" size={23} color={colors.primary} />
        </View>
        <View style={styles.titleTextWrap}>
          <Text style={styles.title}>התקדמות ויעדים</Text>
          <Text style={styles.subtitle}>התמונה הגדולה של המסע שלך</Text>
        </View>
      </View>

      <Card style={styles.scoreCard}>
        <View style={styles.scoreDecor}>
          <AppIcon name="crown" size={36} color={colors.gold} />
        </View>
        <View style={styles.scoreContent}>
          <Text style={styles.scoreLabel}>הניקוד הכולל</Text>
          <Text style={styles.scoreValue}>{state.points.toLocaleString('he-IL')}</Text>
          <Text style={styles.scoreCaption}>עוד 270 נקודות לדרגה הבאה</Text>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: '73%' }]} />
          </View>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelNumber}>7</Text>
          <Text style={styles.levelText}>דרגה</Text>
        </View>
      </Card>

      <View style={styles.summaryRow}>
        <SummaryCard
          title="יעד יומי"
          value={`${state.dailyLogs.length}/${state.dailyGoal}`}
          progress={dailyProgress}
          icon="target"
          color={colors.teal}
        />
        <SummaryCard
          title="100 ברכות"
          value={`${blessingTotal}/100`}
          progress={blessingTotal / 100}
          icon="star"
          color={colors.primary}
          onPress={onOpenBlessings}
        />
        <SummaryCard
          title="רצף לימוד"
          value={`${state.torahStreak} ימים`}
          progress={Math.min(1, state.torahStreak / 30)}
          icon="flame"
          color={colors.coral}
          onPress={onOpenTorah}
        />
      </View>

      <Card style={styles.chartCard}>
        <SectionHeader title="השבוע שלי" icon="chart" actionLabel={`${state.weeklyProgress}/${state.weeklyGoal}`} />
        <View style={styles.chartArea}>
          {week.map((item) => (
            <View key={item.day} style={styles.barColumn}>
              <Text style={styles.barValue}>{item.value}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${Math.max(18, (item.value / 12) * 100)}%` }]} />
              </View>
              <Text style={styles.dayLabel}>{item.day}</Text>
            </View>
          ))}
        </View>
        <View style={styles.weekProgressRow}>
          <Text style={styles.weekProgressText}>השלמת {Math.round(weeklyProgress * 100)}% מהיעד השבועי</Text>
          <View style={styles.weekTrack}>
            <View style={[styles.weekFill, { width: `${weeklyProgress * 100}%` }]} />
          </View>
        </View>
      </Card>

      <SectionHeader title="הישגים" icon="trophy" />
      <View style={styles.badgesGrid}>
        <Badge title="מתמיד" subtitle="14 ימי לימוד" icon="flame" color={colors.coral} background={colors.coralSoft} />
        <Badge title="לב פתוח" subtitle="20 מעשי חסד" icon="heart" color={colors.green} background={colors.greenSoft} />
        <Badge title="מברך" subtitle="500 ברכות" icon="star" color={colors.gold} background={colors.goldSoft} />
        <Badge title="בן תורה" subtitle="30 דברי תורה" icon="book" color={colors.purple} background={colors.purpleSoft} />
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  title,
  value,
  progress,
  icon,
  color,
  onPress,
}: {
  title: string;
  value: string;
  progress: number;
  icon: IconName;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.summaryCard} onPress={onPress} disabled={!onPress}>
      <ProgressRing progress={progress} size={72} strokeWidth={7} color={color}>
        <AppIcon name={icon} size={18} color={color} />
      </ProgressRing>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryTitle}>{title}</Text>
    </Pressable>
  );
}

function Badge({
  title,
  subtitle,
  icon,
  color,
  background,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  background: string;
}) {
  return (
    <View style={styles.badgeCard}>
      <View style={[styles.badgeIcon, { backgroundColor: background }]}> 
        <AppIcon name={icon} size={25} color={color} />
      </View>
      <View style={styles.badgeTextWrap}>
        <Text style={styles.badgeTitle}>{title}</Text>
        <Text style={styles.badgeSubtitle}>{subtitle}</Text>
      </View>
      <AppIcon name="check" size={19} color={colors.green} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  titleIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  titleTextWrap: { flex: 1, alignItems: 'flex-end' },
  title: { color: colors.text, fontSize: typography.h1, fontWeight: '900', writingDirection: 'rtl' },
  subtitle: { color: colors.textMuted, fontSize: typography.small, marginTop: 3, writingDirection: 'rtl' },
  scoreCard: { minHeight: 160, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg, overflow: 'hidden' },
  scoreDecor: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  scoreContent: { flex: 1, alignItems: 'flex-end' },
  scoreLabel: { color: colors.textMuted, fontSize: typography.small, fontWeight: '700', writingDirection: 'rtl' },
  scoreValue: { color: colors.text, fontSize: 34, fontWeight: '900', marginTop: 2 },
  scoreCaption: { color: colors.textMuted, fontSize: typography.tiny, marginTop: spacing.xs, writingDirection: 'rtl' },
  levelTrack: { width: '100%', height: 7, borderRadius: radius.pill, backgroundColor: colors.divider, marginTop: spacing.md, overflow: 'hidden' },
  levelFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.teal },
  levelBadge: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  levelNumber: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  levelText: { color: colors.primary, fontSize: 9, fontWeight: '800' },
  summaryRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, minHeight: 142, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, ...shadow },
  summaryValue: { color: colors.text, fontSize: typography.small, fontWeight: '900', marginTop: spacing.sm, textAlign: 'center' },
  summaryTitle: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center', writingDirection: 'rtl' },
  chartCard: { padding: spacing.lg, marginBottom: spacing.xl },
  chartArea: { height: 180, flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: spacing.md },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: spacing.xs },
  barTrack: { width: 20, height: 125, borderRadius: radius.pill, backgroundColor: colors.blueSoft, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: radius.pill, backgroundColor: colors.teal },
  dayLabel: { color: colors.text, fontSize: typography.small, fontWeight: '800', marginTop: spacing.sm },
  weekProgressRow: { marginTop: spacing.lg },
  weekProgressText: { color: colors.textMuted, fontSize: typography.small, textAlign: 'right', writingDirection: 'rtl' },
  weekTrack: { width: '100%', height: 8, borderRadius: radius.pill, backgroundColor: colors.divider, overflow: 'hidden', marginTop: spacing.sm },
  weekFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  badgesGrid: { gap: spacing.md },
  badgeCard: { minHeight: 78, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  badgeIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badgeTextWrap: { flex: 1, alignItems: 'flex-end' },
  badgeTitle: { color: colors.text, fontSize: typography.body, fontWeight: '900', writingDirection: 'rtl' },
  badgeSubtitle: { color: colors.textMuted, fontSize: typography.tiny, marginTop: 3, writingDirection: 'rtl' },
});
