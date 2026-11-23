import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { HillDecoration } from '../components/Decorations';
import { SectionHeader } from '../components/SectionHeader';
import { leaderboard } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';

export function CommunityScreen({ onOpenProfile }: { onOpenProfile: () => void }) {
  const { state } = useAppStore();
  const communityProgress = 1540 / 2000;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader onProfilePress={onOpenProfile} />

      <View style={styles.titleRow}>
        <View style={styles.titleIcon}>
          <AppIcon name="community" size={24} color={colors.primary} />
        </View>
        <View style={styles.titleTextWrap}>
          <Text style={styles.title}>קהילה ודירוג</Text>
          <Text style={styles.subtitle}>מתקדמים יחד, בלי תחרותיות מיותרת</Text>
        </View>
      </View>

      <Card style={styles.rankCard}>
        <View style={styles.rankBadge}>
          <AppIcon name="crown" size={30} color={colors.gold} />
          <Text style={styles.rankNumber}>3</Text>
          <Text style={styles.rankLabel}>מקום</Text>
        </View>
        <View style={styles.rankTextWrap}>
          <Text style={styles.rankTitle}>הדירוג השבועי שלך</Text>
          <Text style={styles.rankPoints}>{state.points.toLocaleString('he-IL')} נקודות</Text>
          <View style={styles.rankMetaRow}>
            <View style={styles.rankMetaPill}>
              <AppIcon name="flame" size={15} color={colors.coral} />
              <Text style={styles.rankMetaText}>{state.torahStreak} ימי רצף</Text>
            </View>
            <View style={styles.rankMetaPill}>
              <AppIcon name="chart" size={15} color={colors.primary} />
              <Text style={styles.rankMetaText}>עלייה של מקום אחד</Text>
            </View>
          </View>
        </View>
      </Card>

      <Card style={styles.challengeCard}>
        <HillDecoration />
        <View style={styles.challengeTextWrap}>
          <View style={styles.challengeTitleRow}>
            <Text style={styles.challengeTitle}>אתגר הקהילה</Text>
            <AppIcon name="target" size={21} color={colors.teal} />
          </View>
          <Text style={styles.challengeSubtitle}>יעד קבוצתי: 2,000 מצוות השבוע</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${communityProgress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>1,540 מתוך 2,000</Text>
        </View>
      </Card>

      <Card style={styles.leaderboardCard}>
        <SectionHeader title="המובילים השבוע" icon="trophy" actionLabel="חברים" />
        {leaderboard.map((person, index) => {
          const isMe = person.id === 'me';
          return (
            <View key={person.id} style={[styles.personRow, isMe && styles.personRowMe, index < leaderboard.length - 1 && styles.personBorder]}>
              <View style={styles.rankPosition}>
                {index < 3 ? (
                  <View style={[styles.medal, index === 0 ? styles.goldMedal : index === 1 ? styles.silverMedal : styles.bronzeMedal]}>
                    <Text style={styles.medalText}>{index + 1}</Text>
                  </View>
                ) : (
                  <Text style={styles.positionText}>{index + 1}</Text>
                )}
              </View>
              <View style={styles.personScore}>
                <Text style={styles.personPoints}>{person.points.toLocaleString('he-IL')}</Text>
                <Text style={styles.personPointsLabel}>נק׳</Text>
              </View>
              <View style={styles.personInfo}>
                <View style={[styles.avatar, isMe && styles.avatarMe]}>
                  <Text style={[styles.avatarText, isMe && styles.avatarTextMe]}>{person.initials}</Text>
                </View>
                <View style={styles.personTextWrap}>
                  <Text style={styles.personName}>{person.name}{isMe ? ' (אתה)' : ''}</Text>
                  <View style={styles.streakRow}>
                    <AppIcon name="flame" size={13} color={colors.coral} />
                    <Text style={styles.personStreak}>{person.streak} ימים</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </Card>

      <SectionHeader title="קבוצות פעילות" icon="community" />
      <View style={styles.groupsRow}>
        <GroupCard title="לומדים כל יום" members="286 חברים" icon="book" background={colors.purpleSoft} color={colors.purple} />
        <GroupCard title="מאה ברכות" members="412 חברים" icon="star" background={colors.mintSoft} color={colors.teal} />
      </View>
    </ScrollView>
  );
}

function GroupCard({ title, members, icon, background, color }: { title: string; members: string; icon: 'book' | 'star'; background: string; color: string }) {
  return (
    <Pressable style={styles.groupCard}>
      <View style={[styles.groupIcon, { backgroundColor: background }]}> 
        <AppIcon name={icon} size={25} color={color} />
      </View>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupMembers}>{members}</Text>
      <View style={styles.joinPill}>
        <Text style={styles.joinText}>הצטרפות</Text>
      </View>
    </Pressable>
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
  rankCard: { minHeight: 148, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg, overflow: 'hidden' },
  rankBadge: { width: 88, height: 102, borderRadius: radius.lg, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  rankNumber: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 2 },
  rankLabel: { color: colors.textMuted, fontSize: typography.tiny, fontWeight: '800' },
  rankTextWrap: { flex: 1, alignItems: 'flex-end' },
  rankTitle: { color: colors.textMuted, fontSize: typography.small, fontWeight: '700', writingDirection: 'rtl' },
  rankPoints: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: spacing.xs, writingDirection: 'rtl' },
  rankMetaRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  rankMetaPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.background },
  rankMetaText: { color: colors.textMuted, fontSize: 10, fontWeight: '700', writingDirection: 'rtl' },
  challengeCard: { minHeight: 138, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg, overflow: 'hidden' },
  challengeTextWrap: { flex: 1, alignItems: 'flex-end' },
  challengeTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  challengeTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '900', writingDirection: 'rtl' },
  challengeSubtitle: { color: colors.textMuted, fontSize: typography.small, marginTop: spacing.xs, textAlign: 'right', writingDirection: 'rtl' },
  progressTrack: { width: '100%', height: 8, borderRadius: radius.pill, backgroundColor: colors.divider, overflow: 'hidden', marginTop: spacing.md },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.teal },
  progressText: { color: colors.teal, fontSize: typography.tiny, fontWeight: '900', marginTop: spacing.xs },
  leaderboardCard: { padding: spacing.lg, marginBottom: spacing.xl },
  personRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.md },
  personRowMe: { backgroundColor: colors.blueSoft },
  personBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rankPosition: { width: 36, alignItems: 'center' },
  medal: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goldMedal: { backgroundColor: '#F6C94A' },
  silverMedal: { backgroundColor: '#CAD3DC' },
  bronzeMedal: { backgroundColor: '#D59A63' },
  medalText: { color: colors.white, fontSize: typography.small, fontWeight: '900' },
  positionText: { color: colors.textMuted, fontSize: typography.small, fontWeight: '900' },
  personScore: { width: 62, alignItems: 'center' },
  personPoints: { color: colors.text, fontSize: typography.small, fontWeight: '900' },
  personPointsLabel: { color: colors.textMuted, fontSize: 9, marginTop: 1 },
  personInfo: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  avatarMe: { backgroundColor: colors.teal },
  avatarText: { color: colors.primary, fontSize: typography.small, fontWeight: '900' },
  avatarTextMe: { color: colors.white },
  personTextWrap: { flex: 1, alignItems: 'flex-end' },
  personName: { color: colors.text, fontSize: typography.body, fontWeight: '900', writingDirection: 'rtl' },
  streakRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, marginTop: 3 },
  personStreak: { color: colors.textMuted, fontSize: typography.tiny, fontWeight: '700' },
  groupsRow: { flexDirection: 'row', gap: spacing.md },
  groupCard: { flex: 1, minHeight: 174, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: spacing.md, ...shadow },
  groupIcon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { color: colors.text, fontSize: typography.body, fontWeight: '900', marginTop: spacing.sm, textAlign: 'center', writingDirection: 'rtl' },
  groupMembers: { color: colors.textMuted, fontSize: typography.tiny, marginTop: 3, writingDirection: 'rtl' },
  joinPill: { marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.blueSoft },
  joinText: { color: colors.primary, fontSize: typography.tiny, fontWeight: '900' },
});
