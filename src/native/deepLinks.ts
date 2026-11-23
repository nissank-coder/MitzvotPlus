import { FeatureKey, TabKey } from '../types';

export const URL_SCHEME = 'mitzvotplus';

const FEATURES: Array<Exclude<FeatureKey, null>> = [
  'blessings', 'torah', 'speech', 'goals', 'prayers', 'blessingGuide', 'learning', 'mitzvot', 'holidays',
];
const TABS: TabKey[] = ['home', 'content', 'community', 'profile'];

export type DeepLinkTarget = { tab: TabKey; feature: FeatureKey };

/**
 * Parses links such as `mitzvotplus://open/blessings` or `mitzvotplus://tab/profile`.
 * Anything unknown returns null and is ignored (never navigates to an unexpected place).
 */
export function parseDeepLink(url: string): DeepLinkTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${URL_SCHEME}:`) return null;
  // For custom schemes the first segment is the "host".
  const parts = [parsed.hostname, ...parsed.pathname.split('/')].filter(Boolean);
  const [kind, name] = parts;
  if (kind === 'open' && name && (FEATURES as string[]).includes(name)) {
    return { tab: 'content', feature: name as Exclude<FeatureKey, null> };
  }
  if (kind === 'tab' && name && (TABS as string[]).includes(name)) {
    return { tab: name as TabKey, feature: null };
  }
  return null;
}
