import React, { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
import { useAppStore, AppStoreProvider } from './store/AppStore';
import { BlessingGuideScreen } from './screens/BlessingGuideScreen';
import { BlessingsScreen } from './screens/BlessingsScreen';
import { CommunityScreen } from './screens/CommunityScreen';
import { ContentScreen } from './screens/ContentScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { HolidaysScreen } from './screens/HolidaysScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LashonHaraScreen } from './screens/LashonHaraScreen';
import { LearningScreen } from './screens/LearningScreen';
import { MitzvotScreen } from './screens/MitzvotScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PrayersScreen } from './screens/PrayersScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ShabbatLockScreen } from './screens/ShabbatLockScreen';
import { TorahScreen } from './screens/TorahScreen';
import { FeatureKey, TabKey } from './types';

function MitzvotApp() {
  const { hydrated, state, calendar } = useAppStore();
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
  const back = () => openFeature(null);

  const content = (() => {
    const common = { onBack: back, onOpenProfile: openProfile };
    switch (feature) {
      case 'blessings':
        return <BlessingsScreen {...common} />;
      case 'torah':
        return <TorahScreen {...common} />;
      case 'speech':
        return <LashonHaraScreen {...common} />;
      case 'prayers':
        return <PrayersScreen {...common} />;
      case 'blessingGuide':
        return <BlessingGuideScreen {...common} />;
      case 'learning':
        return <LearningScreen {...common} />;
      case 'mitzvot':
        return <MitzvotScreen {...common} />;
      case 'holidays':
        return <HolidaysScreen {...common} />;
      case 'goals':
        return (
          <GoalsScreen
            onBack={back}
            onOpenProfile={openProfile}
            onOpenBlessings={() => openFeature('blessings')}
            onOpenTorah={() => openFeature('torah')}
          />
        );
      default:
        break;
    }

    switch (tab) {
      case 'content':
        return <ContentScreen onOpenFeature={openFeature} onOpenProfile={openProfile} />;
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
            onOpenCommunity={() => selectTab('community')}
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

  if (calendar.rest.active) {
    return <ShabbatLockScreen />;
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
