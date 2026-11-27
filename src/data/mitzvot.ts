/**
 * An initial selection of the 613 mitzvot – those most relevant to daily life today.
 * Each entry cites its source verse.
 *
 * Round 14 (review v4 §4): the structure of a full, reviewed collection. Fields added now are
 * filled only from an identified, checked source – nothing is generated as a halachic explanation:
 *  - review: the state of the entry's text. Every current entry is PENDING_REVIEW (written for the
 *    app, never reviewed); APPROVED needs a named reviewer (docs/review-r14/MITZVOT_PLAN_HE.md);
 *  - count: the entry's number in ONE counting system (Rambam, Sefer HaMitzvot), only once mapped
 *    and checked – none is shown before that;
 *  - sources / expanded / example: an exact source and a longer explanation, once written and checked.
 * Learning about a mitzvah ("mitzvahStudy") is not doing it: `doing` names the app's own entry for
 * doing it, when there is an unambiguous one (MitzvotScreen offers both, separately).
 * The consistency of the collection is checked by scripts/content/check-mitzvot.mjs.
 */
import type { ActionKey } from './actions';

export type ReviewState = 'PENDING_REVIEW' | 'APPROVED';
export type CountingSystem = 'rambam-sefer-hamitzvot';

export type MitzvahEntry = {
  id: string;
  title: string;
  type: 'aseh' | 'lav';
  source: string;
  /** Who it applies to. */
  applies: 'all' | 'men';
  /** One of the six constant mitzvot (שש מצוות תמידיות). */
  constant?: boolean;
  summary: string;
  practice: string;
  /** Round 14: the state of the text (see above). Absent = PENDING_REVIEW. */
  review?: ReviewState;
  reviewedBy?: string;
  /** Round 14: the number in one counting system – only once mapped and checked. */
  count?: { system: CountingSystem; number: number };
  /** Round 14: exact sources (book, place) – only from an identified, checked source. */
  sources?: Array<{ label: string; sefariaRef?: string }>;
  expanded?: string;
  example?: string;
};

/** The app's entry for DOING a mitzvah, where there is exactly one (learning about it is separate). */
export const DOING: Readonly<Record<string, ActionKey>> = Object.freeze({
  'tefillin-yad': 'tefillin',
  'tefillin-rosh': 'tefillin',
  'kriat-shema': 'shema',
  'birkat-hamazon': 'birkatHamazon',
  'talmud-torah': 'torahStudy',
  'kibud-av-vaem': 'parents',
  tzedakah: 'charity',
  'zachor-shabbat': 'kiddush',
  'sefirat-haomer': 'omer',
  shofar: 'shofar',
  sukkah: 'sukkah',
  lulav: 'lulav',
  chalah: 'challah',
});

export const reviewOf = (m: MitzvahEntry): ReviewState => m.review ?? 'PENDING_REVIEW';

export const MITZVOT_TOTAL = 613;

export const mitzvot: MitzvahEntry[] = [
  { id: 'emunah', title: 'האמונה בה׳', type: 'aseh', source: 'שמות כ, ב', applies: 'all', constant: true, summary: 'להאמין שיש מצוי ראשון שהמציא כל נמצא.', practice: 'להתבונן בבוקר בפסוק "אנכי ה׳ אלקיך" ולחזק את האמונה.' },
  { id: 'achdut', title: 'ייחוד ה׳', type: 'aseh', source: 'דברים ו, ד', applies: 'all', constant: true, summary: 'להאמין שה׳ אחד, ואין עוד מלבדו.', practice: 'לכוון בפסוק "שמע ישראל" בקריאת שמע.' },
  { id: 'ahavat-hashem', title: 'אהבת ה׳', type: 'aseh', source: 'דברים ו, ה', applies: 'all', constant: true, summary: 'לאהוב את ה׳ בכל הלב, הנפש והמאד.', practice: 'להתבונן בנפלאות הבריאה ובחסדים שבחיינו.' },
  { id: 'yirat-hashem', title: 'יראת ה׳', type: 'aseh', source: 'דברים ו, יג', applies: 'all', constant: true, summary: 'להיות ירא מה׳ ולזכור שהוא רואה את מעשינו.', practice: '"שויתי ה׳ לנגדי תמיד" – לפני החלטה חשובה.' },
  { id: 'lo-elohim-acherim', title: 'שלא להאמין באלוה זולתו', type: 'lav', source: 'שמות כ, ג', applies: 'all', constant: true, summary: 'איסור להאמין בכוח אחר מלבד ה׳.', practice: 'להתרחק מאמונות טפלות וממקורות של עבודה זרה.' },
  { id: 'lo-tatur', title: 'שלא לתור אחר הלב והעיניים', type: 'lav', source: 'במדבר טו, לט', applies: 'all', constant: true, summary: 'לא ללכת אחרי מחשבות כפירה ומראות אסורים.', practice: 'לשמור על העיניים ברחוב ובמסכים.' },

  { id: 'talmud-torah', title: 'תלמוד תורה', type: 'aseh', source: 'דברים ו, ז', applies: 'all', summary: 'ללמוד תורה וללמד אותה.', practice: 'לקבוע עתים לתורה – אפילו כמה דקות בכל יום.' },
  { id: 'kriat-shema', title: 'קריאת שמע', type: 'aseh', source: 'דברים ו, ז', applies: 'men', summary: 'לקרוא קריאת שמע בבוקר ובערב.', practice: 'לקרוא לפני סוף זמן קריאת שמע.' },
  { id: 'tefilla', title: 'תפילה', type: 'aseh', source: 'דברים יא, יג', applies: 'all', summary: '"ולעבדו בכל לבבכם" – זו תפילה.', practice: 'להתפלל בכוונה, ובמניין כשאפשר.' },
  { id: 'tefillin-yad', title: 'תפילין של יד', type: 'aseh', source: 'דברים ו, ח', applies: 'men', summary: 'לקשור תפילין על היד.', practice: 'להניח בכל יום חול בשחרית.' },
  { id: 'tefillin-rosh', title: 'תפילין של ראש', type: 'aseh', source: 'דברים ו, ח', applies: 'men', summary: 'להניח תפילין על הראש.', practice: 'לוודא שהתפילין בדוקות ומונחות במקומן.' },
  { id: 'mezuzah', title: 'מזוזה', type: 'aseh', source: 'דברים ו, ט', applies: 'all', summary: 'לקבוע מזוזה בפתחי הבית.', practice: 'לבדוק מזוזות פעמיים בשבע שנים.' },
  { id: 'tzitzit', title: 'ציצית', type: 'aseh', source: 'במדבר טו, לח', applies: 'men', summary: 'לעשות ציצית בכנפות בגד בן ארבע כנפות.', practice: 'ללבוש טלית קטן בכל יום.' },
  { id: 'birkat-hamazon', title: 'ברכת המזון', type: 'aseh', source: 'דברים ח, י', applies: 'all', summary: 'לברך את ה׳ אחרי אכילה ושביעה.', practice: 'לברך מתוך הסידור, בישיבה ובכוונה.' },

  { id: 'kibud-av-vaem', title: 'כיבוד אב ואם', type: 'aseh', source: 'שמות כ, יב', applies: 'all', summary: 'לכבד את ההורים – להאכיל, להשקות ולסייע.', practice: 'להתקשר להורים ולשאול במה אפשר לעזור.' },
  { id: 'mora-av-vaem', title: 'מורא אב ואם', type: 'aseh', source: 'ויקרא יט, ג', applies: 'all', summary: 'לירא מההורים – לא לשבת במקומם ולא לסתור את דבריהם.', practice: 'לא לקרוא להורים בשמם ולא לשבת במקומם הקבוע.' },
  { id: 'ahavat-israel', title: 'ואהבת לרעך כמוך', type: 'aseh', source: 'ויקרא יט, יח', applies: 'all', summary: 'לאהוב כל יהודי כגופו.', practice: 'לפרגן, לשמוח בשמחת חבר ולדון לכף זכות.' },
  { id: 'ahavat-ger', title: 'אהבת הגר', type: 'aseh', source: 'דברים י, יט', applies: 'all', summary: 'לאהוב את הגר שהצטרף לעם ישראל.', practice: 'לקרב ולכבד גרים ובעלי תשובה.' },
  { id: 'tzedakah', title: 'צדקה', type: 'aseh', source: 'דברים טו, ח', applies: 'all', summary: 'לתת צדקה לעני לפי הצורך.', practice: 'להפריש מעשר מההכנסה, ולתת בסתר.' },
  { id: 'halvaah', title: 'הלוואה לעני', type: 'aseh', source: 'שמות כב, כד', applies: 'all', summary: 'להלוות לעני ישראל.', practice: 'גמ״ח – להשאיל חפצים ולהלוות כסף.' },
  { id: 'hashavat-aveda', title: 'השבת אבידה', type: 'aseh', source: 'דברים כב, א', applies: 'all', summary: 'להחזיר אבידה לבעליה.', practice: 'לפרסם מציאה ולשמור עליה עד שיימצא הבעלים.' },
  { id: 'vehalachta', title: 'והלכת בדרכיו', type: 'aseh', source: 'דברים כח, ט', applies: 'all', summary: 'להידמות לה׳ במידות – רחום, חנון, ארך אפיים.', practice: 'לבחור היום מידה טובה אחת ולעבוד עליה.' },
  { id: 'dvekut-chachamim', title: 'הדבקות בחכמים', type: 'aseh', source: 'דברים י, כ', applies: 'all', summary: 'להתחבר לתלמידי חכמים וללמוד ממעשיהם.', practice: 'לשמוע שיעור קבוע מרב.' },
  { id: 'kibud-zaken', title: 'כבוד תלמידי חכמים וזקנים', type: 'aseh', source: 'ויקרא יט, לב', applies: 'all', summary: '"מפני שיבה תקום".', practice: 'לעמוד מפני רב וזקן, ולפנות להם מקום.' },
  { id: 'tochacha', title: 'תוכחה', type: 'aseh', source: 'ויקרא יט, יז', applies: 'all', summary: 'להעיר לחבר בנחת כשהוא טועה.', practice: 'להעיר בפרטיות, באהבה ובלי לבייש.' },
  { id: 'teshuva', title: 'תשובה ווידוי', type: 'aseh', source: 'במדבר ה, ז', applies: 'all', summary: 'לשוב מחטא ולהתוודות עליו.', practice: 'חשבון נפש קצר לפני השינה.' },
  { id: 'kiddush-hashem', title: 'קידוש ה׳', type: 'aseh', source: 'ויקרא כב, לב', applies: 'all', summary: 'לקדש שם שמים בהתנהגות.', practice: 'יושר במשא ומתן ומאור פנים לכל אדם.' },

  { id: 'lo-tisna', title: 'לא תשנא את אחיך בלבבך', type: 'lav', source: 'ויקרא יט, יז', applies: 'all', summary: 'איסור לשנוא יהודי בלב.', practice: 'לדבר ולברר במקום לשמור טינה.' },
  { id: 'lo-tikom', title: 'לא תקום', type: 'lav', source: 'ויקרא יט, יח', applies: 'all', summary: 'איסור לנקום.', practice: 'לעזור גם למי שלא עזר לנו.' },
  { id: 'lo-titor', title: 'לא תטור', type: 'lav', source: 'ויקרא יט, יח', applies: 'all', summary: 'איסור לזכור עוול ולהזכיר אותו.', practice: 'לעזור בלב שלם, בלי "אני לא כמוך".' },
  { id: 'lo-telech-rachil', title: 'לא תלך רכיל', type: 'lav', source: 'ויקרא יט, טז', applies: 'all', summary: 'איסור רכילות ולשון הרע.', practice: 'לעצור לפני שמספרים על אחר – האם זה לתועלת?' },
  { id: 'onaat-devarim', title: 'אונאת דברים', type: 'lav', source: 'ויקרא כה, יז', applies: 'all', summary: 'איסור לצער אדם בדיבור.', practice: 'לא להזכיר לאדם עבר שהוא מתבייש בו.' },
  { id: 'onaat-mamon', title: 'אונאת ממון', type: 'lav', source: 'ויקרא כה, יד', applies: 'all', summary: 'איסור להונות במקח וממכר.', practice: 'מחיר הוגן ותיאור אמת של המוצר.' },
  { id: 'lo-tignov', title: 'לא תגנבו', type: 'lav', source: 'ויקרא יט, יא', applies: 'all', summary: 'איסור גניבה, ואפילו על מנת להחזיר.', practice: 'להקפיד על זכויות יוצרים וחפצים שאולים.' },
  { id: 'lifnei-iver', title: 'לפני עיוור', type: 'lav', source: 'ויקרא יט, יד', applies: 'all', summary: 'איסור להכשיל אחר בעצה רעה או בחטא.', practice: 'לתת עצה כנה גם כשאין לנו בה רווח.' },
  { id: 'lo-tekalel-cheresh', title: 'לא תקלל חרש', type: 'lav', source: 'ויקרא יט, יד', applies: 'all', summary: 'איסור לקלל יהודי, אפילו שאינו שומע.', practice: 'לשמור על לשון נקייה גם בכעס.' },

  { id: 'zachor-shabbat', title: 'זכור את יום השבת', type: 'aseh', source: 'שמות כ, ח', applies: 'all', summary: 'לקדש את השבת בדברים – קידוש והבדלה.', practice: 'לקדש על היין בליל שבת.' },
  { id: 'shvitat-shabbat', title: 'שביתה בשבת', type: 'aseh', source: 'שמות כג, יב', applies: 'all', summary: 'לנוח ביום השבת.', practice: 'להכין הכל מערב שבת.' },
  { id: 'lo-melacha-shabbat', title: 'לא תעשה מלאכה בשבת', type: 'lav', source: 'שמות כ, י', applies: 'all', summary: 'איסור ל״ט מלאכות בשבת.', practice: 'ללמוד בכל שבוע הלכה אחת מהלכות שבת.' },
  { id: 'zechirat-yetziat-mitzrayim', title: 'זכירת יציאת מצרים', type: 'aseh', source: 'דברים טז, ג', applies: 'all', summary: 'לזכור יציאת מצרים בכל יום ובכל לילה.', practice: 'לכוון בפרשת ציצית בקריאת שמע.' },
  { id: 'sippur-yetziat-mitzrayim', title: 'סיפור יציאת מצרים', type: 'aseh', source: 'שמות יג, ח', applies: 'all', summary: 'לספר בליל ט״ו בניסן ביציאת מצרים.', practice: 'להכין שאלות ותשובות לליל הסדר.' },
  { id: 'matzah', title: 'אכילת מצה', type: 'aseh', source: 'שמות יב, יח', applies: 'all', summary: 'לאכול מצה בליל ט״ו בניסן.', practice: 'לאכול כזית מצה בתוך זמן קצר.' },
  { id: 'hashbatat-chametz', title: 'השבתת חמץ', type: 'aseh', source: 'שמות יב, טו', applies: 'all', summary: 'לבער חמץ לפני פסח.', practice: 'בדיקת חמץ בליל י״ד ומכירת חמץ.' },
  { id: 'sefirat-haomer', title: 'ספירת העומר', type: 'aseh', source: 'ויקרא כג, טו', applies: 'men', summary: 'לספור ארבעים ותשעה יום מפסח לשבועות.', practice: 'לספור בכל לילה אחרי צאת הכוכבים, בברכה.' },
  { id: 'shofar', title: 'שמיעת קול שופר', type: 'aseh', source: 'במדבר כט, א', applies: 'men', summary: 'לשמוע קול שופר בראש השנה.', practice: 'לשמוע את כל מאה הקולות בבית הכנסת.' },
  { id: 'sukkah', title: 'ישיבה בסוכה', type: 'aseh', source: 'ויקרא כג, מב', applies: 'men', summary: 'לשבת בסוכה שבעת ימי החג.', practice: 'לאכול סעודות בסוכה ולברך "לישב בסוכה".' },
  { id: 'lulav', title: 'נטילת לולב', type: 'aseh', source: 'ויקרא כג, מ', applies: 'men', summary: 'ליטול ארבעה מינים בסוכות.', practice: 'לבחור ארבעה מינים מהודרים.' },
  { id: 'inui-yom-kippur', title: 'עינוי ביום הכיפורים', type: 'aseh', source: 'ויקרא כג, כז', applies: 'all', summary: 'לצום ולהתענות ביום הכיפורים.', practice: 'להכין את הגוף ואת הנפש מראש.' },
  { id: 'simchat-yom-tov', title: 'שמחה ברגלים', type: 'aseh', source: 'דברים טז, יד', applies: 'all', summary: 'לשמוח בחג ולשמח את בני הבית.', practice: 'בגדים חדשים לאישה וממתקים לילדים.' },

  { id: 'chalah', title: 'הפרשת חלה', type: 'aseh', source: 'במדבר טו, כ', applies: 'all', summary: 'להפריש חלק מהעיסה.', practice: 'כשאופים בשיעור – להפריש בברכה.' },
  { id: 'basar-bechalav', title: 'בשר בחלב', type: 'lav', source: 'שמות כג, יט', applies: 'all', summary: 'איסור לבשל בשר בחלב.', practice: 'כלים נפרדים והמתנה בין בשר לחלב.' },
  { id: 'shiluach-haken', title: 'שילוח הקן', type: 'aseh', source: 'דברים כב, ז', applies: 'all', summary: 'לשלח את האם לפני לקיחת הביצים.', practice: 'ללמוד את דיני המצווה כשנזדמנת.' },
  { id: 'maake', title: 'מעקה', type: 'aseh', source: 'דברים כב, ח', applies: 'all', summary: 'לבנות מעקה ולהסיר מכשולים.', practice: 'לבדוק מעקות במרפסת ובגג, ולסלק מכשולים.' },
  { id: 'pru-urvu', title: 'פרו ורבו', type: 'aseh', source: 'בראשית א, כח', applies: 'men', summary: 'להקים משפחה ולהביא ילדים לעולם.', practice: 'לסייע לזוגות צעירים ולמשפחות.' },
  { id: 'milah', title: 'ברית מילה', type: 'aseh', source: 'ויקרא יב, ג', applies: 'men', summary: 'למול את הבן ביום השמיני.', practice: 'להשתתף בברית ולשמוח בשמחת המצווה.' },
];

/** The mitzvah for a given day – cycles through the list. */
export function mitzvahOfDay(dateKey: string): MitzvahEntry {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return mitzvot[dayNumber % mitzvot.length]!;
}
