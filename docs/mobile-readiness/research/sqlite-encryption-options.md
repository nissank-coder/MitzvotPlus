# הצפנת SQLite ומפתחות ב-Keychain/Keystore – בדיקת אפשרויות

> מסמך הכנה להחלטה **D11** (פתוחה). שום דבר כאן לא הופעל: מסד הנתונים נפתח היום במצב `no-encryption`.

## מצב קיים (נבדק בקוד, 2026-11-24)

- `@capacitor-community/sqlite` 8.1.1 (MIT) כבר כולל את SQLCipher: `libsqlcipher.so` ב-Android (עבר בדיקת 16 KB), ו-SQLCipher דרך SPM ב-iOS.
- `capacitor.config.ts`: `iosIsEncryption: false`, `androidIsEncryption: false`.
- `@aparajita/capacitor-secure-storage` 8.0.1 (MIT) מותקן, ויש מתאם ב-`src/native/secureStore.ts`, אבל הוא לא בשימוש.
- איפה הפלאגין שומר את סיסמת ההצפנה:
  - iOS: Keychain (`kSecClassGenericPassword`, בלי `kSecAttrAccessible` מפורש, כלומר ברירת המחדל `WhenUnlocked`, לא מסונכרן ל-iCloud).
  - Android: `EncryptedSharedPreferences` עם `MasterKey` AES256-GCM ב-Android Keystore, דרך `androidx.security:security-crypto:1.1.0-alpha06`.
  - ⚠️ גוגל הוציאה את הספרייה הזו משימוש (deprecated), והגרסה היא alpha. זה סיכון תחזוקה, לא באג ידוע.

## אפשרויות

| # | אפשרות | מה זה נותן | עלות ומחיר | סיכונים |
|---|---|---|---|---|
| A | **בלי הצפנת מסד** (המצב היום). מסתמכים על הצפנת המכשיר (iOS Data Protection, Android FBE) ועל `allowBackup=false` | פשוט, אפס עבודה | – | אם המכשיר פתוח, או בגיבוי iTunes/Finder לא מוצפן, הקובץ קריא. רמת הרגישות של "אילו מצוות עשיתי" היא החלטת בעלים |
| B | **SQLCipher של הפלאגין** + סיסמה אקראית שהאפליקציה מייצרת ושומרת בעצמה (`setEncryptionSecret` בהפעלה הראשונה, `isSecretStored` בכל הפעלה, ופתיחה במצב `secret`) | הצפנת קובץ מלאה (AES-256) | כיום: חצי עד יום פיתוח, ובדיקת הגירה מקובץ לא מוצפן (`encryption` mode, פעם אחת) | תלות ב-security-crypto (alpha, deprecated). שחזור: אם ה-Keystore נמחק (החלפת נעילת מסך בחלק מהמכשירים), המסד אבוד |
| C | **SQLCipher** + מפתח שהאפליקציה שומרת דרך `capacitor-secure-storage` (Keychain עם `ThisDeviceOnly`, ו-Keystore ישירות, בלי security-crypto). הסיסמה מועברת לפלאגין בכל פתיחה | שליטה מלאה במדיניות הגישה (למשל `AfterFirstUnlockThisDeviceOnly`) | כיום עד יומיים פיתוח | עוד תלות במסלול ההפעלה. אותו סיכון אובדן מפתח כמו ב-B |
| D | הצפנה ברמת השדה (רק עמודות רגישות) | מצמצם השפעה על ביצועים | הכי הרבה עבודה | מסובך, ואין בו צורך בהיקף הנתונים הנוכחי |

## נקודות לבדיקה לפני החלטה

1. **ייצוא הצפנה:** SQLCipher הוא הצפנה. ב-App Store Connect צריך לענות על שאלת Export Compliance (`ITSAppUsesNonExemptEncryption`). המפתח הוסר בכוונה מ-Info.plist עד להחלטה. ההחלטה דורשת בדיקה משפטית, לא החלטה שלי.
2. **רישוי SQLCipher Community:** BSD-style, עם דרישת ייחוס. לוודא שהשורה נכנסת למסך הרישיונות.
3. **גיבוי:** ב-iOS הקובץ נמצא ב-`Library/CapacitorDatabase` ונכלל בגיבוי iCloud כברירת מחדל. ההחלטה על החרגה מגיבוי (`isExcludedFromBackup`) קשורה ל-D11.
4. **שחזור:** בכל אפשרות עם הצפנה, אובדן המפתח פירושו אובדן הנתונים המקומיים (כל עוד אין סנכרון לשרת, `SYNC_ENABLED=false`).

## מה אפשר להכין בלי החלטה

- בדיקת יחידה למסלול "סיסמה קיימת / לא קיימת" עם פלאגין מדומה.
- מתג build `DB_ENCRYPTION` כבוי כברירת מחדל.

שני אלה לא בוצעו, כי הם מכתיבים את מבנה הקוד לפי B או C לפני ההחלטה.
