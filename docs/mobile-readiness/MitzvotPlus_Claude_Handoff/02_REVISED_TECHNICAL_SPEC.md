# MitzvotPlus: proposed implementation contract

Version: 1.0, reviewed 2026-11-23. Status: proposed engineering specification, not an implemented or tested system.

Read 06_DECISIONS_HE.md before treating scope, age, countries, Sabbath behavior or retention choices as approved. Source identifiers refer to 07_SOURCES.md. The original product is Hebrew-first, mature, friendly and community-oriented.

## 1. Baseline and architecture

Record the actual repository, branch, commit, working-tree changes, package manager, lockfile, framework, test commands, native projects, data formats and existing screens. Preserve work already present. Do not infer source code from screenshots or historical claims.

If the current app is React DOM/Vite, provisionally retain that UI and add a compatible Capacitor shell. If it is Expo/React Native, reassess instead of porting it to match the PDF. Separate domain rules, persistence, identity, calendar policy and notification planning from the renderer.

Proposed boundaries:

| Boundary | Responsibility |
| --- | --- |
| UI | Hebrew RTL, navigation, accessible interactions, pending/error states |
| Domain | Blessing actions, learning completion, progress, time policy, correction rules |
| Persistence | Durable local database, migrations, private timer, transactional outbox |
| Identity | Guest partition, authenticated account, secure session adapter, identity linking |
| Sync | Batches, receipts, cursors, tombstones, retries, account lifecycle checks |
| Native adapters | Lifecycle, storage keys, links, notifications, permissions, sharing |
| Backend | Auth validation, authoritative event intake, ledger, access policy, deletion |
| Content | Bundled approved editions, versioned data updates, attribution, rollback |

Do not require a continuously running JavaScript background process for correctness. Build outputs must bundle production web assets; a development live-reload URL is not a production configuration.

## 2. Compatibility gate

Use templates/compatibility_matrix.csv. Select exact compatible versions from the real dependency graph; pin them rather than writing a floating "latest" instruction.

Current verified submission baselines are Xcode 26+/iOS SDK 26+ and Android target API 36+ for this standard mobile application. Distinguish SDK used to build from OS versions supported. Require a 16 KB audit and runtime test for all native Android dependencies. Recheck before submission. [S04-S06]

With Tailwind 4, the app's CSS support floor must account for Safari 16.4+/Chrome 111+. Choose a compatible deployment floor or an intentional CSS alternative. Do not promise support for an old Android device solely because its OS meets Capacitor's minimum. [S03]

The native spike must test SQLite, secure storage, the chosen authentication path, a cold-start link, an offline core interaction, native navigation, accessible RTL and any notification path intended for launch. A Vite build does not satisfy it.

## 3. Four core flows

### Blessings

- Persist each deliberate increment as an action with a stable event ID; do not sync an overwriteable daily total.
- Offer correction/undo. Distinguish an accidental double submission from two legitimate blessings.
- Display progress toward 100 without silently discarding valid entries beyond the target.
- Apply an explicit day-boundary policy; store its version with the event.
- Show personal history, pending sync and understandable rejection/correction states.
- A first offline launch must have a useful screen and persistent local behavior.

### Torah

- Bundle a small, approved, licensed set of content for first launch and offline reading.
- Use stable content ID and version. An explicit "completed" action can award progress according to a written rule.
- Decide whether completion is once per day/content/version; enforce that business key server-side.
- Viewing duration is not verification of learning. Do not create fictitious rabbinic approval or attribute generated commentary to a source.
- Preserve headings, citations, Hebrew punctuation, accessible text size and offline attribution.

### Progress and points

- Personal progress and optional social progress are separate projections.
- Use the label "נקודות התמדה" unless the owner chooses another clear label.
- Server-accepted points are authoritative for shared rankings; pending points are visibly provisional.
- Version scoring rules. Historical totals must remain reproducible after a rule change.
- Restrict shared points to an explicit opt-in allowlist. Speech resets and private charity events are excluded by default.
- Self-reporting is a product property. Rate limits and caps prevent obvious abuse; they do not prove religious observance.

### Speech timer

- Recommended v1 storage is local-only, outside cloud events and telemetry.
- Store the latest reset instant and the previous state needed for undo; derive elapsed time on render/resume.
- Define whether the timer starts only when the user activates it. Do not preseed a fake achievement.
- Handle app termination, restart, civil-day rollover and a changed device clock without negative durations or invented streak records.
- Use a monotonic clock while a process is alive where practical; document cross-reboot wall-clock limitations.
- No background execution permission is needed merely to display elapsed time.

## 4. Time and Sabbath policy

Implement a versioned CalendarPolicy through an injectable clock for tests. Production time policy must never depend on detecting a store reviewer.

Required policy inputs:

| Input | Meaning |
| --- | --- |
| IANA time zone | Rules for offsets and daylight-saving transitions |
| Selected city/location | Explicit user selection; manual entry works without location permission |
| Israel/Diaspora | Holiday calendar and consecutive prohibited intervals |
| Candle-lighting/havdalah method | Recorded convention, offsets and applicable elevation decision |
| Day boundary | Separate religious logging day and leaderboard reporting day if needed |
| Week/month boundary | Defined start of week and unambiguous Hebrew month, including leap years |
| Policy version | Reproduce historical classification after updates |
| Coverage/failure behavior | Extreme latitude, missing data, stale cached calendar and travel |

Distinguish occurred_at_utc, recorded_at_utc and server_received_at_utc. Client times are claims. Server time is authoritative for receipt and rate limiting, not proof of when a mitzvah occurred.

Distinguish the shared calendar-rule version from the user's historical calendar context. Preserve an immutable context snapshot or reference containing the selected location, time zone, Israel/Diaspora choice and applicable conventions. The server validates that the context belongs to the account and was eligible for the claimed event. Do not classify historical events using today's mutable profile city. A later settings change applies prospectively unless an explicit correction policy authorizes reclassification.

A new context can be created offline with a stable local identifier and submitted with its dependent events. Context registration and ownership validation must not require connectivity at the moment of logging. During guest import, preserve the historical context as a user claim and validate its structure and applicable import rules; do not represent a later server registration as proof that the location or settings were verified at the original event time.

Recommended interpretation pending owner/rabbinic decision: block new activity recording during the chosen Sabbath/holiday interval; if server intake is also prohibited, defer intake with a retry-after outcome. Preserve earlier offline events. Allow bounded retrospective personal entries after the interval, with explicit shared-score eligibility rules. Do not reward retrospective edits without a defined rule.

Freeze neither legal/privacy support nor deletion access accidentally. Specify these routes separately from the activity lock. Do not permanently discard queued activity solely because a retry arrives during Sabbath.

Test DST transitions, Friday through Sunday holidays abroad, Hebrew leap-month boundaries, travel, clock rollback, a newly selected city and unsupported astronomical calculations. Expected outputs require approved fixtures; do not label an unreviewed algorithm halachically authoritative.

## 5. Persistence and secure storage

Select a maintained SQLite adapter with compatible native packages, license inventory, migrations and 16 KB evidence. Decide database encryption and backup behavior explicitly. Native credential storage should be backed by Keychain/Keystore or a reviewed equivalent; Preferences is for nonsecret settings.

Secure storage reduces at-rest exposure; it does not neutralize malicious JavaScript running in a privileged WebView. Bundle trusted assets, use an appropriate CSP, validate content, avoid arbitrary remote HTML/script execution and open external links outside the privileged origin.

Use separate data partitions for guest and authenticated identities. Logout must prevent the next account from reading prior data, cache, reports or queued operations. Decide which local data survives logout and explain that choice to the user.

A database change has a schema version, migration fixture, transaction/recovery plan and upgrade test. Do not silently reset the database on migration failure.

Three migrations require different designs:

1. Existing local storage to SQLite within the same installed application.
2. Local guest data to a chosen authenticated account.
3. Old website/PWA data to a new native application with a different origin.

For the third case, define an explicit export/import or authenticated transfer. The native application cannot assume it owns the browser's localStorage.

## 6. Data model and access

The following is a logical contract, not production-ready SQL:

| Entity | Access and constraints |
| --- | --- |
| private_profiles | Owner only; optional nusach/city and settings; collect only fields needed |
| social_profiles | Minimal nickname/avatar choice; visible only through accepted relationship and consent |
| activity_events | Owner read; validated server mutation only; immutable accepted payload |
| score_ledger | Server writes; event reference and rule version; compensating entries for corrections |
| personal_period_scores | Owner read; deterministic projection from the ledger |
| shared_period_scores | Approved categories only; opt-in audience; block checks; no private event details |
| friendships / blocks | Explicit state machine; block in either direction takes precedence |
| device_registrations | Server-controlled access to token/provider/env; no friend-readable token table |
| calendar_contexts | Account-owned immutable settings snapshots; validated registration, including offline imports |
| scoring_rule_versions | Server-controlled immutable rules referenced by accepted ledger entries |
| content_versions | Approved immutable editions plus active-version pointer |
| moderation_reports | Reporter can create limited reports; authorized staff can process |
| deletion_jobs | Server-only lifecycle and minimal receipt; retention reviewed separately |

RLS is not column security. Prefer separate entities to exposing a mixed private profile. Audit grants, views, RPC execution and SECURITY DEFINER search paths/authentication, as well as row policies. No service-role secret in any client bundle. [S26, S27]

Only the server-derived authenticated identity establishes ownership. Installation IDs are resettable app-generated identifiers, not hardware tracking IDs and not proof of a person.

Invitation codes must be unguessable, expiring where appropriate, rate-limited and revocable. Avoid uploading address books for v1. A block immediately stops future server-authorized visibility and interaction and suppresses social delivery still controlled by the application. Invalidate affected connected-client caches; disconnected clients clear or refresh affected cached data when they next connect under a documented expiry policy. Previously delivered offline data, provider-accepted notifications and screenshots cannot be recalled reliably. Do not promise their immediate erasure.

## 7. Event and synchronization contract

Illustrative TypeScript data contract, to adapt to the verified repository:

~~~ts
type EventEnvelope = {
  eventId: string;
  installationId: string;
  schemaVersion: number;
  accountGeneration: string;
  recordedAtUtc: string;
};

type CreateActivityEvent = EventEnvelope & {
  operation: "create";
  actionType: "blessing" | "learning_completed";
  quantity: number;
  occurredAtUtc: string;
  eventTimeZone: string;
  calendarPolicyVersion: string;
  calendarContextId: string;
  contentId?: string;
  contentVersion?: string;
};

type VoidActivityEvent = EventEnvelope & {
  operation: "void";
  targetEventId: string;
};

type ActivityEvent = CreateActivityEvent | VoidActivityEvent;

type EventReceipt = {
  eventId: string;
  outcome: "accepted" | "duplicate" | "rejected" | "deferred";
  reasonCode?: string;
  retryAfterUtc?: string;
  serverReceivedAtUtc: string;
  scoreRuleVersion?: string;
  authoritativeScoreDelta?: number;
};
~~~

Server-owned fields such as owner ID, canonical payload hash, ledger sequence and final period keys are not accepted as authority from a client. accountGeneration is issued and validated by the server, not selected or reset by the client. Local guest events remain in their guest partition; an explicit authenticated import assigns the target account's current generation without changing their stable source identities. A deleted or superseded generation cannot authorize a new import.

Freeze the canonical event payload at first enqueue, with a documented normalization rule. Authentication headers, retries and transport metadata are outside that payload. User corrections create new operations rather than silently modifying an already submitted event ID. calendarContextId references the immutable, validated context described in section 4; retain the rule definitions needed to reproduce historical classification.

A void operation references an authorized original event; it must not let a client subtract another person's score. Enforce at most one effective reversal per accepted target event, independently of the void operation's own ID. Concurrent voids with different IDs must not create multiple compensating ledger entries. If the original event has not arrived, hold/defer the dependent void and retry after the original is resolved, with a bounded missing-target policy. If the original is rejected, resolve the void as a non-scoring outcome. Never guess a negative score for an unknown target. Define correction eligibility windows explicitly.

### Push to server

1. In one local transaction, persist the activity and its outbox record.
2. Submit a bounded batch authenticated to the intended account and generation.
3. In a server transaction validate action, quantity, time window, content, membership where relevant and domain uniqueness. Derive all final scores.
4. Enforce uniqueness on owner plus event ID. The same canonical payload returns its stored terminal outcome once accepted or permanently rejected. A different payload using that ID returns a conflict. A deferred receipt is nonterminal: re-evaluate eligibility after retryAfterUtc rather than returning a cached deferral forever. Temporary infrastructure failures must not be recorded as permanent business rejections.
5. Apply domain uniqueness and caps separately from transport idempotency. For example, a once-per-day learning completion cannot be repeated by inventing a new event ID.
6. Insert the accepted event and ledger entry atomically. Serialize or constrain concurrent changes affecting the same domain limit or reversal target so two individually valid requests cannot together violate a cap or reverse twice.
7. Return per-event receipts. Deferred is retryable; rejected is an explicit product state, not an infinite retry. In this contract, duplicate means the same event was already accepted; a repeated permanent rejection returns its rejected outcome, not a success-shaped duplicate.
8. In one local transaction, persist the receipt, reconcile the event's state and acknowledge terminal outbox work. Retain deferred items with their next-attempt time. Terminal rejections may leave the retry queue only after their reason remains available to the UI and correction flow. Do not apply an authoritative score delta twice when replaying a receipt.

### Pull and conflict resolution

- Pull authoritative events, corrections, profile versions and tombstones using a documented commit-safe change feed and cursor. A plain increasing sequence or updated_at value is insufficient by itself: a transaction with a lower allocated value can commit after a later value has already been read. Use a suitable ordered feed or explicit synchronization/snapshot-watermark protocol and demonstrate that no late commit is skipped. Define pagination, snapshot boundaries and cursor retention.
- Apply a page and its cursor in one local transaction.
- Retry with bounded exponential backoff and jitter. Authentication errors require session handling rather than endless retries.
- Keep per-account cursors. Never upload pending work into a different logged-in account.
- If a cursor expires, use a defined resnapshot flow that respects deletion records.
- Resolve scalar profile edits with a documented version/conflict policy. Score is ledger-derived, not last-write-wins.
- Correct accepted activity using a new authorized operation and compensating ledger entry; preserve an accountable history according to retention policy.
- Account-deletion status/generation is checked before accepting old queued events.

Guest import uses a durable migration ID and stable source event IDs. Ask for a clear choice when merging into an account with history. A failed or repeated import must not double points or mix two users.

## 8. Authentication and deletion

Keep local guest use distinct from a server-created anonymous account. Authentication is needed for sync and social features, not necessarily for personal offline counters.

Use supported native SDK/system-browser flows with allowed redirects and appropriate PKCE/state/nonce protections. Configure native association files, entitlements and link handling. Test cold/warm starts, cancellation, invalid callbacks and replay. [S38, S39]

If Google social login ships on iOS, implement an applicable equivalent privacy-preserving option; Sign in with Apple is the recommended straightforward route here, subject to the final auth design. Do not force phone collection after Apple login without a separate justified need. [S07]

Define token refresh, expiry, revocation, safe identity linking and recovery. Supabase sessions should use the chosen native secure-storage adapter. Backend Apple authorization-code exchange/revocation responsibilities must be explicit; do not assume deleting a Supabase Auth row covers Apple credentials. [S11]

Deletion is a resumable workflow:

~~~text
requested -> identity_verified -> access_revoked -> personal_data_erased
          -> provider_cleanup -> completion_recorded
~~~

Steps can fail and retry independently. Revoke access and stop new writes promptly; do not make deletion depend indefinitely on a third-party outage. Handle Apple revocation, push registrations, group ownership if present, analytics processors and relevant storage. Provide a working web request path and an in-app flow. [S10-S12]

For offline devices, invalidate access server-side and clear the account partition when they next connect. A new login must not revive deleted outbox data. Record a reviewed retention schedule for backups, abuse evidence and minimal deletion receipts; never promise immediate deletion from unreachable devices or every backup if untrue.

## 9. Notification contract

Choose one route in an ADR:

- APNs sender for iOS plus FCM sender for Android; or
- an explicit, tested Firebase Messaging integration on both platforms.

Do not submit an APNs device token to an FCM registration-token endpoint. Store provider and environment with the registration, rotate tokens and invalidate them on logout/deletion. [S17, S18]

Each planned message includes message ID, deduplication key, allowed audience, neutral display template, earliest-send time, expires-at time, recipient time-zone snapshot and calendar policy version. Sensitive personal details must not appear on lock screens.

Validate eligibility before enqueueing and immediately before sending. Set provider TTL/expiration deliberately. Cancel stale local schedules and re-evaluate supported lifecycle/location changes. Use one-off bounded scheduling rather than an indefinite repeating alarm across all holidays.

A client display-time guard may only be claimed when it executes on the actual native delivery path. React callbacks in a terminated process are not such a guard. Do not substitute silent pushes for a reliable background clock.

The precise release promise is: the application will not intentionally schedule or send during forbidden intervals, and will suppress expired controllable notifications. This does not guarantee that an OS will never present a previously accepted notification later. If that limitation is unacceptable, keep affected notification channels disabled.

Remote social push is deferred by recommendation. Local reminders remain disabled until the applicable tests and owner decision pass. Notification and location denial must leave the core app usable.

## 10. Content and licenses

Use templates/content_license_manifest.csv and dependency_license_inventory.csv.

Block shipment of a content item without verified reuse rights for the exact edition and language. Keep license, attribution, publisher/author, passage, permission evidence, editorial reviewer and checksum with each item. Missing segments must not be silently filled from an unapproved version. [S24, S25]

Audit the exact Hebcal software and transitive licenses independently of text/API-output licensing. Record a documented distribution decision before bundling a disputed dependency. [S22]

Content updates are data: schema-validated, bounded, versioned, integrity-checked, reviewed and rollback-capable. Preserve offline fallback and attributions. Do not execute remote scripts or accept unrestricted HTML.

Recommended v1 policy: application JS/CSS, navigation, authentication, scoring and Sabbath behavior change through store builds. A content-version switch must not become a hidden feature switch. [S07]

## 11. Privacy and moderation

Fill the field-level data map from actual code and network behavior, including SDKs. Map Apple and Google forms independently; their taxonomies are not identical. Religious practice may reveal sensitive beliefs. Frankfurt hosting does not answer every processor-location question. [S13-S15]

Default to minimal diagnostics. Disable session replay/autocapture and sensitive breadcrumbs until reviewed. Redact tokens, invitation codes, phone/email, content typed by users and private religious activity. Do not invent a "no data collected" claim while a backend or SDK sends identifiable data.

For any shared UGC, require a working moderation queue, responsible operator, report/block/remove/restrict flows and a published contact path. Test all visible user-controlled surfaces, including nicknames and group names. Reporting and moderation access need server authorization. [S33]

Age, geography, legal basis, consent and retention require owner/legal decisions before public launch. Keep the implementation capable of the chosen policy without claiming that a 13+ label alone establishes compliance.

## 12. Distribution and operations

Separate development, staging and production. Use synthetic test data. Keep signing material and service credentials outside source control, with least-privilege CI access.

Register stable package/bundle IDs and domains under the owner's control. Configure App Links using the distribution signing identity, not only a debug certificate. Verify installations from actual test tracks. [S35]

Collect release evidence from the final archive/AAB: dependency inventory, native library compatibility, merged permissions, privacy manifests/report, export-compliance decision, device results, content inventory and store forms.

Backups need a restore drill, deletion-aware restore procedure and documented responsibility. Monitor service health and crashes without recording private habit content. A content rollback must not masquerade as a store binary rollback; already installed faulty binaries need a forward fix.

Review credentials and Sabbath behavior must be fully disclosed. No reviewer detection, hidden bypass or unreviewed remote feature activation. See the submission worksheet for a fill-in template, not a claim of prior approval.

## 13. Definition of ready to submit

Every release gate in 04_RELEASE_GATES_AND_TEST_MATRIX_HE.md passes or has an explicit applicable exclusion with evidence. There are no unresolved critical security, account-separation, data-loss or core-flow defects. Both native distribution builds are tested; release metadata matches the actual binary.

"Ready to submit" is an engineering state. Store acceptance and absence of all future defects cannot be guaranteed.
