import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { FeatureHeader } from '../components/FeatureHeader';
import { ProgressRing } from '../components/ProgressRing';
import { SectionHeader } from '../components/SectionHeader';
import { blessingCategoryMeta } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { BlessingCategory } from '../types';

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

type Period = 'morning' | 'noon' | 'evening' | 'all';

const periodItems: Array<{ key: Period; label: string; icon: 'sun' | 'moon' | 'calendar' }> = [
  { key: 'morning', label: 'בוקר', icon: 'sun' },
  { key: 'noon', label: 'צהריים', icon: 'sun' },
  { key: 'evening', label: 'ערב', icon: 'moon' },
  { key: 'all', label: 'כל היום', icon: 'calendar' },
];

export function BlessingsScreen({ onBack, onOpenProfile }: Props) {
  const { state, blessingTotal, addBlessing } = useAppStore();
  const [period, setPeriod] = useState<Period>('all');
  const progress = Math.min(1, blessingTotal / state.blessingGoal);
  const remaining = Math.max(0, state.blessingGoal - blessingTotal);

  const latestLogs = useMemo(
    () => [...state.blessingLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 7),
    [state.blessingLogs],
  );

  const handleAdd = (category: BlessingCategory) => {
    if (blessingTotal >= state.blessingGoal) {
      Alert.alert('היעד הושלם', 'הגעת ל-100 ברכות להיום. כל הכבוד!');
      return;
    }
    addBlessing(category);
    if (blessingTotal + 1 === state.blessingGoal) {
      Alert.alert('100 ברכות', 'השלמת את היעד היומי. כל הכבוד!');
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader onProfilePress={onOpenProfile} />
      <FeatureHeader
        title="100 ברכות"
        subtitle="סופרים בשקט, מתקדמים בשמחה"
        icon="star"
        onBack={onBack}
      />

      <LinearGradient colors={['#F8FDFF', '#E8F7F5']} style={styles.hero}>
        <CitySilhouette opacity={0.22} />
        <View style={styles.heroRow}>
          <ProgressRing progress={progress} size={132} strokeWidth={12}>
            <AppIcon name="cup" size={25} color={colors.teal} />
            <Text style={styles.ringValue}>{blessingTotal}/100</Text>
          </ProgressRing>
          <View style={styles.heroText}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>היעד היומי</Text>
              <AppIcon name="target" size={18} color={colors.teal} />
            </View>
            <Text style={styles.heroTitle}>100 ברכות</Text>
            <Text style={styles.heroSubtitle}>
              {remaining === 0 ? 'היעד הושלם להיום' : `עוד ${remaining} ברכות להשלמת היעד`}
            </Text>
            <View style={styles.inlinePill}>
              <AppIcon name="coin" size={15} color={colors.gold} />
              <Text style={styles.inlinePillText}>5 נקודות לכל ברכה</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.periodRow}>
        {periodItems.map((item) => {
          const active = period === item.key;
          return (
            <Pressable
              key={item.key}
              style={[styles.periodPill, active && styles.periodPillActive]}
              onPress={() => setPeriod(item.key)}
            >
              <AppIcon name={item.icon} size={17} color={active ? colors.white : colors.primary} />
              <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="הוספת ברכה" icon="plus" />
      <View style={styles.categoryGrid}>
        {(Object.keys(blessingCategoryMeta) as BlessingCategory[]).map((key) => {
          const meta = blessingCategoryMeta[key];
          return (
            <Pressable key={key} style={styles.categoryCard} onPress={() => handleAdd(key)}>
              <View style={[styles.categoryIcon, { backgroundColor: meta.background }]}> 
                <AppIcon name={meta.icon} size={23} color={meta.color} />
              </View>
              <Text style={styles.categoryCount}>{state.blessingCounts[key]}</Text>
              <Text style={styles.categoryTitle}>{meta.title}</Text>
              <View style={styles.categoryAdd}>
                <AppIcon name="plus" size={14} color={colors.teal} strokeWidth={2.2} />
                <Text style={styles.categoryAddText}>הוספה</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.listCard}>
        <SectionHeader title="הברכות שלי" icon="calendar" actionLabel={`${blessingTotal} היום`} />
        {latestLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="cup" size={34} color={colors.teal} />
            <Text style={styles.emptyTitle}>הברכה הראשונה מחכה לך</Text>
            <Text style={styles.emptyText}>בחרו קטגוריה למעלה כדי להתחיל</Text>
          </View>
        ) : (
          latestLogs.map((item, index) => {
            const meta = blessingCategoryMeta[item.category];
            return (
              <View key={item.id} style={[styles.logRow, index < latestLogs.length - 1 && styles.logBorder]}>
                <View style={styles.logStatus}>
                  <AppIcon name="check" size={20} color={colors.green} />
                  <Text style={styles.logTime}>{item.time}</Text>
                </View>
                <View style={styles.logTitleWrap}>
                  <View style={styles.logTexts}>
                    <Text style={styles.logTitle}>{item.title}</Text>
                    <Text style={styles.logCategory}>{meta.title}</Text>
                  </View>
                  <View style={[styles.logIcon, { backgroundColor: meta.background }]}> 
                    <AppIcon name={meta.icon} size={19} color={meta.color} />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Card style={styles.motivationCard}>
        <HillDecoration />
        <View style={styles.motivationTextWrap}>
          <View style={styles.motivationTitleRow}>
            <Text style={styles.motivationTitle}>{remaining === 0 ? 'איזה יופי!' : 'ממשיכים בקצב שלך'}</Text>
            <AppIcon name="trophy" size={22} color={colors.gold} />
          </View>
          <Text style={styles.motivationText}>
            {remaining === 0 ? 'השלמת את היעד היומי' : `עוד ${remaining} ברכות להשלמת היעד`}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  hero: {
    minHeight: 184,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D5E8EC',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow,
  },
  heroRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  heroText: { flex: 1, alignItems: 'flex-end' },
  eyebrowRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: typography.small, fontWeight: '800', writingDirection: 'rtl' },
  heroTitle: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '900',
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
  ringValue: { color: colors.text, fontSize: typography.h3, fontWeight: '900', marginTop: 2 },
  inlinePill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inlinePillText: { color: '#946300', fontSize: typography.tiny, fontWeight: '800' },
  periodRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  periodPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  periodPillActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  periodLabel: { color: colors.text, fontSize: typography.small, fontWeight: '800' },
  periodLabelActive: { color: colors.white },
  categoryGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  categoryCard: {
    width: '47%',
    minHeight: 154,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCount: { color: colors.text, fontSize: 23, fontWeight: '900', marginTop: spacing.sm },
  categoryTitle: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  categoryAdd: {
    marginTop: spacing.sm,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  categoryAddText: { color: colors.teal, fontSize: typography.tiny, fontWeight: '900' },
  listCard: { padding: spacing.lg, marginBottom: spacing.lg },
  logRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  logBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  logStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logTime: { color: colors.textMuted, fontSize: typography.small, fontWeight: '700' },
  logTitleWrap: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  logTexts: { flex: 1, alignItems: 'flex-end' },
  logTitle: { color: colors.text, fontSize: typography.body, fontWeight: '800', writingDirection: 'rtl' },
  logCategory: { color: colors.textMuted, fontSize: typography.tiny, marginTop: 2, writingDirection: 'rtl' },
  logIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyTitle: { marginTop: spacing.sm, color: colors.text, fontSize: typography.h3, fontWeight: '900' },
  emptyText: { marginTop: spacing.xs, color: colors.textMuted, fontSize: typography.small, writingDirection: 'rtl' },
  motivationCard: {
    minHeight: 132,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    overflow: 'hidden',
  },
  motivationTextWrap: { flex: 1, alignItems: 'flex-end' },
  motivationTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  motivationTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '900', writingDirection: 'rtl' },
  motivationText: { color: colors.textMuted, fontSize: typography.small, marginTop: spacing.xs, writingDirection: 'rtl' },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.teal },
});
