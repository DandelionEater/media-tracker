# Seenary 0.1.4 Beta

Tag: `v0.1.4-beta`

This beta focuses on desktop polish, safer update behavior, and a lightweight import function (experimental) for users who kept their anime list in plain text.

## Highlights

- Added launch-at-login support for the desktop app.
- Added text file import for simple notepad-style anime lists.
- Improved automatic desktop update checks.
- Replaced old Media Tracker naming with Seenary across user-facing surfaces.
- Refreshed app, installer, taskbar, and tray icon assets.

## Desktop

- Added a General settings toggle to launch Seenary when signing in to Windows.
- Added icon assets for the app window, tray, installer, Start menu, and taskbar.
- The tray icon now uses a dedicated small icon asset instead of the full app icon.

## Updates

- Seenary now schedules an update check shortly after startup.
- While the app is open, automatic update checks now repeat every three hours.

## Import

- Added `.txt` list import from Settings > Import & Data.
- Text import reads one anime title per meaningful line.
- Lines with progress such as `3/12` are imported with that progress.
- Lines without progress default to completed.
- Imports preview AniList matches before anything is written to the local list.
- Text import matching now slows down and retries around AniList rate limits.
**This feature is still experimental, so some issues are expected. Improvements and stability updates will continue in future releases.**

## Branding

- Replaced remaining Media Tracker references with Seenary.
- Renamed visible "tracker" copy to list-focused language.
- Migrated old local storage keys to the new `seenary.*` namespace while preserving saved UI state.
