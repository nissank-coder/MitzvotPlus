export const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in the device's local time zone. */
export function localDateKey(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a YYYY-MM-DD key as local noon (noon avoids DST edge cases). */
export function dateFromKey(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key: string, days: number): string {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(key: string): number {
  return dateFromKey(key).getDay();
}

/** The Sunday that opens the week containing `key` (Jewish week: Sunday–Shabbat). */
export function weekStartKey(key: string): string {
  return addDays(key, -weekday(key));
}

/** The seven date keys (Sunday → Shabbat) of the week containing `key`. */
export function weekKeys(key: string): string[] {
  const start = weekStartKey(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(timestamp),
  );
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** Hebrew numeral with geresh/gershayim, e.g. 787 → תשפ״ז, 15 → ט״ו. Supports 1–999. */
export function hebrewNumeral(value: number): string {
  const n = value % 1000;
  let letters = HUNDREDS[Math.floor(n / 100)] ?? '';
  const rest = n % 100;
  if (rest === 15) letters += 'טו';
  else if (rest === 16) letters += 'טז';
  else letters += (TENS[Math.floor(rest / 10)] ?? '') + (ONES[rest % 10] ?? '');
  if (letters.length === 1) return `${letters}׳`;
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

/** Hebrew year of a date written in letters, e.g. תשפ״ז. */
export function hebrewYear(date: Date | number = new Date()): string {
  try {
    const year = Number(
      new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric' }).format(
        typeof date === 'number' ? new Date(date) : date,
      ),
    );
    return Number.isFinite(year) ? hebrewNumeral(year) : '';
  } catch {
    return '';
  }
}
