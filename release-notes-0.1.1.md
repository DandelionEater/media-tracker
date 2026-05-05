# Seenary 0.1.1

This beta update focuses on making the live app feel complete and dependable: AniList is back online for hosted web users, sessions are more persistent, and the desktop app can start receiving future updates.

## Highlights

- Re-enabled AniList login and account linking in the live web app.
- Added hosted AniList OAuth callback support.
- Added persistent web sessions so users are not logged out after backend restarts.
- Added session expiry warnings at 3 days, 1 day, 12 hours, and 1 hour before expiry.
- Added desktop auto-update support with update checks on launch and periodic background scans.
- Added a tray action to manually check for updates.
- Fixed the toast ring animation so it continues smoothly until the toast disappears.

## AniList

- `Continue with AniList` now works in the hosted web build.
- `Link AniList` and `Relink AniList` are enabled for live users.
- Existing account conflict handling is available on web, including transfer and merge actions.
- Authenticated AniList imports now run after login or linking.

## Auth & Sessions

- Web sessions are stored persistently instead of only in server memory.
- Authenticated activity refreshes the session window.
- Passive session checks can report expiry without extending the session.
- Users are notified when their session is getting close to expiry.

## Desktop Updates

- Added update metadata support for Windows installer builds.
- Added automatic update checks on app launch and every 6 hours.
- Added user confirmation before downloading an update.
- Added user confirmation before restarting to install an update.

## Fixes

- Fixed the toast loading ring animation stopping early.
- Added support for serving desktop update files.