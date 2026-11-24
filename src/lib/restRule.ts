import { cityById } from '../data/locations';
import { isRestDayKey } from './jewishCalendar';

/**
 * Shabbat / Yom Tov rule for past and present days: each day uses the city in force on it
 * (locationHistory), so moving city never rewrites closed days (round 8, A06). Cached per day.
 */
export function restRuleFor(history: Array<{ from: string; cityId: string }>, fallbackCityId: string) {
  const cache = new Map<string, boolean>();
  return (key: string): boolean => {
    let v = cache.get(key);
    if (v === undefined) {
      let cityId = history[0]?.cityId ?? fallbackCityId;
      for (const h of history) if (h.from <= key) cityId = h.cityId;
      v = isRestDayKey(key, cityById(cityId).il);
      cache.set(key, v);
    }
    return v;
  };
}
