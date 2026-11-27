/**
 * The nusach Ashkenaz prayer map (round 14; shared since 14.1 by the pack builder and the coverage
 * check): our prayer ids → Sefaria "Siddur Ashkenaz" node paths, each expanded to every text leaf of
 * the live index schema (a renamed node fails loudly instead of silently missing text).
 */
export const BOOK = 'Siddur Ashkenaz';

export async function ashkenazMap(getJson) {
  const index = await getJson(`https://www.sefaria.org/api/v2/raw/index/${encodeURIComponent(BOOK.replace(/ /g, '_'))}`);
  const nameOf = (n) => (n.titles ?? []).find((t) => t.primary && t.lang === 'en')?.text ?? n.key;
  function nodeAt(path) {
    let n = index.schema;
    for (const part of path) {
      n = (n.nodes ?? []).find((c) => nameOf(c) === part);
      if (!n) throw new Error(`no node "${part}" in ${path.join(' > ')} (the Sefaria schema changed: update the map)`);
    }
    return n;
  }
  /** Every text leaf under a node, in order, as Sefaria refs. */
  const heTitles = new Map();
  function leaves(path) {
    const n = nodeAt(path);
    const out = [];
    const walk = (node, p) => {
      if (!node.nodes?.length) {
        const ref = [BOOK, ...p].join(', ');
        heTitles.set(ref, (node.titles ?? []).find((t) => t.primary && t.lang === 'he')?.text ?? p.at(-1));
        out.push(ref);
      }
      else for (const c of node.nodes) walk(c, [...p, nameOf(c)]);
    };
    walk(n, path);
    return out;
  }

  const UPON_ARISING = ['Modeh Ani', 'Netilat Yadayim', 'Asher Yatzar', 'Elokai Neshama', 'Tzitzit', 'Tallit', 'Tefillin'];
  const prep = (names) => names.flatMap((n) => leaves(['Weekday', 'Shacharit', 'Preparatory Prayers', n]));
  const prepRest = nodeAt(['Weekday', 'Shacharit', 'Preparatory Prayers']).nodes.map(nameOf).filter((n) => !UPON_ARISING.includes(n));
  const without = (path, exclude) => nodeAt(path).nodes.map(nameOf).filter((n) => !exclude.includes(n)).flatMap((n) => leaves([...path, n]));

  /** [id, group, Hebrew title, refs]. Ids follow the Sefard pack where the prayer is the same. */
  const SIDDUR = [
    ['upon-arising', 'weekday', 'השכמת הבוקר', prep(UPON_ARISING)],
    ['shacharit', 'weekday', 'שחרית לימות החול', [...prep(prepRest), ...['Pesukei Dezimra', 'Blessings of the Shema', 'Amidah', 'Post Amidah', 'Torah Reading', 'Concluding Prayers'].flatMap((n) => leaves(['Weekday', 'Shacharit', n]))]],
    ['mincha', 'weekday', 'מנחה לימות החול', leaves(['Weekday', 'Minchah'])],
    ['maariv', 'weekday', 'ערבית לימות החול', without(['Weekday', 'Maariv'], ["Keri'at Shema al Hamita"])],
    ['bedtime-shema', 'weekday', 'קריאת שמע שעל המיטה', leaves(['Weekday', 'Maariv', "Keri'at Shema al Hamita"])],
    ['birkat-hamazon', 'weekday', 'ברכת המזון', leaves(['Berachot', 'Birkat HaMazon'])],
    ['blessings-after', 'weekday', 'ברכות אחרונות (מעין שלוש, בורא נפשות)', leaves(['Berachot', 'Birkat Hanehenin', 'Eating', 'Brachot Achronot'])],
    ['tefillat-haderech', 'weekday', 'תפילת הדרך', leaves(['Berachot', 'Tefillat HaDerech'])],
    ['kabbalat-shabbat', 'shabbat', 'קבלת שבת', leaves(['Shabbat', 'Kabbalat Shabbat'])],
    ['shabbat-maariv', 'shabbat', 'ערבית של שבת', leaves(['Shabbat', 'Maariv'])],
    ['shabbat-night-meal', 'shabbat', 'ליל שבת: ברכת הבנים, שלום עליכם, קידוש וזמירות', leaves(['Shabbat', 'Shabbat Evening'])],
    ['shabbat-shacharit', 'shabbat', 'שחרית של שבת', ['Preparatory Prayers', 'Pesukei Dezimra', 'Blessings of the Shema', 'Amidah'].flatMap((n) => leaves(['Shabbat', 'Shacharit', n]))],
    ['shabbat-torah-reading', 'shabbat', 'קריאת התורה בשבת', ['Torah Reading', 'Communal Prayers', 'Ashrei', 'Returning Sefer to Aron', 'Half Kaddish'].flatMap((n) => leaves(['Shabbat', 'Shacharit', n]))],
    ['shabbat-musaf', 'shabbat', 'מוסף של שבת', leaves(['Shabbat', 'Musaf LeShabbat'])],
    ['shabbat-day-meal', 'shabbat', 'קידוש וסעודת יום שבת', leaves(['Shabbat', 'Daytime Meal'])],
    ['shabbat-mincha', 'shabbat', 'מנחה לשבת', leaves(['Shabbat', 'Minchah'])],
    ['seuda-shlishit', 'shabbat', 'סעודה שלישית', leaves(['Shabbat', 'Third Meal'])],
    ['havdalah', 'shabbat', 'הבדלה', leaves(['Shabbat', 'Havdalah'])],
    ['rosh-chodesh', 'holiday', 'ראש חודש – הלל ומוסף', leaves(['Festivals', 'Rosh Chodesh'])],
    ['yom-tov', 'holiday', 'שלוש רגלים – עמידה ומוסף', leaves(['Festivals', 'Shalosh Regalim'])],
    ['tal-geshem', 'holiday', 'תפילת טל ותפילת גשם', [...leaves(['Festivals', 'Prayer for Dew']), ...leaves(['Festivals', 'Prayer for Rain'])]],
    ['sukkah-lulav', 'holiday', 'סוכה ונטילת לולב', [...leaves(['Festivals', 'Sukkot', 'Prayers in the Sukkah']), ...leaves(['Festivals', 'Sukkot', 'Blessing on Lulav'])]],
    ['hoshanot', 'holiday', 'הושענות', leaves(['Festivals', 'Sukkot', "Hosha'anot"])],
    ['chanukah', 'holiday', 'הדלקת נרות חנוכה', leaves(['Festivals', 'Chanukah'])],
  ];

  // The Hebrew name of each leaf (for a section that is missing in every allowed edition).
  SIDDUR.heTitleOf = (ref) => heTitles.get(ref) ?? ref;
  return SIDDUR;
}
