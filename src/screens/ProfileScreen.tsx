import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { IconName } from '../types';

export function ProfileScreen() {
  const { state, resetDemo } = useAppStore();
  const [notifications, setNotifications] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(true);

  const confirmReset = () => {
    Alert.alert('איפוס נתוני ההדגמה', 'האם להחזיר את האפליקציה לנתוני ההתחלה?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'איפוס', style: 'destructive', onPress: resetDemo },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader />

      <Card style={styles.profileCard}>
        <View style={styles.largeAvatar}>
          <Text style={styles.largeAvatarText}>{state.userName.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{state.userName}</Text>
        <Text style={styles.memberSince}>חבר במצוות+ מאז תשפ״ה</Text>
        <View style={styles.statsRow}>
          <ProfileStat value={state.points.toLocaleString('he-IL')} label="נקודות" />
          <View style={styles.statDivider} />
          <ProfileStat value={`${state.torahStreak}`} label="ימי רצף" />
          <View style={styles.statDivider} />
          <ProfileStat value={`${state.dailyLogs.length}`} label="היום" />
        </View>
      </Card>

      <Text style={styles.sectionLabel}>הגדרות</Text>
      <Card style={styles.settingsCard}>
        <SettingRow icon="bell" title="תזכורות יומיות" subtitle="יעדים, לימוד וברכות">
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: colors.border, true: colors.mint }}
            thumbColor={notifications ? colors.teal : colors.white}
          />
        </SettingRow>
        <SettingRow icon="lock" title="פרופיל פרטי" subtitle="הדירוג מוצג בשם פרטי בלבד">
          <Switch
            value={privateProfile}
            onValueChange={setPrivateProfile}
            trackColor={{ false: colors.border, true: colors.mint }}
            thumbColor={privateProfile ? colors.teal : colors.white}
          />
        </SettingRow>
        <SettingRow icon="target" title="היעדים שלי" subtitle="12 מצוות ו-100 ברכות ביום">
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
        <SettingRow icon="settings" title="העדפות" subtitle="שפה, תצוגה ונגישות" last>
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
      </Card>

      <Text style={styles.sectionLabel}>פרטיות ונתונים</Text>
      <Card style={styles.settingsCard}>
        <SettingRow icon="shield" title="פרטיות" subtitle="הנתונים נשמרים במכשיר בלבד">
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
        <Pressable style={styles.resetRow} onPress={confirmReset}>
          <Text style={styles.resetText}>איפוס נתוני ההדגמה</Text>
          <View style={[styles.settingIcon, { backgroundColor: colors.coralSoft }]}> 
            <AppIcon name="reset" size={20} color={colors.danger} />
          </View>
        </Pressable>
      </Card>

      <Text style={styles.version}>מצוות+ גרסת אב-טיפוס 0.1.0</Text>
    </ScrollView>
  );
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  children,
  last = false,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.settingRow, !last && styles.settingBorder]}>
      <View style={styles.settingControl}>{children}</View>
      <View style={styles.settingTextWrap}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.settingIcon}>
        <AppIcon name={icon} size={20} color={colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  profileCard: { padding: spacing.xl, alignItems: 'center', marginBottom: spacing.xl },
  largeAvatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.mintSoft },
  largeAvatarText: { color: colors.white, fontSize: 32, fontWeight: '900' },
  name: { color: colors.text, fontSize: typography.h1, fontWeight: '900', marginTop: spacing.md },
  memberSince: { color: colors.textMuted, fontSize: typography.small, marginTop: 3, writingDirection: 'rtl' },
  statsRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
  profileStat: { flex: 1, alignItems: 'center' },
  profileStatValue: { color: colors.text, fontSize: typography.h3, fontWeight: '900' },
  profileStatLabel: { color: colors.textMuted, fontSize: typography.tiny, marginTop: 3, writingDirection: 'rtl' },
  statDivider: { width: 1, height: 34, backgroundColor: colors.divider },
  sectionLabel: { color: colors.textMuted, fontSize: typography.small, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl', marginBottom: spacing.sm, marginRight: spacing.xs },
  settingsCard: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  settingRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  settingBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  settingControl: { minWidth: 44, alignItems: 'flex-start' },
  settingTextWrap: { flex: 1, alignItems: 'flex-end' },
  settingTitle: { color: colors.text, fontSize: typography.body, fontWeight: '900', writingDirection: 'rtl' },
  settingSubtitle: { color: colors.textMuted, fontSize: typography.tiny, marginTop: 3, writingDirection: 'rtl', textAlign: 'right' },
  settingIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  resetRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md },
  resetText: { color: colors.danger, fontSize: typography.body, fontWeight: '900', writingDirection: 'rtl' },
  version: { color: colors.textMuted, fontSize: typography.tiny, textAlign: 'center', marginTop: spacing.sm, writingDirection: 'rtl' },
});
