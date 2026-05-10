# Seenary 0.1.3 Beta

Tag: `v0.1.3-beta`

This beta is a major MyAnimeList and sync update. MyAnimeList is now a full provider path alongside AniList, with import, push, pull, mapping recovery, and delete sync.

## Highlights

- Added full MyAnimeList OAuth login and account linking.
- Added MyAnimeList import preview with exact title selection.
- Added MyAnimeList push sync for local list edits.
- Added MyAnimeList pull sync to update local entries from the remote list.
- Added MyAnimeList token refresh, including retry-on-401 handling.
- Added MyAnimeList ID mapping and recovery for entries not originally imported from MAL.
- Added delete sync for AniList and MyAnimeList.
- Added provider-aware sync UI, activity labels, and unavailable states.

## MyAnimeList

- Users can log in with MyAnimeList from the auth screen.
- Existing local users can link or relink a MyAnimeList account from settings.
- MyAnimeList account conflicts can be resolved by transferring the link or merging local list data.
- MyAnimeList imports now preview grouped list entries before importing.
- Imported MAL entries preserve progress, score, notes, repeat count, start date, and finish date where available.
- MAL entries are matched to AniList media records for local library compatibility.
- MAL anime ID mappings are saved for future sync operations.
- Missing MAL mappings can be recovered during sync by searching and scoring MAL candidates.

## Sync

- Sync controls now adapt to the linked provider: AniList, MyAnimeList, or unavailable when no provider is linked.
- Local edits queue provider-specific push jobs.
- Manual sync and automatic sync work for MyAnimeList.
- Pull/update from remote works for both AniList and MyAnimeList.
- Sync activity now shows readable operation labels and provider pills.
- Failed MAL requests caused by expired tokens refresh once and retry automatically.
- Pending local create jobs are cancelled if the user deletes the entry before it is pushed.
- Pending update jobs are converted into delete jobs when a synced entry is removed.
- Re-adding an entry cancels pending delete jobs and queues a fresh upsert.

## Delete Sync

- Removing a single entry locally can remove it from the linked AniList or MyAnimeList account.
- Clearing the local list queues remote deletes for each existing synced entry.
- Remote delete jobs are treated as successful when the remote entry is already gone.
- Delete sync uses stored mappings first and MAL mapping recovery when needed.

## Anime Details

- Related anime and recommendations are now interactive inside Seenary.
- Navigating from one details page to another keeps detail-page history.
- The Back button returns through that details history before leaving the details view.
