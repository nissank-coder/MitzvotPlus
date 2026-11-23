import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { IconName } from '../types';
import { AppIcon } from './AppIcon';

type Props = {
  title: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, icon, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      {actionLabel ? (
        <Pressable onPress={onAction} style={styles.action} hitSlop={8}>
          <AppIcon name="chevronLeft" size={16} color={colors.primary} />
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : (
        <View />
      )}
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {icon ? <AppIcon name={icon} size={20} color={colors.primary} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  titleWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: typography.h2,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});
