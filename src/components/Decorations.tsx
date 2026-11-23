import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export function CitySilhouette({ opacity = 0.32 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <View style={styles.horizon} />
      <View style={[styles.building, { left: 18, width: 46, height: 34 }]} />
      <View style={[styles.building, { left: 60, width: 34, height: 48 }]} />
      <View style={[styles.building, { left: 92, width: 56, height: 28 }]} />
      <View style={[styles.tower, { left: 42, bottom: 24 }]} />
      <View style={[styles.tree, { left: 10, bottom: 20, height: 42 }]} />
      <View style={[styles.tree, { left: 142, bottom: 20, height: 36 }]} />
      <View style={[styles.sun, { left: 112, top: 15 }]} />
    </View>
  );
}

export function HillDecoration() {
  return (
    <View pointerEvents="none" style={styles.hillWrap}>
      <View style={styles.sunGlow} />
      <View style={styles.backHill} />
      <View style={styles.frontHill} />
      <View style={styles.path} />
      <View style={styles.flagPole} />
      <View style={styles.flag} />
    </View>
  );
}

const styles = StyleSheet.create({
  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    height: 2,
    backgroundColor: colors.primary,
  },
  building: {
    position: 'absolute',
    bottom: 20,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  tower: {
    position: 'absolute',
    width: 13,
    height: 62,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  tree: {
    position: 'absolute',
    width: 8,
    backgroundColor: colors.teal,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  sun: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.gold,
  },
  hillWrap: {
    width: 120,
    height: 92,
    overflow: 'hidden',
  },
  sunGlow: {
    position: 'absolute',
    left: 32,
    top: 6,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF0B7',
  },
  backHill: {
    position: 'absolute',
    width: 120,
    height: 70,
    borderRadius: 60,
    backgroundColor: '#BFE5E0',
    bottom: -28,
    left: 20,
    transform: [{ rotate: '-8deg' }],
  },
  frontHill: {
    position: 'absolute',
    width: 126,
    height: 74,
    borderRadius: 63,
    backgroundColor: '#7EC6BB',
    bottom: -42,
    left: -20,
    transform: [{ rotate: '8deg' }],
  },
  path: {
    position: 'absolute',
    width: 10,
    height: 84,
    backgroundColor: '#F5E7C9',
    bottom: -12,
    left: 58,
    borderRadius: 12,
    transform: [{ rotate: '16deg' }],
  },
  flagPole: {
    position: 'absolute',
    width: 2,
    height: 28,
    backgroundColor: colors.primaryDark,
    top: 17,
    left: 78,
  },
  flag: {
    position: 'absolute',
    width: 20,
    height: 12,
    backgroundColor: colors.coral,
    top: 17,
    left: 80,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
});
