# מצוות+

אפליקציה בעברית למעקב אחר מצוות, ברכות, תפילה ולימוד, עם ניקוד ודרגות. קוד אחד לאייפון, לאנדרואיד ולדפדפן.

**סטטוס (24.11.2026):** אב-טיפוס מקומי מתקדם עם פרויקטי native. **לא מוכן לחנויות.** אין שרת, חשבונות, סנכרון או קהילה אמיתית. G1 (בדיקה על מכשירים) עדיין חסום. פירוט: [`docs/mobile-readiness/`](docs/mobile-readiness/README.md).

## ארכיטקטורה

| שכבה | טכנולוגיה |
|---|---|
| ממשק | React 19, TypeScript (strict), Vite 6, Tailwind CSS 4, RTL |
| אפליקציה נייטיב | Capacitor 8.6.2 – `android/` (Gradle, target 36), `ios/` (Swift Package Manager, iOS 16.4) |
| אחסון | **SQLite** במכשיר (`@capacitor-community/sqlite`, migrations, outbox), localStorage בדפדפן |
| שמירה | `SaveController`: מצב saving/saved/error, ניסיון חוזר, הודעה למשתמש – כשל לא נבלע |
| סודות | Keychain/Keystore (`@aparajita/capacitor-secure-storage`) – מוכן, עדיין לא בשימוש |
| לוח עברי וזמנים | `@hebcal/core` (GPL-2.0 – החלטה פתוחה D07), מדיניות מגורסת `CALENDAR_POLICY` (טיוטה) |
| תוכן | חבילות offline מספריא: סידור ספרד (חול, שבת, מועדים) ותהילים – ממתין לבדיקה רבנית |
| סנכרון | צד לקוח בלבד (`src/sync/outbox.ts`), כבוי: `SYNC_ENABLED=false` |

## פקודות

```bash
npm ci
```

```bash
npm run dev
```

```bash
npm run verify
```

`verify` מריץ: בדיקת טיפוסים, בדיקות יחידה, build לייצור, בדיקת שחרור (אין תוכן בדיקה/דמו, יש CSP), סריקת סודות ובדיקת רישיונות. אותן בדיקות רצות ב-GitHub Actions (`.github/workflows/ci.yml`) על כל PR, יחד עם build של Android ובדיקת 16 KB. אין העלאה אוטומטית לחנויות.

```bash
npm run android:debug
```

```bash
npm run ios:open
```

הרצה על מכשירים: [`docs/mobile-readiness/device-test-runbook.md`](docs/mobile-readiness/device-test-runbook.md).

## דגלים (`src/config/features.ts`)

| דגל | פיתוח (`npm run dev`) | בנייה לייצור |
|---|---|---|
| `DEMO_CONTENT` – קהילה מדומה, נתוני הדגמה, תוכן TEST_ONLY | פעיל | כבוי (הקוד מוסר מהחבילה) |
| `SYNC_ENABLED` | כבוי | כבוי |
| `NOTIFICATIONS_ENABLED` | כבוי | כבוי |

## מבנה

- `src/screens` – מסכים (בית, 100 ברכות, דבר תורה, התקדמות, שמירת הלשון, סידור, תהילים ועוד)
- `src/store` – מצב האפליקציה, reducer, ערכים מחושבים
- `src/storage` – SQLite, migrations, `SaveController`
- `src/lib` – לוח עברי, ניקוד, רצפים, טיימר, תוכנית היום
- `src/content` – חבילות תוכן ורישום תוכן מאושר
- `src/sync` – outbox לסנכרון עתידי
- `scripts/content` – הורדה משוחזרת של התוכן מספריא
- `scripts/ci` – בדיקות שחרור, סודות, רישיונות, 16 KB
- `docs/mobile-readiness` – שערי קבלה, החלטות, ראיות, backlog
