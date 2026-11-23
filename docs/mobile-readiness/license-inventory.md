# מלאי רישיונות

תאריך: 2026-11-23. מקור: שדה `license` בכל חבילה ב-`package-lock.json` / `node_modules` אחרי `npm ci` (סקריפט קריאה מקומי; כלי סריקה חיצוני לא הותקן).

## תלויות שמופצות באפליקציה (production)

| חבילה | גרסה | רישיון | הערה |
|---|---|---|---|
| react, react-dom, scheduler | 19.3.1 / 0.28.0 | MIT | — |
| @capacitor/* (core, android, ios, app, keyboard, status-bar, splash-screen) | 8.x | MIT | — |
| @capacitor-community/sqlite, jeep-sqlite | 8.1.1 / 2.x | MIT | כולל את הספרייה הנייטיב SQLCipher – ראו הערה 2 |
| @fontsource/heebo | 5.3.0 | OFL-1.1 | גופן; מותר להטמעה באפליקציה |
| @hebcal/learning | 5.1.2 | BSD-2-Clause | — |
| temporal-polyfill, quick-lru | — | MIT | — |
| temporal-spec | — | ISC | — |
| tslib | — | 0BSD | — |
| **@hebcal/core** | 5.10.1 | **GPL-2.0** | ראו ממצא 1 |
| **@hebcal/hdate** | 0.14.5 | **GPL-2.0** | ראו ממצא 1 |
| **@hebcal/noaa** | 0.9.2 | **LGPL-2.1** | ראו ממצא 1 |

תלויות פיתוח (לא מופצות): MIT ברובן, ובנוסף Apache-2.0, ISC, BSD, MPL-2.0 (lightningcss) ו-CC-BY-4.0 (caniuse-lite). אין בהן חסם הפצה.

## ממצא 1 – GPL בקוד המופץ (פתוח, חוסם הפצה)

הלוח העברי, זמני היום ומצב השבת נשענים על ספריות hebcal ברישיון GPL-2.0. אפליקציה שמשלבת קוד GPL ומופצת כקוד בינארי חייבת בדרך כלל לעמוד בתנאי ה-GPL על כל היצירה, כולל זמינות קוד המקור. בנוסף, יש עמדה ידועה (בעיקר של FSF) שתנאי ה-App Store אינם מתיישבים עם GPL. **זו אינה חוות דעת משפטית.** הפירוט לפי חבילה: [dependency_license_inventory.csv](dependency_license_inventory.csv).

אפשרויות להחלטת הבעלים:

1. לפרסם את קוד האפליקציה כולו בקוד פתוח ברישיון תואם GPL, ולקבל חוות דעת על הפצה ב-App Store.
2. לבקש מבעלי הזכויות של hebcal רישיון אחר (אם מוצע).
3. להחליף את הרכיבים בקוד ברישיון מתירני או בקוד עצמי (המרת תאריכים, זמנים, חגים ופרשות). זו עבודה משמעותית, וכל 10 בדיקות הלוח הקיימות יבדקו אותה.

עד ההחלטה: לא להפיץ build שמכיל hebcal מחוץ לבדיקה פנימית.

## ממצא 2 – הצפנה בחבילה

`@capacitor-community/sqlite` מכניס את SQLCipher (ספריית הצפנה) ל-APK, גם כשהמסד פועל במצב `no-encryption`. זה משפיע על הצהרת ייצוא ההצפנה של אפל (`ITSAppUsesNonExemptEncryption`) ועל טופסי Play. ההצהרה **לא** נקבעה בקוד, ותיקבע אחרי בדיקה.

## ממצא 3 – תוכן תורני

טקסטים שנטענים מספריא (Sefaria) כפופים לרישיון של כל טקסט בנפרד. מלאי רישיונות התוכן פתוח – ראו backlog.
