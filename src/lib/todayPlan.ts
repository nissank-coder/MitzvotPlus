import { ActionKey, actionDef } from '../data/actions';
import { ActivityLog, Gender } from '../types';
import { DayInfo, ZmanimForDay } from './jewishCalendar';

export type PlanItem = {
  key: ActionKey;
  title: string;
  note?: string;
  /** Latest proper time, e.g. end of the time for Shema. */
  deadline?: Date | null;
  /** Earliest proper time, e.g. candle lighting. */
  from?: Date | null;
  done: boolean;
  /** How many times required today (e.g. Megillah twice). */
  required: number;
  count: number;
};

function has(info: DayInfo, pattern: RegExp): boolean {
  return info.holidays.some((h) => pattern.test(h.desc));
}

/**
 * The checklist of mitzvot for a given (non-rest) day, from the Hebrew calendar and the user profile.
 * Shabbat and Yom Tov days are handled by the post-Shabbat backfill instead.
 */
export function buildTodayPlan(
  info: DayInfo,
  z: ZmanimForDay,
  gender: Gender,
  todayLogs: ActivityLog[],
): PlanItem[] {
  const items: Array<Omit<PlanItem, 'done' | 'count'> & { required?: number }> = [];
  const male = gender === 'male';
  const add = (key: ActionKey, extra: Partial<Omit<PlanItem, 'key' | 'done' | 'count'>> = {}) =>
    items.push({ key, title: extra.title ?? actionDef(key).title, required: extra.required ?? 1, ...extra });

  if (info.isRestDay) return [];

  // Every weekday
  add('birkotHashachar');
  if (male) add('tefillin', { deadline: z.sunset, note: 'עד השקיעה' });
  if (male) add('shema', { deadline: z.sofZmanShma, note: 'עד סוף זמן קריאת שמע' });
  add('shacharit', { deadline: z.sofZmanTfilla, note: male ? 'עד סוף זמן תפילה' : 'תפילה' });
  if (info.isRoshChodesh || info.chanukahCandles) add('hallel');
  if (info.isRoshChodesh || info.isCholHamoed) add('musaf');
  add('mincha', { deadline: z.sunset, note: 'עד השקיעה' });
  if (male) add('arvit', { from: z.tzeit });
  add('birkatHamazon');
  add('dailyTorah');
  add('charity', info.isErevRest ? { note: 'צדקה לפני שבת' } : {});

  // Erev Shabbat / Yom Tov
  if (info.isErevRest) {
    add('candleLighting', { deadline: z.candleLighting, note: male ? 'לנשים, ולגבר הגר לבד' : undefined });
    if (info.weekday === 5) {
      add('challah', { note: 'כשאופים חלות בשיעור הפרשה' });
      if (male) add('shnayimMikra');
    }
  }

  // Seasonal
  if (info.omerDay) add('omer', { title: `ספירת העומר – יום ${info.omerDay}`, from: z.tzeit, note: info.omerText ?? undefined });
  if (info.chanukahCandles) {
    add('chanukahCandles', {
      title: `נר ${info.chanukahCandles} של חנוכה`,
      note: info.chanukahCandles === 1 ? 'נר אחד ושמש' : `${info.chanukahCandles} נרות ושמש`,
      from: info.weekday === 5 ? null : z.sunset,
    });
  }
  if (info.isFast) add('fastDay');
  if (has(info, /^Purim$|^Shushan Purim$/)) {
    add('megillah', { required: 2, note: 'בלילה וביום' });
    add('mishloachManot');
    add('matanotLaevyonim');
    add('purimSeuda');
  }
  if (has(info, /Erev Pesach/)) add('seder', { title: 'ליל הסדר (הערב)', from: z.tzeit });
  if (has(info, /^Sukkot/)) {
    add('sukkah');
    if (!has(info, /Shmini/)) add('lulav');
  }
  // Bedikat chametz: the evening before Erev Pesach (13 Nisan evening).
  if (has(info, /Ta'anit Bechorot/) || info.hebrewDate.startsWith('י״ג ניסן')) add('bedikatChametz', { from: z.tzeit });

  return items.map((item) => {
    const count = todayLogs.filter((l) => l.actionKey === item.key).length;
    return { ...item, required: item.required ?? 1, count, done: count >= (item.required ?? 1) } as PlanItem;
  });
}

/** What should be filled in after a Shabbat / Yom Tov day. */
export function backfillChecklist(info: DayInfo, gender: Gender): Array<{ key: ActionKey; title: string; times?: number }> {
  const male = gender === 'male';
  const list: Array<{ key: ActionKey; title: string; times?: number }> = [];
  list.push({ key: 'kiddush', title: 'קידוש' });
  list.push({ key: 'shabbatMeal', title: info.isShabbat ? 'שלוש סעודות' : 'סעודות החג', times: info.isShabbat ? 3 : 2 });
  list.push({ key: 'shacharit', title: 'שחרית' });
  list.push({ key: 'musaf', title: 'מוסף' });
  list.push({ key: 'mincha', title: 'מנחה' });
  if (male) list.push({ key: 'arvit', title: 'ערבית' });
  list.push({ key: 'torahStudy', title: 'לימוד תורה' });
  if (has(info, /^Rosh Hashana (\d{4}|II)$/)) list.push({ key: 'shofar', title: 'שמיעת קול שופר' });
  if (has(info, /^Sukkot/)) list.push({ key: 'sukkah', title: 'ישיבה בסוכה' });
  if (has(info, /Pesach I$|Pesach II$/)) list.push({ key: 'seder', title: 'ליל הסדר' });
  if (has(info, /^Yom Kippur$/)) {
    return [
      { key: 'fastDay', title: 'צום יום הכיפורים' },
      { key: 'shacharit', title: 'שחרית' },
      { key: 'musaf', title: 'מוסף' },
      { key: 'mincha', title: 'מנחה' },
      { key: 'prayer', title: 'נעילה' },
      { key: 'havdalah', title: 'הבדלה' },
    ];
  }
  list.push({ key: 'havdalah', title: 'הבדלה' });
  return list;
}
