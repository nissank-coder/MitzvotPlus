import { FeatureKey, TabKey } from '../types';
import { COMMUNITY_ENABLED } from '../config/features';

export const URL_SCHEME = 'mitzvotplus';

const FEATURES: Array<Exclude<FeatureKey, null>> = [
  'blessings', 'torah', 'speech', 'goals', 'prayers', 'blessingGuide', 'learning', 'mitzvot', 'holidays', 'siddur', 'tehillim',
];
const TABS: TabKey[] = COMMUNITY_ENABLED ? ['today', 'progress', 'tracks', 'me', 'community'] : ['today', 'progress', 'tracks', 'me'];
/** Links from earlier versions keep working. */
const TAB_ALIASES: Record<string, TabKey> = { home: 'today', content: 'tracks', profile: 'me', goals: 'progress' };

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
    if (name === 'goals') return { tab: 'progress', feature: null };
    return { tab: 'tracks', feature: name as Exclude<FeatureKey, null> };
  }
  const tab = name ? (TAB_ALIASES[name] ?? name) : undefined;
  if (kind === 'tab' && tab && (TABS as string[]).includes(tab)) {
    return { tab: tab as TabKey, feature: null };
  }
  return null;
}
