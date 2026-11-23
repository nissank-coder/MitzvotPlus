# הרצה על ה-Mac ועל מכשירים אמיתיים

## הכנה (פעם אחת)

1. להתקין Xcode מה-App Store ולפתוח אותו פעם אחת.
2. להתקין Android Studio.
3. Node 22 ומעלה.

## הורדת הקוד

```bash
git clone https://github.com/nissank-coder/MitzvotPlus.git
```

```bash
cd MitzvotPlus && git checkout claude/fervent-mccarthy-s8uroc
```

```bash
npm ci && npm test
```

## אייפון

```bash
npm run ios:open
```

ב-Xcode: לבחור את ה-target `App` → Signing & Capabilities → Team (Apple ID אישי מספיק לבדיקה על המכשיר שלך). לחבר iPhone בכבל, לבחור אותו ולהריץ ▶.

## אנדרואיד

```bash
npm run android:open
```

ב-Android Studio: להפעיל במכשיר "Developer options" ו-"USB debugging", לחבר בכבל ולהריץ ▶.

## מה לבדוק ולתעד (צילום או וידאו לכל סעיף, ב-docs/mobile-readiness/evidence)

| מזהה | בדיקה | צפוי |
|---|---|---|
| T03 | להתקין, להוסיף 3 ברכות, לסגור לגמרי (swipe), לפתוח שוב | 3 הברכות נשמרו |
| T05 | מצב טיסה ואז פתיחה ראשונה | אין מסך לבן; מסכי הליבה עובדים |
| T06 | בספארי / Chrome במכשיר לפתוח `mitzvotplus://open/blessings`, פעם כשהאפליקציה פתוחה ופעם כשהיא סגורה | נפתח מסך 100 ברכות |
| T06 | `mitzvotplus://open/admin` | האפליקציה נפתחת בלי לנווט |
| T06 | Back באנדרואיד: ממסך פנימי, מלשונית, מהבית | חזרה, חזרה לבית, מזעור |
| T06 | מקלדת בשדה "מחשבה אישית" בדבר תורה; גלילה עד הסוף | השדה נשאר גלוי; סרגל הניווט לא מוסתר |
| T06 | מכשיר עם notch או Dynamic Island, ואנדרואיד 15/16 | כותרת וסרגל תחתון לא מוסתרים |
| T07 | VoiceOver ו-TalkBack במסך 100 ברכות; גופן מוגדל | כל כפתור מוקרא בשמו; אין חיתוך |

## בדיקת 16 KB באנדרואיד

ב-Android Studio: Device Manager → אמולטור עם image של "16 KB page size", להתקין ולהריץ את T03.
