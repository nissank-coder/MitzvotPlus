# מודל וקטלוג: הרגלים, אתגרים והישגים (הצעה לאישור – C1)

> הצעה בלבד: לא מומשה בקוד ולא אושרה. הערכים, השמות והספים מחכים להחלטתך. כללים הלכתיים (גבול היום D06, ספירת ברכות בתפילה) מחכים לסוקר.
> המנוע יחושב מתוך היומן הקיים, עם המדדים של PR A ו-PR A+ (`src/lib/metrics.ts`, `rulesets.ts`): לא מונה נפרד שמתקדם במקביל ליומן.

## 1. עקרונות

1. **התקדמות נגזרת מהיומן.** אין מונה שמתקדם בנפרד. מחיקה, תיקון או רישום בדיעבד מעדכנים את ההתקדמות בעקביות.
2. **כל הגדרה קפואה לפי גרסה.** הגדרת אתגר או הישג נשמרת לפי `id@version`. כשמשתמש מצטרף, היעד, התקופה ומדיניות המנוחה נשמרים כ-snapshot.
3. **אין כפל נקודות.** הרגלים, אתגרים והישגים **לא מוסיפים נקודות**. הנקודות נשארות לפי score-2 עד החלטה.
4. **"הושלם" רק אחרי שמירה במכשיר** (durable save), כמו הודעת ה-100 ברכות היום.
5. **שבת וחג:** לפי D05 – בלי לחץ ובלי עונש. יום מנוחה בלי רישום לא נספר כחסר ולא מאריך את חלון האתגר.
6. **פרטיות:** שמירת הלשון, צדקה, תרגולי מודעות והתבוננות אישית הם פרטיים ומקומיים בלבד, ואף פעם לא בפיד.
7. **לא מתגמלים:** כמות לחיצות לשמה, צומות, "יום בלי עבירה", הסתרה, שימוש בשבת או גובה תרומה.

## 2. מבנה נתונים (TypeScript, מוצע)

```ts
type MetricId =
  | 'distinctDays'      // ימים שבהם יש רישום מסוג המסנן
  | 'goalDays'          // ימים שבהם היעד האישי הושלם (לפי snapshot של אותו יום)
  | 'recordedBlessings' // ברכות שנרשמו (כולל חבילה מאושרת)
  | 'blessingDayGoal'   // ימים עם >= N ברכות
  | 'learningDays'      // ימים עם רישום לימוד כלשהו
  | 'confirmedActs'     // רישומים מאושרים מסוג המסנן (לא לחיצות כפולות: לפי identity)
  | 'chapterCoverage'   // פרקי תהילים ייחודיים שכוסו במלואם
  | 'categoriesDays'    // קטגוריות שונות בימים שונים
  | 'completedContent'; // פריטי תוכן מאושרים שהושלמו (id@version)

type HabitDefinition = {
  id: string; version: number; title: string;
  metric: MetricId; filter: { actionKeys?: string[]; categories?: string[] };
  threshold: number;               // למשל 1 = פעם ביום
  schedule: 'daily' | 'weekly';
  privacy: 'local' | 'shareable';
  contentRef?: string;
};
type HabitEnrollment = {
  id: string; definitionId: string; definitionVersion: number;
  startDate: string; endDate?: string;     // YYYY-MM-DD, end exclusive
  target: number; policyVersion: string;   // CALENDAR_POLICY + scoring rules
};
type ChallengeDefinition = {
  id: string; version: number; title: string; description: string;
  metric: MetricId; filter: HabitDefinition['filter']; target: number;
  window: { days: number } | { calendar: 'week' | 'month' };
  scope: 'personal' | 'group';             // group: רק אחרי שרת והסכמה
  privacy: 'local' | 'shareable';
  restPolicy: 'bridge' | 'none';            // bridge = שבת/חג לא נספרים
  backfill: 'none' | 'sameWindow';          // האם רישום בדיעבד בתוך החלון נספר
  reviewer?: { name: string; date: string }; // כשיש רכיב הלכתי
};
type ChallengeEnrollment = {
  instanceId: string; definitionId: string; definitionVersion: number;
  joinedAt: number; start: string; end: string; target: number;
  state: 'active' | 'completed' | 'expired' | 'left';
  completedAt?: number;                    // רק אחרי durable save
};
type AchievementDefinition = {
  id: string; version: number; title: string; explanation: string;
  metric: MetricId; filter?: HabitDefinition['filter']; threshold: number;
  tier?: 1 | 2 | 3; privacy: 'local' | 'shareable';
};
type Award = {
  achievementId: string; version: number; earnedAt: number;
  rulesVersion: string; state: 'earned' | 'revoked';
};
```

**כללי חישוב:**
- התקדמות = `metric(logs ∩ [start, end) ∩ filter)`, לפי identity מ-PR A+: אותה תפילה פעם ביום, ופריט תוכן לפי `id@version`.
- כל פעולה נספרת פעם אחת לכל מדד. היא יכולה לקדם כמה אתגרים, אבל לא מוסיפה נקודות.
- הישג: מוענק פעם אחת לכל `id@version`. אם רישום בוטל והסף כבר לא מתקיים: האפשרות המוצעת היא לסמן "revoked" בשקט, בלי הודעה. אפשרות נוספת: לא לבטל הישג שכבר הוענק. **זו החלטה שלך.**

## 3. קטלוג אתגרים (12, לאישור)

| ID | שם | מדד | יעד | חלון | שבת/חג | פרטיות | מה מוצג "היום" |
|---|---|---|---|---|---|---|---|
| C01 | מתחילים בקצב שלי | goalDays (הרגל שנבחר) | 3 | 7 ימים מההצטרפות | bridge | local | "עוד 2 ימים" |
| C02 | שבוע של התמדה | goalDays | 4 | שבוע קלנדרי | bridge | local | ימים שהושלמו מתוך הזכאים |
| C03 | עוד צעד קטן | goalDays מול השבוע הקודם | +1 | שבוע | bridge | local | **רק אם יש שבוע קודם מלא**, אחרת לא מוצע |
| C04 | זמן לתורה | learningDays | 3 | 7 ימים | bridge | local | "היום: כל לימוד נחשב" |
| C05 | לימוד לאורך הדרך | learningDays | 10 | 30 ימים | bridge | local | התקדמות 0–10 |
| C06 | מאה ברכות | blessingDayGoal (100) | 1 | יום | — | local | מונה ברכות של היום |
| C07 | עקביות בברכות | blessingDayGoal (יעד אישי, נפרד מ-100) | 3 | 7 ימים | bridge | local | ימים שהושלמו |
| C08 | שבוע של חסד | distinctDays (chesed, charity, parents, guests, visitSick) | 3 | 7 ימים | bridge | local (ללא סכומים) | ימים עם חסד |
| C09 | מעגל של עשייה | categoriesDays (3 קטגוריות, 3 ימים שונים) | 3 | 7 ימים | bridge | local | קטגוריות שכבר נספרו |
| C10 | פרקי תהילים | chapterCoverage | 10 | 30 ימים | bridge | local | פרקים חדשים בתוך החלון |
| C11 | מילה טובה | distinctDays של תרגול מודעות שהמשתמש בחר | 3 | 7 ימים | bridge | **פרטי בלבד** | "תרגול להיום" (לא מדד עבירות) |
| C12 | יחד מתקדמים | יחידת השתתפות אחת לכל משתתף ביום | לפי קבוצה | שבוע | bridge | group, opt-in | **לא בייצור לפני שרת, הסכמה ו-G1** |

רישום בדיעבד (`backfill`), ההצעה: רישום בדיעבד בתוך החלון נספר, אם המעשה היה בתוך החלון ואחרי ההצטרפות. מעשים שלפני ההצטרפות לא נספרים.

## 4. הישגים (16, לאישור)

| # | שם מוצע | תנאי | מדד | פרטיות |
|---|---|---|---|---|
| 1 | הצעד הראשון | הרגל ראשון שנשמר | goalDays ≥ 1 (או רישום ראשון) | shareable |
| 2 | התחלה טובה | 3 ימי יעד | goalDays ≥ 3 | shareable |
| 3 | שבעה צעדים | 7 ימי יעד מצטברים | goalDays ≥ 7 | shareable |
| 4 | דרך של חודש | 30 ימי יעד מצטברים | goalDays ≥ 30 | shareable |
| 5 | חוזרים למסלול | יום יעד אחרי הפסקה של 3 ימים זכאים לפחות | goalDays | local |
| 6 | שיא אישי | שבוע עם יותר ימי יעד מכל שבוע קודם (אחרי 2 שבועות לפחות) | goalDays | local |
| 7 | מאה ברכות | יום אחד עם 100 ברכות שנרשמו | blessingDayGoal | shareable |
| 8 | אלף ברכות | 1,000 ברכות מצטברות | recordedBlessings | shareable |
| 9 | עקביות בברכות | 10 ימים של יעד ברכות אישי | blessingDayGoal | local |
| 10 | זמן לתורה | 7 ימי לימוד | learningDays | shareable |
| 11 | מסע לימוד | 30 ימי לימוד | learningDays | shareable |
| 12 | מעשי חסד | 10 ימים עם חסד | distinctDays(chesed…) | local |
| 13 | פרקי תהילים | 25 פרקים שונים | chapterCoverage | shareable |
| 14 | מסלול הושלם | אתגר אישי אחד שהושלם | enrollments | shareable |
| 15 | שלושה מסלולים | 3 אתגרים **שונים** שהושלמו | enrollments | shareable |
| 16 | יחד בדרך | אתגר קבוצתי ראשון | — | **עתידי, לא בייצור** |

## 5. שמות דרגות (A08) – הצעה

הדרגות של היום ("עובד ה׳", "נר תמיד" וכן הלאה) מערבבות התמדה עם מעמד רוחני, וההישג "בן תורה" מוצג היום. **ההצעה:** "שלבי מסע" לפי ימי יעד מצטברים, ולא לפי נקודות:

| שלב | ימי יעד | שם מוצע |
|---|---|---|
| 1 | 0 | יוצאים לדרך |
| 2 | 7 | שבוע ראשון |
| 3 | 21 | צועדים |
| 4 | 50 | בקצב |
| 5 | 100 | מתמידים |
| 6 | 200 | דרך ארוכה |
| 7 | 365 | שנה של התמדה |

הנקודות הקיימות נשמרות, ומוצגות כמידע משני. ההחלפה תיעשה רק אחרי אישורך, ובלי למחוק את הדרגה הקיימת מההיסטוריה.

## 6. הגירה למשתמשים קיימים (B1/C1)

- לא מוחקים את היעד היומי (6/12/18) ולא משנים אותו בשקט. במסך היום יוצע: "לעבור ליעד של 2–3 הרגלים?".
- אחרי מעבר נוצר `HabitEnrollment` חדש עם `startDate = היום`. העבר נשאר מוצג לפי `goalHistory` הקיים.
- **אין הישגים רטרואקטיביים מפתיעים.** האפשרות המוצעת: הישגים מבוססי היסטוריה (למשל 1,000 ברכות) מחושבים בשקט ומוצגים כ"הושגו בעבר", בלי חגיגה. אתגרים מתחילים רק מההצטרפות.
- בדיקה: פתיחת DB ישן, מעבר ל-DB חדש ופתיחה מחדש (בדיקת B02).

## 7. ראיות להשלמה (Definition of Done ל-C1)

- התקדמות זהה אחרי restart, אחרי מצב offline ואחרי מחיקה והוספה מחדש של אותה רשומה.
- שני אתגרים חופפים: כל אחד מתקדם, ואין נקודות נוספות.
- הצטרפות, עזיבה, פקיעת זמן והצטרפות מחדש: אין היסטוריה פיקטיבית, והגרסה נשמרת.
- "הושלם" לא מוצג לפני שמירה. כשל שמירה, לחיצה כפולה וביטול נבדקים.
- בדיקות C01–C06 בקובץ 03.

## 8. החלטות נדרשות

1. האם לאשר את 12 האתגרים ואת הספים?
2. האם לאשר את 16 ההישגים ואת השמות?
3. האם לאשר את שלבי המסע במקום 10 הדרגות?
4. ביטול הישג אחרי מחיקת רישום: ביטול שקט, או "הישג נשאר".
5. רישום בדיעבד בתוך חלון אתגר: האם נספר?
6. הישגים על היסטוריה קיימת: האם להציג כ"הושגו בעבר"?
