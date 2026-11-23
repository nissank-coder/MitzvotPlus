# מקורות רשמיים לביקורת מצוות+

**תאריך בדיקה: 23.11.2026.** יש לאמת מחדש דרישות משתנות בסמוך להגשה.

ה-PDF המצורף בן 14 העמודים הוא המסמך שנבדק. ההפניות לעמודים בדוח מתייחסות אליו. המקורות להלן תומכים בעובדות טכניות ובדרישות חנויות; מבנה המערכת, תעדוף ובדיקות הקבלה הם המלצות הנדסיות שנכתבו עבור הפרויקט.

לא בוצעה בדיקת המאגר בפועל. רישיונות, גרסאות, היקף איסוף מידע והגדרות הגשה חייבים להיבדק על התוצר הממשי.

## S01 | Capacitor: official documentation

[Capacitor: official documentation](https://capacitorjs.com/docs)

Native packages with a web UI and native integrations.

## S02 | Capacitor: environment setup and version 8

[Capacitor: environment setup and version 8](https://capacitorjs.com/docs/getting-started/environment-setup)

Toolchain prerequisites; pin exact compatible versions after repository audit.

## S03 | Tailwind CSS: compatibility

[Tailwind CSS: compatibility](https://tailwindcss.com/docs/compatibility)

Version 4 browser floors: Safari 16.4, Chrome 111, Firefox 128.

## S04 | Apple: upcoming requirements

[Apple: upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)

Xcode 26 and iOS/iPadOS 26 SDK requirements; recheck before actual submission.

## S05 | Google Play: target API requirements

[Google Play: target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)

Standard mobile new apps and updates target API 36+ from 31 August 2026.

## S06 | Android: 16 KB page sizes

[Android: 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)

Check all bundled native libraries; current page names 1 February 2027 for blocking incompatible updates.

## S07 | Apple: App Review Guidelines

[Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

Completeness, app utility, documented behavior, social login, UGC, downloaded code and sensitive push content.

## S08 | Apple: provide information for a complete review

[Apple: provide information for a complete review](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review)

Working review access, credentials and complete explanations.

## S09 | Apple: third-party SDK requirements

[Apple: third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)

Listed SDK privacy manifests, binary SDK signatures and dependency responsibility.

## S10 | Apple: account deletion

[Apple: account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)

In-app account deletion initiation; disabling an account is insufficient.

## S11 | Apple TN3194: deletion and Sign in with Apple token revocation

[Apple TN3194: deletion and Sign in with Apple token revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)

Credential lifecycle, server token revocation and local cleanup.

## S12 | Google Play: account deletion requirements

[Google Play: account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

In-app path and a working web resource for deletion requests.

## S13 | Apple: App Privacy Details

[Apple: App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

Includes religious beliefs in Sensitive Info; assess actual collected data and partners.

## S14 | Google Play: Data safety

[Google Play: Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)

Own and SDK data flows, including controlled WebViews; religious-belief category.

## S15 | Google Play: User Data

[Google Play: User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)

Disclosure, personal/sensitive data, privacy policy and third-party code responsibility.

## S16 | Google Play: new personal-account testing

[Google Play: new personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

Accounts created after 13 November 2023: 12 testers continuously opted in for 14 days, followed by production-access application.

## S17 | Capacitor: Push Notifications plugin

[Capacitor: Push Notifications plugin](https://capacitorjs.com/docs/apis/push-notifications)

APNs versus FCM token distinction; terminated-process/data-only and iOS silent-push limitations.

## S18 | Capacitor: Firebase push integration

[Capacitor: Firebase push integration](https://capacitorjs.com/docs/guides/push-notifications-firebase)

Explicit native Firebase Messaging integration for an FCM token on iOS.

## S19 | Firebase: message lifespan

[Firebase: message lifespan](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan)

TTL and queued delivery behavior; default lifespan can be four weeks.

## S20 | Android: schedule alarms

[Android: schedule alarms](https://developer.android.com/develop/background-work/services/alarms)

Inexact delay, power-management constraints and exact-alarm distinctions.

## S21 | Capacitor: Local Notifications plugin

[Capacitor: Local Notifications plugin](https://capacitorjs.com/docs/apis/local-notifications)

Permission, scheduling and Private Space constraints.

## S22 | Hebcal: Developer APIs

[Hebcal: Developer APIs](https://www.hebcal.com/home/developer-apis)

GPL software versus CC BY 4.0 generated API content; audit exact installed dependencies separately.

## S23 | Capacitor Community SQLite: maintainer README

[Capacitor Community SQLite: maintainer README](https://github.com/capacitor-community/sqlite)

SQLCipher is included even for unencrypted databases in this plugin.

## S24 | Sefaria: licensing and copyright per edition

[Sefaria: licensing and copyright per edition](https://help.sefaria.org/hc/en-us/articles/18490043237148-How-to-Find-and-Understand-Licensing-or-Copyright-Information)

Version/language-specific licenses, attribution and unverified missing licenses.

## S25 | Sefaria: Texts API v3

[Sefaria: Texts API v3](https://developers.sefaria.org/reference/get-v3-texts)

Version selection and per-version licensing metadata.

## S26 | Supabase: column-level security

[Supabase: column-level security](https://supabase.com/docs/guides/database/postgres/column-level-security)

Row access is not field-level isolation.

## S27 | Supabase: row-level security

[Supabase: row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

Policies, roles and privileged access require explicit review.

## S28 | Android 16: behavior changes

[Android 16: behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16)

Edge-to-edge, back navigation and large-screen behavior.

## S29 | Apple: set an age rating

[Apple: set an age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)

Align rating override with EULA minimum age where required.

## S30 | Google Play: staged rollout

[Google Play: staged rollout](https://support.google.com/googleplay/android-developer/answer/6346149?hl=en)

Percentage rollout is for updates, not initial publication.

## S31 | GDPR: official regulation

[GDPR: official regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?from=E&uri=CELEX%3A32016R0679)

Articles 3, 6, 8 and 9: scope, lawful basis, minors and religious-belief data; legal applicability must be determined.

## S32 | Israel Privacy Protection Authority: Amendment 13 Q&A

[Israel Privacy Protection Authority: Amendment 13 Q&A](https://www.gov.il/he/pages/tikun13_qa?chapterIndex=6)

Updated personal-data framework; local legal review of obligations is required for the actual operator and processing.

## S33 | Google Play: user-generated content

[Google Play: user-generated content](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)

Content moderation, reporting and blocking apply to actual shared user content.

## S34 | Apple: encryption export regulations

[Apple: encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)

Classify the actual linked cryptographic dependencies; do not infer solely from HTTPS.

## S35 | Android: app signing

[Android: app signing](https://developer.android.com/studio/publish/app-signing)

Upload key versus app-signing key; verify distribution-build identity and integrations.

## S36 | Google Play: target audience and content

[Google Play: target audience and content](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en)

Age groups and actual product/audience must agree.

## S37 | Google Play: child safety standards

[Google Play: child safety standards](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en-GB)

Assess applicability if classified as Social; do not assume every habit app falls in that category.

## S38 | Capacitor: deep links

[Capacitor: deep links](https://capacitorjs.com/docs/guides/deep-links)

Native association and App events beyond a web router.

## S39 | Supabase: native mobile deep linking

[Supabase: native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)

Authentication redirect setup for a native app.

## S40 | Apple: required-reason APIs

[Apple: required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)

Declarations must match actual application and SDK API uses.

## מגבלות המקורות

- S31-S32: אומתו מקטעים במקורות הרשמיים דרך החיפוש; טעינה ישירה של המסמכים המלאים הוחזרה כחסומה. אין כאן ניתוח משפטי מלא או הכרעה בתחולת החוק על המוצר.
- דפי Apple הדינמיים נקראו גם באמצעות גרסאות Markdown הרשמיות שלהם כשנדרש. הקישורים לעיל הם הכתובות הקנוניות.
- דף Android 16 KB שנבדק מציין 1.2.2027 לחסימת עדכונים לא תואמים. אין להסיק מכך שכדאי להפיץ קודם לכן קוד שאינו עובד על מכשירי 16 KB.
- S07 מרכז כמה הוראות חנות. פרטי המימוש המוצעים בחבילה אינם ציטוט או אישור מטעם Apple.
- אין לרשום שהחנויות, יועץ משפטי או רב אישרו את המוצר ללא אישור אמיתי מתועד.
