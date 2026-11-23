import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { IconName } from '../types';
import { AppIcon } from './AppIcon';

type Props = {
  title: string;
  subtitle?: string;
  icon: IconName;
  onBack: () => void;
};

export function FeatureHeader({ title, subtitle, icon, onBack }: Props) {
  return (
    <View style={styles.row}>
      <Pressable style={styles.backButton} onPress={onBack} accessibilityLabel="חזרה">
        <AppIcon name="chevronRight" size={21} color={colors.primary} />
      </Pressable>
      <View style={styles.textWrap}>
        <View style={styles.titleLine}>
          <View style={styles.iconBox}>
            <AppIcon name={icon} size={20} color={colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textWrap: {
    flex: 1,
    marginRight: spacing.md,
    alignItems: 'flex-end',
  },
  titleLine: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: typography.h1,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: typography.small,
    writingDirection: 'rtl',
  },
});
