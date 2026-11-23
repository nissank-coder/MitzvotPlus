import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { FeatureHeader } from '../components/FeatureHeader';
import { ProgressRing } from '../components/ProgressRing';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

function durationParts(ms: number) {
  const safe = Math.max(0, ms);
  const days = Math.floor(safe / DAY_MS);
  const hours = Math.floor((safe % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((safe % HOUR_MS) / MINUTE_MS);
  return { days, hours, minutes };
}

export function LashonHaraScreen({ onBack, onOpenProfile }: Props) {
  const { state, resetSpeech } = useAppStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, now - state.lashonHaraSince);
  const current = useMemo(() => durationParts(elapsed), [elapsed]);
  const best = useMemo(() => durationParts(state.lashonHaraBestMs), [state.lashonHaraBestMs]);
  const weeklyDays = Math.min(7, current.days);
  const weeklyProgress = weeklyDays / 7;

  const confirmReset = () => {
    Alert.alert(
      'התחלה חדשה',
      'לעדכן שהייתה מעידה ולהתחיל את הספירה מחדש? הנתון נשמר רק במכשיר שלך.',
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'התחלה מחדש', style: 'destructive', onPress: resetSpeech },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader onProfilePress={onOpenProfile} />
      <FeatureHeader
        title="שמירת הלשון"
        subtitle="מתקדמים בלי שיפוטיות, יום אחרי יום"
        icon="chat"
        onBack={onBack}
      />

      <LinearGradient colors={['#F8FDFF', '#EAF7F4']} style={styles.hero}>
        <CitySilhouette opacity={0.2} />
        <View style={styles.heroRow}>
          <ProgressRing progress={weeklyProgress} size={142} strokeWidth={12}>
            <AppIcon name="shield" size={25} color={colors.teal} />
            <Text style={styles.timerDays}>{current.days} ימים</Text>
            <Text style={styles.timerSub}>{current.hours} שעות · {current.minutes} דקות</Text>
          </ProgressRing>
          <View style={styles.heroText}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>מהפעם האחרונה</Text>
              <AppIcon name="clock" size={18} color={colors.teal} />
            </View>
            <Text style={styles.heroTitle}>שמירת הלשון</Text>
            <Text style={styles.heroSubtitle}>כל רגע של תשומת לב הוא הישג בפני עצמו</Text>
            <View style={styles.privatePill}>
              <AppIcon name="lock" size={14} color={colors.primary} />
              <Text style={styles.privateText}>פרטי ונשמר במכשיר בלבד</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <Card style={styles.encouragementCard}>
        <Pressable style={styles.resetButton} onPress={confirmReset}>
          <AppIcon name="reset" size={21} color={colors.primary} />
          <Text style={styles.resetText}>התחלה חדשה</Text>
        </Pressable>
        <View style={styles.verticalDivider} />
        <View style={styles.encouragementText}>
          <View style={styles.encouragementTitleRow}>
            <Text style={styles.encouragementTitle}>כל הכבוד!</Text>
            <AppIcon name="trophy" size={22} color={colors.gold} />
          </View>
          <Text style={styles.encouragementSubtitle}>אתה בדרך לשמירה מודעת על הדיבור</Text>
        </View>
      </Card>

      <View style={styles.statsRow}>
        <StatCard
          icon="calendar"
          title="הרצף הנוכחי"
          value={`${current.days} ימים`}
          color={colors.green}
          background={colors.greenSoft}
        />
        <StatCard
          icon="chart"
          title="הממוצע"
          value="8 ימים"
          color={colors.primary}
          background={colors.blueSoft}
        />
        <StatCard
          icon="crown"
          title="השיא האישי"
          value={`${best.days} ימים`}
          color={colors.gold}
          background={colors.goldSoft}
        />
      </View>

      <Card style={styles.tipsCard}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>טיפים לשמירת הלשון</Text>
          <AppIcon name="lightbulb" size={22} color={colors.gold} />
        </View>
        <TipRow
          icon="chat"
          color={colors.primary}
          background={colors.blueSoft}
          title="עוצרים רגע לפני שמדברים"
          text="שואלים: האם זה נכון, נחוץ ומיטיב?"
        />
        <TipRow
          icon="leaf"
          color={colors.green}
          background={colors.greenSoft}
          title="מכוונים את השיחה לטוב"
          text="מעבירים את המיקוד לנושא מועיל או למילה טובה."
        />
        <TipRow
          icon="heart"
          color={colors.coral}
          background={colors.coralSoft}
          title="מדברים על האדם כפי שהיינו רוצים"
          text="חושבים איך היינו מרגישים אילו הדברים נאמרו עלינו."
          last
        />
      </Card>

      <Card style={styles.challengeCard}>
        <HillDecoration />
        <View style={styles.challengeTextWrap}>
          <View style={styles.challengeTitleRow}>
            <Text style={styles.challengeTitle}>האתגר השבועי</Text>
            <AppIcon name="target" size={21} color={colors.teal} />
          </View>
          <Text style={styles.challengeSubtitle}>7 ימים של תשומת לב לדיבור</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${weeklyProgress * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{weeklyDays}/7 ימים</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

function StatCard({
  icon,
  title,
  value,
  color,
  background,
}: {
  icon: 'calendar' | 'chart' | 'crown';
  title: string;
  value: string;
  color: string;
  background: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: background }]}> 
      <AppIcon name={icon} size={22} color={color} />
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function TipRow({
  icon,
  color,
  background,
  title,
  text,
  last = false,
}: {
  icon: 'chat' | 'leaf' | 'heart';
  color: string;
  background: string;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.tipRow, !last && styles.tipBorder]}>
      <View style={styles.tipTextWrap}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipText}>{text}</Text>
      </View>
      <View style={[styles.tipIcon, { backgroundColor: background }]}> 
        <AppIcon name={icon} size={21} color={color} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  hero: {
    minHeight: 194,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D5E8EC',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow,
  },
  heroRow: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.lg },
  heroText: { flex: 1, alignItems: 'flex-end' },
  eyebrowRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: typography.small, fontWeight: '800', writingDirection: 'rtl' },
  heroTitle: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: spacing.sm, writingDirection: 'rtl' },
  heroSubtitle: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20, marginTop: spacing.xs, textAlign: 'right', writingDirection: 'rtl' },
  timerDays: { color: colors.text, fontSize: typography.h3, fontWeight: '900', marginTop: 2 },
  timerSub: { color: colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 2, writingDirection: 'rtl' },
  privatePill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  privateText: { color: colors.primary, fontSize: 10, fontWeight: '800', writingDirection: 'rtl' },
  encouragementCard: {
    minHeight: 96,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    backgroundColor: colors.mintSoft,
  },
  resetButton: { width: 100, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  resetText: { color: colors.primary, fontSize: typography.tiny, fontWeight: '900', writingDirection: 'rtl' },
  verticalDivider: { width: 1, height: 56, backgroundColor: '#CFE7E1', marginHorizontal: spacing.md },
  encouragementText: { flex: 1, alignItems: 'flex-end' },
  encouragementTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  encouragementTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '900', writingDirection: 'rtl' },
  encouragementSubtitle: { color: colors.textMuted, fontSize: typography.small, marginTop: spacing.xs, textAlign: 'right', writingDirection: 'rtl' },
  statsRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, minHeight: 118, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, borderWidth: 1, borderColor: colors.border },
  statTitle: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center', writingDirection: 'rtl' },
  statValue: { color: colors.text, fontSize: typography.small, fontWeight: '900', marginTop: spacing.xs, textAlign: 'center' },
  tipsCard: { padding: spacing.lg, marginBottom: spacing.lg },
  sectionTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: typography.h2, fontWeight: '900', writingDirection: 'rtl' },
  tipRow: { minHeight: 84, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  tipBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  tipTextWrap: { flex: 1, alignItems: 'flex-end' },
  tipTitle: { color: colors.text, fontSize: typography.body, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  tipText: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20, marginTop: 3, textAlign: 'right', writingDirection: 'rtl' },
  tipIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  challengeCard: { minHeight: 138, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden' },
  challengeTextWrap: { flex: 1, alignItems: 'flex-end' },
  challengeTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  challengeTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '900', writingDirection: 'rtl' },
  challengeSubtitle: { color: colors.textMuted, fontSize: typography.small, marginTop: spacing.xs, writingDirection: 'rtl' },
  progressTrack: { width: '100%', height: 8, borderRadius: radius.pill, backgroundColor: colors.divider, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.teal },
  progressLabel: { color: colors.teal, fontSize: typography.tiny, fontWeight: '900', marginTop: spacing.xs },
});
