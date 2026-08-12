# Seenary privacy information

## Anonymous usage statistics

Sharing anonymous usage statistics is optional and off until you make an explicit choice.
You can change that choice at any time in **Settings → General → Privacy and anonymous
statistics**. Turning sharing off stops new records immediately and does not affect normal
Seenary features.

When sharing is enabled, Seenary waits until the app is visible, focused, has received a
real keyboard or pointer interaction, and has remained in meaningful foreground use for at
least 15 seconds. It then sends at most one activity record for that account and UTC day.
Background launch-at-login, updater checks, provider synchronization, scheduled work, and
ordinary API traffic do not count.

Each daily record contains exactly:

- The server's UTC activity date.
- The operating-system platform: Windows, Linux, macOS, or web.
- The Seenary app version.

The server derives a month-scoped pseudonymous account key with a server-held HMAC secret.
The key changes each month and is stored only to deduplicate daily records and calculate
within-month totals. The client does not create or send this key.

Seenary does not collect or store analytics containing IP addresses or IP hashes, account
names, Anime or Manga titles, library contents, progress, searches, viewed pages, browsing
history, AniList or MyAnimeList activity, device or advertising identifiers, hardware
details, or an installation fingerprint.

Analytics daily rows are stored separately from account and library data. Finalized monthly
reports contain only aggregate totals such as daily and monthly active users, active-day
ranges, rolling 14-day observed active accounts, platform share, and version adoption.
When a rolling window crosses a month boundary, the server reconciles the two rotating
keys in memory against registered account IDs; it does not save a permanent analytics
identifier. Because sharing is optional, this metric counts participating accounts observed
as active and cannot include people who opted out. The report separately shows the complete
count of all current registered accounts, including inactive and opted-out accounts; that count
comes from ordinary account registration data rather than engagement tracking. Pseudonymous
daily rows are deleted after
their finalized month passes a 45-day correction window. Analytics exports are available
only through an administrator-authenticated reporting page and private server tools. Seenary
exposes no public analytics reporting endpoint.
