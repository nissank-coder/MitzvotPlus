import React, { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
import { useAppStore, AppStoreProvider } from './store/AppStore';
import { BlessingsScreen } from './screens/BlessingsScreen';
import { CommunityScreen } from './screens/CommunityScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LashonHaraScreen } from './screens/LashonHaraScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { TorahScreen } from './screens/TorahScreen';
import { FeatureKey, TabKey } from './types';

function MitzvotApp() {
  const { hydrated, state } = useAppStore();
  const [tab, setTab] = useState<TabKey>('home');
  const [feature, setFeature] = useState<FeatureKey>(null);
  const [quickAddVisible, setQuickAddVisible] = useState(false);

  // After "delete all data" the user goes through onboarding again and should land on the home tab.
  useEffect(() => {
    if (!state.onboarded) {
      setTab('home');
      setFeature(null);
    }
  }, [state.onboarded]);

  const selectTab = (next: TabKey) => {
    setFeature(null);
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const openFeature = (next: FeatureKey) => {
    setFeature(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const openProfile = () => selectTab('profile');
  const openCommunity = () => selectTab('community');

  const content = (() => {
    if (feature === 'blessings') {
      return <BlessingsScreen onBack={() => openFeature(null)} onOpenProfile={openProfile} />;
    }
    if (feature === 'torah') {
      return <TorahScreen onBack={() => openFeature(null)} onOpenProfile={openProfile} />;
    }
    if (feature === 'speech') {
      return <LashonHaraScreen onBack={() => openFeature(null)} onOpenProfile={openProfile} />;
    }

    switch (tab) {
      case 'goals':
        return (
          <GoalsScreen
            onOpenProfile={openProfile}
            onOpenBlessings={() => openFeature('blessings')}
            onOpenTorah={() => openFeature('torah')}
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
            onOpenFeature={openFeature}
            onOpenProfile={openProfile}
            onOpenCommunity={openCommunity}
            onQuickAdd={() => setQuickAddVisible(true)}
          />
        );
    }
  })();

  if (!hydrated) {
    return (
      <div className="min-h-dvh max-w-[460px] mx-auto flex flex-col items-center justify-center bg-[#F4F8FB]">
        <div dir="rtl" className="text-[#17324D] text-[34px] font-black">
          מצוות<span className="text-[#2AAE9B]">+</span>
        </div>
        <p dir="rtl" className="text-[#718397] text-[14px] mt-2">
          מכינים את היום שלך...
        </p>
      </div>
    );
  }

  if (!state.onboarded) {
    return <OnboardingScreen />;
  }

  return (
    <div className="min-h-dvh max-w-[460px] mx-auto flex flex-col bg-[#F4F8FB] sm:border-x sm:border-[#DDE8EE] sm:shadow-xl">
      <main className="flex-1 flex flex-col">{content}</main>
      <BottomNav active={tab} onSelect={selectTab} onAdd={() => setQuickAddVisible(true)} />
      <QuickAddSheet visible={quickAddVisible} onClose={() => setQuickAddVisible(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <MitzvotApp />
    </AppStoreProvider>
  );
}
