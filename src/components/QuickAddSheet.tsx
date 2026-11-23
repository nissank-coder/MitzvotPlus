import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { quickMitzvot } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { AppIcon } from './AppIcon';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function QuickAddSheet({ visible, onClose }: Props) {
  const { addMitzvah, addBlessing } = useAppStore();

  const add = (item: (typeof quickMitzvot)[number]) => {
    if (item.title === 'ברכה') {
      addBlessing('enjoyment');
    } else {
      addMitzvah(item.title, item.icon, item.points);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="סגירה" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <AppIcon name="close" size={19} color={colors.textMuted} />
            </Pressable>
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>הוספת מצווה</Text>
              <Text style={styles.subtitle}>בחרו פעולה והיא תתווסף להיום</Text>
            </View>
          </View>

          <View style={styles.grid}>
            {quickMitzvot.map((item) => (
              <Pressable key={item.title} style={styles.option} onPress={() => add(item)}>
                <View style={[styles.optionIcon, { backgroundColor: item.background }]}> 
                  <AppIcon name={item.icon} size={24} color={item.color} />
                </View>
                <Text style={styles.optionTitle}>{item.title}</Text>
                <View style={styles.pointsPill}>
                  <Text style={styles.pointsText}>+{item.points} נק׳</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(12, 31, 48, 0.34)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    ...shadow,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTextWrap: {
    alignItems: 'flex-end',
  },
  title: {
    color: colors.text,
    fontSize: typography.h1,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginTop: 3,
    writingDirection: 'rtl',
  },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  option: {
    width: '47%',
    minHeight: 132,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  optionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  pointsPill: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
  },
  pointsText: {
    color: '#9A6A00',
    fontSize: typography.tiny,
    fontWeight: '800',
  },
});
