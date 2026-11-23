import { ActionKey } from './actions';

export type HolidayGuide = {
  key: string;
  title: string;
  /** Matched against hebcal's English event description. */
  match: RegExp;
  summary: string;
  laws: string[];
  actions: ActionKey[];
};

export const holidayGuides: HolidayGuide[] = [
  {
    key: 'roshChodesh',
    title: 'ראש חודש',
    match: /^Rosh Chodesh/,
    summary: 'חידוש הלבנה ותחילת חודש עברי חדש.',
    laws: ['מוסיפים "יעלה ויבוא" בתפילה ובברכת המזון', 'אומרים הלל בדילוג', 'תפילת מוסף', 'נוהגים להרבות בסעודה'],
    actions: ['hallel', 'musaf'],
  },
  {
    key: 'roshHashana',
    title: 'ראש השנה',
    match: /^Rosh Hashana (\d{4}|II)$|^Erev Rosh Hashana$/,
    summary: 'יום הדין ותחילת השנה. ממליכים את ה׳ על העולם.',
    laws: ['שמיעת מאה קולות שופר', 'אכילת סימנים בליל החג', 'תשליך ביום הראשון (אם אינו שבת)', 'הדלקת נרות וקידוש', 'מרבים בתפילה ונמנעים משינה ביום'],
    actions: ['shofar', 'kiddush', 'shabbatMeal'],
  },
  {
    key: 'tzomGedaliah',
    title: 'צום גדליה',
    match: /Tzom Gedaliah/,
    summary: 'תענית על הריגת גדליה בן אחיקם.',
    laws: ['הצום מעלות השחר עד צאת הכוכבים', 'קריאת התורה "ויחל" במנחה', 'חולים ומעוברות – לשאול רב'],
    actions: ['fastDay'],
  },
  {
    key: 'yomKippur',
    title: 'יום הכיפורים',
    match: /^(Erev )?Yom Kippur$/,
    summary: 'יום הסליחה והכפרה – "לפני ה׳ תטהרו".',
    laws: ['חמישה עינויים: אכילה ושתייה, רחיצה, סיכה, נעילת הסנדל ותשמיש המיטה', 'מצווה לאכול בערב יום הכיפורים', 'וידוי בכל התפילות', 'לבקש מחילה מהחברים לפני החג'],
    actions: ['fastDay'],
  },
  {
    key: 'sukkot',
    title: 'סוכות',
    match: /^Sukkot|^Erev Sukkot$/,
    summary: 'זמן שמחתנו – יושבים בסוכה ונוטלים ארבעה מינים.',
    laws: ['אוכלים סעודות בסוכה ומברכים "לישב בסוכה"', 'נטילת ארבעה מינים בכל יום (חוץ משבת)', 'הלל שלם', 'אושפיזין – הכנסת אורחים'],
    actions: ['sukkah', 'lulav', 'hallel'],
  },
  {
    key: 'simchatTorah',
    title: 'שמיני עצרת ושמחת תורה',
    match: /Shmini Atzeret|Simchat Torah/,
    summary: 'סיום וחידוש קריאת התורה, בשמחה גדולה.',
    laws: ['הקפות עם ספרי התורה', 'תפילת גשם', 'מתחילים לומר "משיב הרוח ומוריד הגשם"'],
    actions: ['shabbatMeal', 'torahStudy'],
  },
  {
    key: 'chanukah',
    title: 'חנוכה',
    match: /^Chanukah/,
    summary: 'נס פך השמן והניצחון על היוונים – "להודות ולהלל".',
    laws: ['מדליקים נרות בכל לילה ומוסיפים נר', 'הלל שלם בכל ימי החג', '"על הניסים" בתפילה ובברכת המזון', 'בערב שבת מדליקים לפני נרות שבת'],
    actions: ['chanukahCandles', 'hallel'],
  },
  {
    key: 'asaraBTevet',
    title: 'עשרה בטבת',
    match: /Asara B'Tevet/,
    summary: 'תחילת המצור על ירושלים.',
    laws: ['צום מעלות השחר עד צאת הכוכבים', 'סליחות ו"עננו"'],
    actions: ['fastDay'],
  },
  {
    key: 'tuBishvat',
    title: 'ט״ו בשבט',
    match: /Tu BiShvat/,
    summary: 'ראש השנה לאילנות.',
    laws: ['נוהגים לאכול מפירות ארץ ישראל ומשבעת המינים', 'מקפידים על סדר קדימה בברכות', 'אין אומרים תחנון'],
    actions: ['blessing'],
  },
  {
    key: 'taanitEsther',
    title: 'תענית אסתר',
    match: /Ta'anit Esther/,
    summary: 'זכר לצום של אסתר והעם לפני המלחמה.',
    laws: ['צום מעלות השחר עד צאת הכוכבים', 'נותנים "זכר למחצית השקל" לפני פורים'],
    actions: ['fastDay', 'charity'],
  },
  {
    key: 'purim',
    title: 'פורים',
    match: /^(Erev )?Purim$|^Shushan Purim$/,
    summary: '"ונהפוך הוא" – הצלת עם ישראל בימי מרדכי ואסתר.',
    laws: ['מקרא מגילה בלילה וביום', 'משלוח מנות – שתי מנות לאדם אחד', 'מתנות לאביונים – לשני עניים', 'סעודת פורים ביום', 'בירושלים חוגגים בט״ו (שושן פורים)'],
    actions: ['megillah', 'mishloachManot', 'matanotLaevyonim', 'purimSeuda'],
  },
  {
    key: 'pesach',
    title: 'פסח',
    match: /^(Erev )?Pesach|^Ta'anit Bechorot$/,
    summary: 'חג החירות – יציאת מצרים.',
    laws: ['בדיקת חמץ בליל י״ד בניסן וביעור חמץ בבוקר', 'מכירת חמץ', 'ליל הסדר: ארבע כוסות, מצה, מרור וסיפור יציאת מצרים', 'איסור חמץ בכל ימי החג', 'ספירת העומר מליל שני'],
    actions: ['bedikatChametz', 'seder', 'hallel'],
  },
  {
    key: 'lagBaomer',
    title: 'ל״ג בעומר',
    match: /Lag BaOmer/,
    summary: 'הילולת רבי שמעון בר יוחאי ופסיקת המגפה בתלמידי רבי עקיבא.',
    laws: ['אין אומרים תחנון', 'מרבים באהבת ישראל'],
    actions: ['omer', 'torahStudy'],
  },
  {
    key: 'shavuot',
    title: 'שבועות',
    match: /Shavuot/,
    summary: 'זמן מתן תורתנו.',
    laws: ['נוהגים להיות ערים בליל החג ולומדים תורה', 'מאכלי חלב', 'קריאת עשרת הדיברות ומגילת רות'],
    actions: ['torahStudy', 'kiddush', 'shabbatMeal'],
  },
  {
    key: 'tamuz17',
    title: 'י״ז בתמוז',
    match: /Tzom Tammuz/,
    summary: 'הבקעת חומות ירושלים ותחילת בין המצרים.',
    laws: ['צום מעלות השחר עד צאת הכוכבים', 'מתחילים מנהגי אבלות של שלושת השבועות'],
    actions: ['fastDay'],
  },
  {
    key: 'tishaBav',
    title: 'תשעה באב',
    match: /Tish'a B'Av/,
    summary: 'חורבן בית המקדש.',
    laws: ['צום משקיעה עד צאת הכוכבים', 'איכה וקינות', 'איסור רחיצה, סיכה, נעילת הסנדל ותשמיש', 'ישיבה על הארץ עד חצות', 'אין לומדים תורה מלבד ענייני אבלות'],
    actions: ['fastDay'],
  },
];

export function guideForDesc(desc: string): HolidayGuide | undefined {
  return holidayGuides.find((g) => g.match.test(desc));
}
