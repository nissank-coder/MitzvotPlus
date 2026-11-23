import type { CapacitorConfig } from '@capacitor/cli';

/**
 * appId is the permanent store identifier (bundle id / application id).
 * PENDING OWNER DECISION before the first upload to TestFlight / Play – see docs/mobile-readiness/backlog.md.
 */
const config: CapacitorConfig = {
  appId: 'com.mitzvotplus.app',
  appName: 'מצוות+',
  webDir: 'dist',
  android: {
    // No mixed content, no cleartext traffic.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // Injects --safe-area-inset-* CSS variables on Android (edge-to-edge).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
  },
};

export default config;
