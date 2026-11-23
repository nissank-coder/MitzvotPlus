import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BottomNav } from './src/components/BottomNav';
import { QuickAddSheet } from './src/components/QuickAddSheet';
import { useAppStore, AppStoreProvider } from './src/store/AppStore';
import { BlessingsScreen } from './src/screens/BlessingsScreen';
import { CommunityScreen } from './src/screens/CommunityScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LashonHaraScreen } from './src/screens/LashonHaraScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TorahScreen } from './src/screens/TorahScreen';
import { colors } from './src/theme';
import { FeatureKey, TabKey } from './src/types';

function MitzvotApp() {
  const { hydrated } = useAppStore();
  const [tab, setTab] = useState<TabKey>('home');
  const [feature, setFeature] = useState<FeatureKey>(null);
  const [quickAddVisible, setQuickAddVisible] = useState(false);

  const selectTab = (next: TabKey) => {
    setFeature(null);
    setTab(next);
  };

  const openProfile = () => selectTab('profile');
  const openCommunity = () => selectTab('community');

  const content = (() => {
    if (feature === 'blessings') {
      return <BlessingsScreen onBack={() => setFeature(null)} onOpenProfile={openProfile} />;
    }
    if (feature === 'torah') {
      return <TorahScreen onBack={() => setFeature(null)} onOpenProfile={openProfile} />;
    }
    if (feature === 'speech') {
      return <LashonHaraScreen onBack={() => setFeature(null)} onOpenProfile={openProfile} />;
    }

    switch (tab) {
      case 'goals':
        return (
          <GoalsScreen
            onOpenProfile={openProfile}
            onOpenBlessings={() => setFeature('blessings')}
            onOpenTorah={() => setFeature('torah')}
          />
        );
      case 'community':
        return <CommunityScreen onOpenProfile={openProfile} />;
      case 'profile':
        return <ProfileScreen />;
      case 'home':
      default:
        return (
          <HomeScreen
            onOpenFeature={setFeature}
            onOpenProfile={openProfile}
            onOpenCommunity={openCommunity}
            onQuickAdd={() => setQuickAddVisible(true)}
          />
        );
    }
  })();

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loading} edges={['top', 'right', 'bottom', 'left']}>
        <Text style={styles.loadingLogo}>מצוות<Text style={styles.loadingPlus}>+</Text></Text>
        <Text style={styles.loadingText}>מכינים את היום שלך...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.appBody}>{content}</View>
      <BottomNav active={tab} onSelect={selectTab} onAdd={() => setQuickAddVisible(true)} />
      <QuickAddSheet visible={quickAddVisible} onClose={() => setQuickAddVisible(false)} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <AppStoreProvider>
        <MitzvotApp />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appBody: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingLogo: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  loadingPlus: {
    color: colors.teal,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 8,
    writingDirection: 'rtl',
  },
});
