import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
import { SaveStatusBanner } from './components/SaveStatusBanner';
import { useAppStore, AppStoreProvider } from './store/AppStore';
import { BlessingGuideScreen } from './screens/BlessingGuideScreen';
import { BlessingsScreen } from './screens/BlessingsScreen';
import { ContentScreen } from './screens/ContentScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { HolidaysScreen } from './screens/HolidaysScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LashonHaraScreen } from './screens/LashonHaraScreen';
import { MitzvotScreen } from './screens/MitzvotScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PrayersScreen } from './screens/PrayersScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { TorahScreen } from './screens/TorahScreen';
import { FeatureKey, TabKey } from './types';
import { useNativeShell } from './native/useNativeShell';

// Loaded on demand: the learning schedules are the largest data in the bundle.
const LearningScreen = lazy(() => import('./screens/LearningScreen').then((m) => ({ default: m.LearningScreen })));
// Demo-only screen: not even bundled in production (COMMUNITY_ENABLED is a build-time constant).
const CommunityScreen = COMMUNITY_ENABLED
  ? lazy(() => import('./screens/CommunityScreen').then((m) => ({ default: m.CommunityScreen })))
  : null;
// Prayer and Tehillim texts are large; they load only when opened.
const SiddurScreen = lazy(() => import('./screens/SiddurScreen').then((m) => ({ default: m.SiddurScreen })));
const TehillimScreen = lazy(() => import('./screens/TehillimScreen').then((m) => ({ default: m.TehillimScreen })));
import { COMMUNITY_ENABLED } from './config/features';

function MitzvotApp() {
  const { hydrated, state, calendar, storageError, flush, refreshClock } = useAppStore();
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
    setHistory([]);
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Screens opened from inside another screen (e.g. the Siddur from "What blessing?") return to it.
  const [history, setHistory] = useState<Array<{ feature: FeatureKey; param?: string }>>([]);
  const [featureParam, setFeatureParam] = useState<string | undefined>(undefined);

  const openFeature = (next: FeatureKey, param?: string) => {
    setHistory(next === null ? [] : (h) => (feature ? [...h, { feature, param: featureParam }] : []));
    setFeature(next);
    setFeatureParam(param);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFeature(prev ? prev.feature : null);
    setFeatureParam(prev?.param);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useNativeShell({
    onBack: () => {
      if (quickAddVisible) {
        setQuickAddVisible(false);
        return true;
      }
      if (feature) {
        goBack();
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    },
    onDeepLink: (target) => {
      setQuickAddVisible(false);
      setTab(target.tab);
      setHistory([]);
      setFeature(target.feature);
    },
    onBackground: () => void flush(),
    onForeground: refreshClock,
  });

  const openProfile = () => selectTab('profile');
  const back = goBack;

  const content = (() => {
    const common = { onBack: back, onOpenProfile: openProfile };
    const lazyFallback = <p dir="rtl" className="p-6 text-center text-[#718397]">טוען…</p>;
    const openSiddur = (id?: string) => openFeature('siddur', id);
    const openTehillim = () => openFeature('tehillim');
    switch (feature) {
      case 'blessings':
        return <BlessingsScreen {...common} />;
      case 'torah':
        return <TorahScreen {...common} />;
      case 'speech':
        return <LashonHaraScreen {...common} />;
      case 'prayers':
        return <PrayersScreen {...common} onOpenSiddur={openSiddur} />;
      case 'blessingGuide':
        return <BlessingGuideScreen {...common} onOpenSiddur={openSiddur} />;
      case 'learning':
        return (
          <Suspense fallback={<p dir="rtl" className="p-6 text-center text-[#718397]">טוען…</p>}>
            <LearningScreen {...common} onOpenTehillim={openTehillim} />
          </Suspense>
        );
      case 'siddur':
        return (
          <Suspense fallback={lazyFallback}>
            <SiddurScreen {...common} initialId={featureParam} />
          </Suspense>
        );
      case 'tehillim':
        return (
          <Suspense fallback={lazyFallback}>
            <TehillimScreen {...common} />
          </Suspense>
        );
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
            onOpenLearning={() => openFeature('learning')}
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
        if (!CommunityScreen) return <ContentScreen onOpenFeature={openFeature} onOpenProfile={openProfile} />;
        return (
          <Suspense fallback={null}>
            <CommunityScreen onOpenProfile={openProfile} />
          </Suspense>
        );
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

  if (storageError) {
    return (
      <div dir="rtl" role="alert" className="min-h-dvh max-w-[460px] mx-auto flex flex-col items-center justify-center bg-[#F4F8FB] px-6 text-center">
        <p className="text-[#17324D] text-[20px] font-black">לא הצלחנו לקרוא את הנתונים שבמכשיר</p>
        <p className="text-[#718397] text-[14px] mt-2">הנתונים לא נמחקו. סגרו את האפליקציה ופתחו אותה שוב.</p>
      </div>
    );
  }

  if (!state.onboarded) {
    return <OnboardingScreen />;
  }

  return (
    <div className="min-h-dvh max-w-[460px] mx-auto flex flex-col bg-[#F4F8FB] sm:border-x sm:border-[#DDE8EE] sm:shadow-xl">
      <SaveStatusBanner />
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
