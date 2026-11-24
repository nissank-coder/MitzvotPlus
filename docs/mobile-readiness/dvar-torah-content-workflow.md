# תהליך הכנסת "דבר תורה" מאושר

התשתית מוכנה. התוכן עצמו ממתין להחלטה **D08**: מי הסוקר, ומאילו מקורות.

## איך זה עובד בקוד

- תוכן מאושר נשמר ב-`src/content/packs/dvar-torah.json` (כרגע ריק).
- `src/content/validate.ts` בודק כל פריט. פריט שלא עובר **לא מוצג** (fail closed). הבדיקות:
  - מזהה בפורמט `dvar-torah/<slug>`;
  - כותרת, גוף טקסט וגרסה;
  - `approval: "APPROVED"`;
  - מקור מדויק (`source.title`, ואם אפשר גם `ref` ו-`url`);
  - רישיון מתוך הרשימה המותרת (`Public Domain`, `CC0`, `CC-BY`), ול-CC-BY גם ייחוס;
  - שם הסוקר ותאריך הסקירה (`review.reviewer`, `review.reviewedAt`).
- הבדיקה `src/__tests__/dvarTorahPipeline.test.ts` רצה ב-CI ונכשלת אם:
  - פריט נדחה;
  - אין לו שורה ב-`content_license_manifest.csv` עם `approval_status=APPROVED` ו-`offline_distribution_allowed=YES`;
  - הרישיון או הגרסה לא תואמים;
  - ה-`content_sha256` לא תואם לגוף הטקסט, כלומר הטקסט שונה אחרי האישור.
- כשיש לפחות פריט מאושר אחד, דבר התורה מופיע אוטומטית במסך הבית ובתוכנית היום. עד אז הוא מוסתר בגרסת production.

## צעדים להוספת פריט

1. **מקור:** טקסט ברשות הציבור או ברישיון CC0/CC-BY, עם הפניה מדויקת. טקסט שנכתב במיוחד לאפליקציה דורש אישור בכתב מהכותב (`permission_evidence`).
2. **סקירה:** הסוקר שתמנה ב-D08 קורא את הטקסט, מאשר תוכן ונוסח, ורושם שם ותאריך.
3. **רישום:**
   - הוספת הפריט ל-`dvar-torah.json`;
   - הוספת שורה ל-`content_license_manifest.csv`, עם `content_sha256` שמחושב כך:

     ```bash
     node -e "const p=require('./src/content/packs/dvar-torah.json');for(const i of p.items)console.log(i.id,require('crypto').createHash('sha256').update(i.body,'utf8').digest('hex'))"
     ```

4. **אימות:** `npm run verify`. אם משהו חסר, הבדיקה תגיד בדיוק מה.

## דוגמה למבנה (לא תוכן אמיתי)

```json
{
  "id": "dvar-torah/vayishlach-1",
  "version": "1",
  "kind": "dvar-torah",
  "language": "he",
  "title": "…",
  "body": "…",
  "author": "…",
  "source": { "title": "…", "ref": "…", "url": "https://…" },
  "license": { "id": "Public Domain" },
  "approval": "APPROVED",
  "review": { "reviewer": "<שם הסוקר שנקבע ב-D08>", "reviewedAt": "2026-12-01" }
}
```

## מה לא מוחלט כאן

- מי הסוקר;
- אילו מקורות מתאימים;
- האם הטקסט משתנה לפי פרשה או לפי יום;
- האם יש הקראה ושיתוף (ראו [research/share-tts-options.md](research/share-tts-options.md)).

כל אלה החלטות בעלים.
