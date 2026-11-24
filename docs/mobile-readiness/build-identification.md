# זיהוי הגרסה שרצה (סבב 9)

במסך **אני ← אודות האפליקציה** מוצגים ארבעה פרטים:

| שדה | מקור | אם אינו זמין |
|---|---|---|
| גרסה | `package.json` (`version`) | תמיד זמין |
| מצב | `Development` (שרת פיתוח), `Demo` (build עם `VITE_DEMO_CONTENT=true`) או `Production` | תמיד זמין |
| Commit | `VITE_BUILD_COMMIT`; ב-GitHub Actions גם `GITHUB_SHA`; אחרת `git rev-parse HEAD`, אם קיימת תיקיית `.git` | "לא זמין בסביבה הזו". **לא ממציאים מזהה** |
| טביעת קוד | hash (SHA-256, 12 תווים) של כל הקבצים ב-`src/` (בלי הבדיקות) | תמיד זמין |
| תאריך | זמן ה-build. בשרת פיתוח: זמן עליית השרת | תמיד זמין |

- ליד ה-commit מוצג "+ שינויים שלא נשמרו ב-commit" כשהקוד שונה מה-commit, כדי שה-commit לא יוצג בטעות כמתאר את הקוד.

## איך מזהים מה AI Studio מציג

- AI Studio מריץ את שרת הפיתוח של Vite, ולכן המצב שיוצג הוא **Development**.
- ייתכן שאין שם תיקיית `.git`. במקרה כזה יוצג "Commit: לא זמין", וזה מצב תקין.
- **טביעת הקוד** מחושבת מהקבצים עצמם, ולכן היא זהה לכל עותק של אותו קוד.
- CI מדפיס אותה בסיכום הריצה ("Source fingerprint") של כל commit. השוואה בין שני הערכים מראה אם AI Studio מריץ את הקוד של אותו commit.
- בדיקה מקומית: `node scripts/build-info.mjs` מדפיס את אותם ערכים.

## הזרקה

- **CI:** `.github/workflows/ci.yml` מעביר `VITE_BUILD_COMMIT` (ב-PR זה ה-head SHA) ל-build הייצור ול-APK.
- **preview אחר:** להגדיר `VITE_BUILD_COMMIT=<sha>` לפני `npm run build` או `npm run dev`. בלי ההגדרה יוצג commit מ-git, אם יש, או "לא זמין".
- הקוד: `scripts/build-info.mjs` ← `vite.config.ts` (`define: __BUILD_INFO__`) ← `src/config/buildInfo.ts`.
