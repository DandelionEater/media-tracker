# Seenary 0.1.5 Beta

Tag: `v0.1.5-beta`

This beta is a big data-saving and import update. Seenary now keeps your personal list data on your own device/browser, while still letting linked AniList and MyAnimeList accounts handle imports and sync.

This summary focuses on the larger user-facing changes since 0.1.4-beta.

## Highlights

- Moved list saving to local, per-user device/browser storage.
- Kept AniList and MyAnimeList sync available with the new local-first list system.
- Added PDF list import for text-based PDF files.
- Added MyAnimeList import preview and import support.
- Made text and PDF import matching much faster.
- Added safer migration for existing saved lists.
- Added local backup export and import for moving data between devices.
- Improved date and time formatting to better match the user's system settings.

## Data Saving

- List entries are now saved locally on your device/browser.
- Local list data is separated by Seenary account, so different users on the same browser do not share the same saved list.
- Early local data is migrated automatically.
- Existing saved lists are moved to local saving the first time they are loaded.
- Anime details and list snapshots are kept locally where possible.
- Users can export a Seenary backup file and import it on another device or browser profile.

## Sync

- AniList and MyAnimeList sync now works with locally saved lists.
- Local changes are saved first, then pushed to the linked external account when sync runs.
- Removing an anime from the local list can now sync the removal to the linked service.
- Sync status now shows local pending changes.
- Sync activity now shows pending, completed, and failed sync items.
- "Update from AniList" and "Update from MyAnimeList" now pull remote list data back into the local list.

## Import

- Added PDF import for PDFs that contain selectable/readable text.
- PDF import extracts likely anime title lines, matches them through AniList, and shows a preview before importing.
- Added MyAnimeList import preview and import for linked MyAnimeList accounts.
- Text and PDF matching now checks multiple titles at once instead of waiting after every single line.
- Repeated titles in the same import are matched only once, making larger imports faster.
- Import results still show a preview so users can choose exactly what gets added.

## Accounts

- AniList and MyAnimeList account linking still works with the new local-first list system.
- Linked accounts are used for authenticated imports and sync.
- If an external account is already linked to another local profile, Seenary still helps resolve the conflict.

## Desktop

- Date and time display now better follows the user's system and regional format.
- Windows regional date and time preferences are now detected more accurately.
- Desktop settings and update-related UI received additional polish.

## Notes

- Local-first saving means list data is tied to the device/browser where it is saved.
- Users should sync with AniList or MyAnimeList if they want an external backup of their list.
- Users can also export a backup file from Import & Data and import it later if they switch devices.
- PDF import is still experimental. It works best with text-based PDFs, not scanned image PDFs.
