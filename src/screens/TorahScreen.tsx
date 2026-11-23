import * as Speech from 'expo-speech';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { FeatureHeader } from '../components/FeatureHeader';
import { ProgressRing } from '../components/ProgressRing';
import { TORAH_TEXT } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

function todayHebrewLabel(): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }).format(new Date());
  }
}

export function TorahScreen({ onBack, onOpenProfile }: Props) {
  const {
    state,
    toggleTorahSaved,
    completeTorah,
    setReflection,
  } = useAppStore();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const dateLabel = useMemo(todayHebrewLabel, []);
  const streakProgress = Math.min(1, state.torahStreak / 30);

  useEffect(() => () => {
    void Speech.stop();
  }, []);

  const toggleSpeech = async () => {
    if (isSpeaking) {
      await Speech.stop();
      setIsSpeaking(false);
      return;
    }
    Speech.speak(TORAH_TEXT, {
      language: 'he-IL',
      rate: 0.88,
      onStart: () => setIsSpeaking(true),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const shareText = async () => {
    await Share.share({
      message: `מחשבה יומית ממצוות+\n\n${TORAH_TEXT}\n\nמסכת אבות, פרק ב׳ משנה א׳`,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <AppHeader onProfilePress={onOpenProfile} />
      <FeatureHeader
        title="דבר תורה"
        subtitle="רגע קצר של לימוד ומשמעות"
        icon="book"
        onBack={onBack}
      />

      <View style={styles.scenicHeader}>
        <CitySilhouette opacity={0.28} />
        <View style={styles.scenicText}>
          <Text style={styles.scenicTitle}>דבר תורה יומי</Text>
          <Text style={styles.scenicSubtitle}>כמה דקות שמאירות את היום</Text>
        </View>
      </View>

      <Card style={styles.mainCard}>
        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{dateLabel}</Text>
          <AppIcon name="calendar" size={18} color={colors.primary} />
        </View>

        <View style={styles.dividerLeaf}>
          <View style={styles.dividerLine} />
          <AppIcon name="leaf" size={20} color={colors.teal} />
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.articleTitle}>מחשבה יומית</Text>
        <Text style={styles.articleText}>{TORAH_TEXT}</Text>
        <View style={styles.sourcePill}>
          <Text style={styles.sourceText}>מסכת אבות, פרק ב׳ משנה א׳</Text>
        </View>

        <View style={styles.actionsRow}>
          <ActionButton
            label={isSpeaking ? 'עצור' : 'האזן'}
            icon={isSpeaking ? 'pause' : 'play'}
            active={isSpeaking}
            onPress={toggleSpeech}
          />
          <ActionButton label="שתף" icon="share" onPress={shareText} />
          <ActionButton
            label={state.torahSaved ? 'נשמר' : 'שמור'}
            icon="bookmark"
            active={state.torahSaved}
            onPress={toggleTorahSaved}
          />
        </View>

        <Pressable
          style={[styles.completeButton, state.torahCompletedToday && styles.completeButtonDone]}
          onPress={completeTorah}
          disabled={state.torahCompletedToday}
        >
          <AppIcon
            name={state.torahCompletedToday ? 'check' : 'book'}
            size={20}
            color={state.torahCompletedToday ? colors.green : colors.white}
          />
          <Text style={[styles.completeText, state.torahCompletedToday && styles.completeTextDone]}>
            {state.torahCompletedToday ? 'הלימוד נרשם להיום' : 'סיימתי ללמוד - הוסף 20 נקודות'}
          </Text>
        </Pressable>
      </Card>

      <Card style={styles.reflectionCard}>
        <HillDecoration />
        <View style={styles.reflectionContent}>
          <View style={styles.reflectionTitleRow}>
            <Text style={styles.reflectionTitle}>איך זה פוגש אותי היום?</Text>
            <AppIcon name="edit" size={20} color={colors.primary} />
          </View>
          <Text style={styles.prompt}>איזו מצווה קטנה אוכל להוסיף היום?</Text>
          <Text style={styles.prompt}>איך היא יכולה להוסיף אור ומשמעות ליום שלי?</Text>
        </View>
      </Card>

      <Card style={styles.noteCard}>
        <View style={styles.noteHeader}>
          <Text style={styles.noteTitle}>המחשבה שלי</Text>
          <AppIcon name="edit" size={19} color={colors.teal} />
        </View>
        <TextInput
          value={state.reflection}
          onChangeText={setReflection}
          style={styles.noteInput}
          placeholder="אפשר לכתוב כאן תזכורת קצרה לעצמך..."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />
      </Card>

      <Card style={styles.streakCard}>
        <View style={styles.booksDecoration}>
          <View style={styles.bookOne} />
          <View style={styles.bookTwo} />
          <View style={styles.bookThree} />
        </View>
        <View style={styles.streakTextWrap}>
          <View style={styles.streakTitleRow}>
            <Text style={styles.streakTitle}>רצף לימוד</Text>
            <AppIcon name="flame" size={21} color={colors.coral} />
          </View>
          <Text style={styles.streakSubtitle}>דברי תורה יומיים</Text>
          <View style={styles.streakTrack}>
            <View style={[styles.streakFill, { width: `${streakProgress * 100}%` }]} />
          </View>
        </View>
        <ProgressRing progress={streakProgress} size={82} strokeWidth={8}>
          <AppIcon name="book" size={18} color={colors.teal} />
          <Text style={styles.smallRingText}>{state.torahStreak}/30</Text>
        </ProgressRing>
      </Card>

      <View style={styles.relatedRow}>
        <RelatedCard title="שיעור קצר" subtitle="3-5 דקות" icon="play" color={colors.primary} background={colors.blueSoft} />
        <RelatedCard title="מחשבה נוספת" subtitle="עוד רעיון להשראה" icon="leaf" color={colors.green} background={colors.greenSoft} />
      </View>
    </ScrollView>
  );
}

function ActionButton({
  label,
  icon,
  active = false,
  onPress,
}: {
  label: string;
  icon: 'play' | 'pause' | 'share' | 'bookmark';
  active?: boolean;
  onPress: () => void | Promise<void>;
}) {
  return (
    <Pressable style={[styles.actionButton, active && styles.actionButtonActive]} onPress={onPress}>
      <AppIcon name={icon} size={19} color={active ? colors.teal : colors.primary} />
      <Text style={[styles.actionLabel, active && styles.actionLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function RelatedCard({
  title,
  subtitle,
  icon,
  color,
  background,
}: {
  title: string;
  subtitle: string;
  icon: 'play' | 'leaf';
  color: string;
  background: string;
}) {
  return (
    <Pressable style={[styles.relatedCard, { backgroundColor: background }]}> 
      <View style={styles.relatedIcon}>
        <AppIcon name={icon} size={22} color={color} />
      </View>
      <Text style={styles.relatedTitle}>{title}</Text>
      <Text style={styles.relatedSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  scenicHeader: {
    minHeight: 126,
    borderRadius: radius.xl,
    backgroundColor: '#E8F4F7',
    borderWidth: 1,
    borderColor: '#D5E8EC',
    overflow: 'hidden',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadow,
  },
  scenicText: { alignItems: 'flex-end', paddingHorizontal: spacing.xl },
  scenicTitle: { color: colors.text, fontSize: 24, fontWeight: '900', writingDirection: 'rtl' },
  scenicSubtitle: { color: colors.textMuted, fontSize: typography.small, marginTop: spacing.xs, writingDirection: 'rtl' },
  mainCard: { padding: spacing.xl, marginBottom: spacing.lg },
  dateRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  dateText: { color: colors.textMuted, fontSize: typography.small, fontWeight: '700', writingDirection: 'rtl' },
  dividerLeaf: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  articleTitle: { color: colors.text, fontSize: 25, fontWeight: '900', textAlign: 'center', writingDirection: 'rtl' },
  articleText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 28,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: spacing.lg,
  },
  sourcePill: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  sourceText: { color: colors.textMuted, fontSize: typography.small, fontWeight: '700', writingDirection: 'rtl' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.blueSoft,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  actionButtonActive: { backgroundColor: colors.mintSoft, borderColor: colors.mint },
  actionLabel: { color: colors.primary, fontSize: typography.small, fontWeight: '800' },
  actionLabelActive: { color: colors.teal },
  completeButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    marginTop: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  completeButtonDone: { backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: '#CFE8D8' },
  completeText: { color: colors.white, fontSize: typography.small, fontWeight: '900', writingDirection: 'rtl' },
  completeTextDone: { color: colors.green },
  reflectionCard: {
    minHeight: 146,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  reflectionContent: { flex: 1, alignItems: 'flex-end' },
  reflectionTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  reflectionTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '900', writingDirection: 'rtl' },
  prompt: { color: colors.textMuted, fontSize: typography.small, lineHeight: 21, textAlign: 'right', writingDirection: 'rtl', marginTop: spacing.xs },
  noteCard: { padding: spacing.lg, marginBottom: spacing.lg },
  noteHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  noteTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '900', writingDirection: 'rtl' },
  noteInput: {
    minHeight: 100,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 22,
    writingDirection: 'rtl',
  },
  streakCard: {
    minHeight: 132,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  booksDecoration: { width: 92, height: 82, justifyContent: 'flex-end', alignItems: 'center' },
  bookOne: { position: 'absolute', width: 68, height: 58, borderRadius: 6, backgroundColor: '#244A64', transform: [{ rotate: '-7deg' }], bottom: 5 },
  bookTwo: { position: 'absolute', width: 72, height: 54, borderRadius: 6, backgroundColor: '#3F6E86', transform: [{ rotate: '6deg' }], bottom: 6 },
  bookThree: { width: 66, height: 52, borderRadius: 6, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.gold },
  streakTextWrap: { flex: 1, alignItems: 'flex-end' },
  streakTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  streakTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '900', writingDirection: 'rtl' },
  streakSubtitle: { color: colors.textMuted, fontSize: typography.small, marginTop: spacing.xs, writingDirection: 'rtl' },
  streakTrack: { width: '100%', height: 7, borderRadius: radius.pill, backgroundColor: colors.divider, marginTop: spacing.md, overflow: 'hidden' },
  streakFill: { height: '100%', backgroundColor: colors.teal, borderRadius: radius.pill },
  smallRingText: { color: colors.text, fontSize: typography.tiny, fontWeight: '900', marginTop: 1 },
  relatedRow: { flexDirection: 'row', gap: spacing.md },
  relatedCard: { flex: 1, minHeight: 118, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'flex-end', borderWidth: 1, borderColor: colors.border },
  relatedIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  relatedTitle: { color: colors.text, fontSize: typography.body, fontWeight: '900', writingDirection: 'rtl' },
  relatedSubtitle: { color: colors.textMuted, fontSize: typography.tiny, marginTop: 2, writingDirection: 'rtl' },
});
