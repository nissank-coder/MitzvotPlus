import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { DeepLinkTarget, parseDeepLink } from './deepLinks';

type Handlers = {
  /** Returns true when the back press was handled inside the app. */
  onBack: () => boolean;
  onDeepLink: (target: DeepLinkTarget) => void;
  onBackground: () => void;
  onForeground: () => void;
};

/**
 * Native app shell: status bar, Android back button, deep links (also when the app was closed),
 * and pause/resume. Does nothing in a regular browser.
 */
export function useNativeShell(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const removers: Array<() => void> = [];

    (async () => {
      const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
      ]);
      if (disposed) return;

      await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      await SplashScreen.hide().catch(() => undefined);

      const handles = await Promise.all([
        App.addListener('backButton', () => {
          if (!ref.current.onBack()) void App.minimizeApp();
        }),
        App.addListener('appUrlOpen', ({ url }) => {
          const target = parseDeepLink(url);
          if (target) ref.current.onDeepLink(target);
        }),
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) ref.current.onForeground();
          else ref.current.onBackground();
        }),
      ]);
      removers.push(...handles.map((h) => () => void h.remove()));

      // Cold start from a link while the app was closed.
      const launch = await App.getLaunchUrl().catch(() => undefined);
      const target = launch?.url ? parseDeepLink(launch.url) : null;
      if (target && !disposed) ref.current.onDeepLink(target);
    })();

    return () => {
      disposed = true;
      removers.forEach((r) => r());
    };
  }, []);
}
