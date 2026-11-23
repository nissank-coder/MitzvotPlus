import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { IconName, TabKey } from '../types';
import { AppIcon } from './AppIcon';

const items: Array<{ key: TabKey | 'add'; label: string; icon: IconName }> = [
  { key: 'profile', label: 'פרופיל', icon: 'user' },
  { key: 'community', label: 'קהילה', icon: 'community' },
  { key: 'add', label: 'הוספה', icon: 'plus' },
  { key: 'goals', label: 'יעדים', icon: 'target' },
  { key: 'home', label: 'בית', icon: 'home' },
];

type Props = {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  onAdd: () => void;
};

export function BottomNav({ active, onSelect, onAdd }: Props) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const isAdd = item.key === 'add';
        const isActive = item.key === active;
        return (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => (isAdd ? onAdd() : onSelect(item.key as TabKey))}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <View style={[styles.iconWrap, isActive && styles.iconWrapActive, isAdd && styles.addButton]}>
              <AppIcon
                name={item.icon}
                size={isAdd ? 24 : 21}
                color={isAdd ? colors.white : isActive ? colors.primary : colors.textMuted}
                strokeWidth={isAdd ? 2.2 : 1.8}
              />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 42,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.blueSoft,
  },
  addButton: {
    width: 46,
    height: 42,
    marginTop: -14,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.primary,
  },
});
