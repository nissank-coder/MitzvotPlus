import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { DeepLinkTarget, parseDeepLink } from './deepLinks';
import { BACKEND_ENABLED } from '../backend/config';
import { deliverAuthCallback, parseAuthCallback } from '../backend/oauth';

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
          // Round 13: a sign-in return (dev / staging builds only) goes to the account section.
          const auth = BACKEND_ENABLED ? parseAuthCallback(url) : null;
          if (auth) return deliverAuthCallback(auth);
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
      const auth = BACKEND_ENABLED && launch?.url ? parseAuthCallback(launch.url) : null;
      if (auth) deliverAuthCallback(auth);
      const target = launch?.url && !auth ? parseDeepLink(launch.url) : null;
      if (target && !disposed) ref.current.onDeepLink(target);
    })();

    return () => {
      disposed = true;
      removers.forEach((r) => r());
    };
  }, []);
}
