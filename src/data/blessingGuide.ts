import { BlessingCategory } from '../types';

/**
 * Blessing texts. The Divine Name is written as ה׳ / אלקינו, as is customary in printed material
 * that may not be treated with the sanctity of a siddur. Wording follows the common text;
 * small differences between nuschaot exist.
 */
const PREFIX = 'ברוך אתה ה׳ אלקינו מלך העולם';
const MITZVAH_PREFIX = `${PREFIX}, אשר קדשנו במצוותיו וצונו`;

export type BlessingText = {
  id: string;
  title: string;
  text: string;
  category: BlessingCategory;
  group: 'first' | 'after' | 'smell' | 'sight' | 'mitzvah' | 'thanks';
  note?: string;
  /** Long blessing – the UI links to the full siddur instead of showing the text. */
  inSiddur?: boolean;
};

export const blessingGroups: Record<BlessingText['group'], string> = {
  first: 'ברכות ראשונות על מאכלים',
  after: 'ברכות אחרונות',
  smell: 'ברכות הריח',
  sight: 'ברכות הראייה והשמיעה',
  mitzvah: 'ברכות המצוות',
  thanks: 'ברכות השבח וההודאה',
};

export const blessingTexts: BlessingText[] = [
  { id: 'hamotzi', title: 'המוציא', text: `${PREFIX}, המוציא לחם מן הארץ.`, category: 'enjoyment', group: 'first', note: 'על פת – לפני הברכה נוטלים ידיים' },
  { id: 'mezonot', title: 'בורא מיני מזונות', text: `${PREFIX}, בורא מיני מזונות.`, category: 'enjoyment', group: 'first' },
  { id: 'hagefen', title: 'בורא פרי הגפן', text: `${PREFIX}, בורא פרי הגפן.`, category: 'enjoyment', group: 'first' },
  { id: 'haetz', title: 'בורא פרי העץ', text: `${PREFIX}, בורא פרי העץ.`, category: 'enjoyment', group: 'first' },
  { id: 'haadama', title: 'בורא פרי האדמה', text: `${PREFIX}, בורא פרי האדמה.`, category: 'enjoyment', group: 'first' },
  { id: 'shehakol', title: 'שהכל נהיה בדברו', text: `${PREFIX}, שהכל נהיה בדברו.`, category: 'enjoyment', group: 'first' },

  {
    id: 'nefashot',
    title: 'בורא נפשות',
    text: `${PREFIX}, בורא נפשות רבות וחסרונן, על כל מה שבראת להחיות בהם נפש כל חי. ברוך חי העולמים.`,
    category: 'enjoyment',
    group: 'after',
    note: 'אחרי אכילת כזית או שתיית רביעית',
  },
  { id: 'meeinShalosh', title: 'ברכה מעין שלוש (על המחיה / על הגפן / על העץ)', text: 'נוסח מלא בסידור', category: 'enjoyment', group: 'after', inSiddur: true },
  { id: 'birkatHamazon', title: 'ברכת המזון', text: 'נוסח מלא בסידור', category: 'enjoyment', group: 'after', note: 'אחרי סעודה עם פת', inSiddur: true },

  { id: 'atzeiBesamim', title: 'עצי בשמים', text: `${PREFIX}, בורא עצי בשמים.`, category: 'other', group: 'smell' },
  { id: 'isbeiBesamim', title: 'עשבי בשמים', text: `${PREFIX}, בורא עשבי בשמים.`, category: 'other', group: 'smell' },
  { id: 'mineiBesamim', title: 'מיני בשמים', text: `${PREFIX}, בורא מיני בשמים.`, category: 'other', group: 'smell' },
  { id: 'reiachPeirot', title: 'פרי בעל ריח', text: `${PREFIX}, הנותן ריח טוב בפירות.`, category: 'other', group: 'smell' },

  { id: 'barak', title: 'ברק', text: `${PREFIX}, עושה מעשה בראשית.`, category: 'other', group: 'sight' },
  { id: 'raam', title: 'רעם', text: `${PREFIX}, שכחו וגבורתו מלא עולם.`, category: 'other', group: 'sight' },
  { id: 'keshet', title: 'קשת בענן', text: `${PREFIX}, זוכר הברית ונאמן בבריתו וקיים במאמרו.`, category: 'other', group: 'sight' },
  { id: 'ilanot', title: 'ברכת האילנות (בחודש ניסן)', text: `${PREFIX}, שלא חיסר בעולמו כלום, וברא בו בריות טובות ואילנות טובים ליהנות בהם בני אדם.`, category: 'other', group: 'sight', note: 'פעם בשנה, על אילני מאכל מלבלבים' },

  { id: 'netilatYadayim', title: 'נטילת ידיים', text: `${MITZVAH_PREFIX} על נטילת ידיים.`, category: 'mitzvah', group: 'mitzvah' },
  { id: 'tzitzit', title: 'עטיפת טלית', text: `${MITZVAH_PREFIX} להתעטף בציצית.`, category: 'mitzvah', group: 'mitzvah' },
  { id: 'tefillin', title: 'הנחת תפילין', text: `${MITZVAH_PREFIX} להניח תפילין.`, category: 'mitzvah', group: 'mitzvah' },
  { id: 'mezuzah', title: 'קביעת מזוזה', text: `${MITZVAH_PREFIX} לקבוע מזוזה.`, category: 'mitzvah', group: 'mitzvah' },
  { id: 'nerShabbat', title: 'הדלקת נר שבת', text: `${MITZVAH_PREFIX} להדליק נר של שבת.`, category: 'mitzvah', group: 'mitzvah' },
  { id: 'nerChanukah', title: 'הדלקת נר חנוכה', text: `${MITZVAH_PREFIX} להדליק נר חנוכה.`, category: 'mitzvah', group: 'mitzvah', note: 'יש הנוהגים לומר "נר של חנוכה"' },

  { id: 'asherYatzar', title: 'אשר יצר', text: `${PREFIX}, אשר יצר את האדם בחכמה, וברא בו נקבים נקבים, חלולים חלולים. גלוי וידוע לפני כסא כבודך, שאם יפתח אחד מהם או יסתם אחד מהם, אי אפשר להתקיים ולעמוד לפניך. ברוך אתה ה׳, רופא כל בשר ומפליא לעשות.`, category: 'other', group: 'thanks' },
  { id: 'shehecheyanu', title: 'שהחיינו', text: `${PREFIX}, שהחיינו וקיימנו והגיענו לזמן הזה.`, category: 'other', group: 'thanks', note: 'על פרי חדש, בגד חדש חשוב, ובזמנים' },
  { id: 'hatovVehametiv', title: 'הטוב והמטיב', text: `${PREFIX}, הטוב והמטיב.`, category: 'other', group: 'thanks', note: 'על בשורה טובה לו ולאחרים' },
];

/* ------------------------------ What to bless ----------------------------- */

type First = 'hamotzi' | 'mezonot' | 'hagefen' | 'haetz' | 'haadama' | 'shehakol';
type After = 'birkatHamazon' | 'alHamichya' | 'alHagefen' | 'alHaetz' | 'nefashot';

export const firstLabel: Record<First, string> = {
  hamotzi: 'המוציא',
  mezonot: 'בורא מיני מזונות',
  hagefen: 'בורא פרי הגפן',
  haetz: 'בורא פרי העץ',
  haadama: 'בורא פרי האדמה',
  shehakol: 'שהכל נהיה בדברו',
};

export const afterLabel: Record<After, string> = {
  birkatHamazon: 'ברכת המזון',
  alHamichya: 'על המחיה',
  alHagefen: 'על הגפן',
  alHaetz: 'על העץ',
  nefashot: 'בורא נפשות',
};

export type FoodItem = { name: string; first: First; after: After; note?: string };

const group = (names: string[], first: First, after: After, note?: string): FoodItem[] =>
  names.map((name) => ({ name, first, after, ...(note ? { note } : {}) }));

export const foods: FoodItem[] = [
  ...group(['לחם', 'פיתה', 'חלה', 'לחמנייה', 'בגט'], 'hamotzi', 'birkatHamazon'),
  ...group(['עוגה', 'עוגיות', 'בורקס', 'קרקרים', 'פסטה', 'ביסלי', 'רוגלך'], 'mezonot', 'alHamichya', 'אם אוכלים כמות של קביעת סעודה – המוציא וברכת המזון'),
  ...group(['דייסת שיבולת שועל'], 'mezonot', 'alHamichya'),
  ...group(['אורז'], 'mezonot', 'nefashot'),
  ...group(['יין', 'מיץ ענבים'], 'hagefen', 'alHagefen'),
  ...group(['ענבים', 'תמרים', 'תאנים', 'רימון', 'זיתים'], 'haetz', 'alHaetz', 'משבעת המינים'),
  ...group(['תפוח', 'אגס', 'אפרסק', 'שזיף', 'תפוז', 'קלמנטינה', 'אבוקדו', 'מנגו', 'דובדבנים', 'אגוזים', 'שקדים', 'קיווי'], 'haetz', 'nefashot'),
  ...group(['בננה', 'תות שדה', 'אבטיח', 'מלון', 'אננס', 'פפאיה'], 'haadama', 'nefashot'),
  ...group(['עגבנייה', 'מלפפון', 'גזר', 'תפוח אדמה', 'תירס', 'פלפל', 'בוטנים', 'פופקורן'], 'haadama', 'nefashot'),
  ...group(['קורנפלקס'], 'haadama', 'nefashot', 'לפי רוב הפוסקים'),
  ...group(['שוקולד', 'סוכריות', 'גלידה', 'בשר', 'עוף', 'דג', 'ביצה', 'גבינה', 'יוגורט', 'פטריות'], 'shehakol', 'nefashot'),
  ...group(['מים', 'חלב', 'קפה', 'תה', 'מיץ תפוזים', 'שתייה קלה'], 'shehakol', 'nefashot', 'על מים – רק כששותים לצמאו'),
];

export const BLESSING_DISCLAIMER =
  'הטבלה היא מדריך כללי. ברכה אחרונה – אחרי כזית מאכל או רביעית משקה. לשאלות פרטיות ולמנהגי עדות – יש להתייעץ עם רב.';
