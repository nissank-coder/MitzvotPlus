# דוח G1 – הוכחת המסלול הנייטיב

תאריך: 2026-11-23 · ענף: `claude/fervent-mccarthy-s8uroc` · החלטה: [ADR-001](ADR-001-capacitor.md)

**סטטוס השער: BLOCKED.** הקוד וה-build של Android מוכנים. התקנה על iPhone ועל Android פיזיים, build חתום ובדיקת 16 KB בזמן ריצה לא בוצעו, כי חסרים Mac/Xcode בסביבה הזו, מכשירים, חשבונות מפתח ומפתחות חתימה. שום סעיף כאן אינו טוען שהאפליקציה רצה במכשיר.

## מה מומש

| דרישת G1 | מימוש | בדיקה שבוצעה | סטטוס |
|---|---|---|---|
| מסך ליבה בעברית RTL | המסכים הקיימים, ללא שכתוב. Heebo מקומי (`@fontsource/heebo`) במקום Google Fonts | דפדפן: `dir=rtl`, הגופן נטען מקומית, אפס פניות לשרתים חיצוניים (`evidence/g1-web-check.json`) | BLOCKED (מכשיר); נגישות T07 NOT_RUN |
| פעולה שנשמרת במסד, offline, אחרי סגירה ופתיחה | `src/storage/`: SQLite בנייטיב, localStorage בדפדפן. כל פעולה היא שורה ב-`activities` עם `sync_status='pending'`. שאר המצב בשורת `kv`. שמירה דחויה ב-250ms ושמירה מיידית במעבר לרקע | 5 בדיקות על מנוע SQLite אמיתי (`node:sqlite`): פתיחה מחדש שומרת הכל, שורה לכל פעולה, מחיקה מוחקת שורה. בדפדפן: 3 ברכות נשמרו אחרי טעינה מחדש | PASS בבדיקות יחידה; BLOCKED במכשיר |
| SQLite, migrations ואחסון מאובטח | `@capacitor-community/sqlite` 8.1.1 (MIT). טבלת `schema_migrations`, migration 1, טרנזקציה לכל migration. כשל קריאה חוסם שמירה ומציג הודעה | migration חוזר אינו רץ פעמיים; migration שנכשל מתגלגל אחורה בשלמותו; ייבוא legacy פעם אחת | PASS בבדיקות יחידה. הצפנת המסד ואחסון סודות: NOT_RUN (אין עדיין סודות; D11) |
| מחזור חיים, מקלדת, אזורים בטוחים, ניווט, קישור לאפליקציה סגורה | `src/native/useNativeShell.ts`: כפתור Back של Android, קישורי `mitzvotplus://` (חם וקר דרך `getLaunchUrl`), שמירה ברקע וריענון שעון בחזרה. Keyboard `resize: native`. `SystemBars.insetsHandling='css'` ומשתני safe-area ב-CSS | מנתח הקישורים: רק מסכים מוכרים, scheme זר נדחה (בדיקת יחידה). ה-scheme רשום ב-AndroidManifest (נבדק ב-aapt2) וב-Info.plist | BLOCKED (התנהגות במכשיר) |
| התחברות | לא בהיקף: D04 פתוח | — | NOT_RUN |
| התראות | לא בהיקף: D12 פתוח. נשארות כבויות | — | NOT_RUN |
| build חתום והתקנה | APK debug נבנה ב-Linux. iOS: פרויקט SPM נוצר, לא נבנה | `evidence/g1-android-build.txt` | BLOCKED |
| 16 KB | כל ארבע ספריות `libsqlcipher.so`: zipalign -P 16 תקין, p_align=16384 | סטטי בלבד | BLOCKED (ריצה) |

## שינויים נוספים שהמפרט חייב

- **CSP** בבנייה לייצור (`vite.config.ts`): רק קוד מקומי; רשת רק ל-`www.sefaria.org`. נבדק בדפדפן, ללא שגיאות.
- **Android `allowBackup=false`**, כדי שנתוני הפעילות והטיימר לא יעלו לגיבוי של Google עד החלטת D10/D11.
- **iOS deployment target 16.4**, בגלל רצפת Safari 16.4 של Tailwind 4 (F03). ההחלטה הסופית ב-D14.
- **`ITSAppUsesNonExemptEncryption` לא הוגדר**, כי SQLCipher נכלל בחבילה. ההצהרה תיקבע אחרי בדיקה.
- **vitest 5.1.1**: `npm audit` נקי (היו 2 ממצאים בינוניים ב-dev).
- **appId `com.mitzvotplus.app`**: מזהה פיתוח בלבד (D13).

## גרסאות שננעלו

Capacitor core/cli/android/ios 8.6.2 · app 8.1.2 · keyboard 8.0.6 · status-bar 8.0.4 · splash-screen 8.0.2 · community/sqlite 8.1.1 · fontsource/heebo 5.3.0 · vitest 5.1.1. השאר נעול ב-`package-lock.json`. Android: compile/target 36, min 24, Gradle 8.14.3, JDK 21. iOS: 16.4, SPM.

## תוצאות בדיקות

| בדיקה | סביבה | תוצאה | ראיה |
|---|---|---|---|
| typecheck | Node 22.23.5 | PASS | `npm run lint` |
| בדיקות יחידה | Vitest 5.1.1 | PASS – 4 קבצים, 44 בדיקות | `evidence/g1-tests.txt` |
| web build עם CSP | Vite 6 | PASS (אזהרת גודל חבילה 618KB נשארת) | `dist/index.html` |
| רגרסיה בדפדפן | Chromium 390×844, Asia/Jerusalem | PASS | `evidence/g1-web-check.json`, `evidence/g1-blessings-web.png` |
| Android debug build | Linux, SDK 36 | PASS | `evidence/g1-android-build.txt` |
| 16 KB סטטי | zipalign + ELF | PASS | שם |
| T03 התקנה פיזית | — | BLOCKED | חסרים מכשירים, חתימה, Mac |
| T04 16 KB בריצה | — | BLOCKED | אין מכשיר ואין KVM |
| T06 קישורים ומחוות במכשיר | — | BLOCKED | אין מכשיר |
| T07 נגישות | — | NOT_RUN | — |
| iOS build | — | BLOCKED | אין Xcode |

## מה חסר כדי לסגור את G1

1. על ה-Mac שלך: להריץ את [device-test-runbook.md](device-test-runbook.md), להתקין על iPhone ועל Android, ולתעד וידאו או צילומים ב-`evidence/`.
2. חשבונות Apple Developer ו-Google Play לבנייה חתומה ולמסלולי בדיקה (D01).
3. החלטת D07 על רישוי hebcal. היא חוסמת הפצה, לא בדיקה פנימית.
