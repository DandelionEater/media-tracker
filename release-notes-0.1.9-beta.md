# Seenary 0.1.9 Beta

Tag: `v0.1.9-beta`

## New and improved

This update makes Seenary more dependable when AniList is unavailable, moves Windows desktop updates to GitHub Releases, automates release building, and gives the installer, uninstaller, update dialog, media details, and list editor a broad visual polish.

## Desktop updates and releases

- Windows updates are now discovered and downloaded directly from Seenary's GitHub Releases instead of relying on the Hostinger update database.
- Beta builds continue to receive beta releases, while update checks remain automatic on startup and at regular intervals.
- The desktop update dialog is wider and more spacious, with a larger header, roomier changelog, clearer actions, and responsive scrolling only when the app window is too small.
- A safe update-dialog preview command is available for checking the real interface without downloading or installing anything.
- Pushing or merging a new version into `main` can now build the Windows and Linux release assets automatically and publish them together in a new GitHub release.
- The automated release flow avoids rebuilding an already-published version and keeps the Git tag, release version, notes, metadata, and downloadable assets aligned.
- A one-command versioning helper updates the release version consistently before publishing.
- Release-readiness checks now validate the GitHub updater configuration and its generated metadata before a release is shipped.
- Linux's separate test-build workflow no longer duplicates builds when a GitHub release is published.
- Desktop development startup now detects an incompatible `better-sqlite3` native build and rebuilds only that module for Electron when necessary, avoiding the startup crash caused by mismatched Node module versions.

## Windows installer and uninstaller

- The install action and Windows approval note stay anchored at the bottom of the installer, so expanding or hiding Options no longer shifts the primary action.
- The installer's feature card is vertically centered across the full window and appears only on the opening page instead of leaking into progress, success, or failure states.
- Installer and uninstaller close buttons are anchored to the actual top-right window corner rather than the padded content area.
- The installing progress bar is wider, thicker, and aligned with the installation heading and description.
- Closing the installer during installation now opens a custom Seenary-styled confirmation instead of abandoning only the visible window.
- Confirming cancellation stops the underlying installer process, shows a brief cancellation state, and closes cleanly without presenting cancellation as an installation failure.
- Alt+F4 follows the same safe confirmation behavior while installation is in progress.
- The uninstaller's library-preservation card is vertically centered across the full window.
- **Uninstall Seenary** and **Cancel** now share the same height, while color and emphasis continue to distinguish the primary and secondary actions.

## Media details and offline resilience

- Anime and Manga details continue using fresh cached information when available.
- When AniList is temporarily unavailable, Seenary can now fall back to complete, previously cached Anime or Manga details even after the normal freshness window has expired.
- Cached details remain stored in Seenary's local database, allowing already-visited media pages to remain useful during an AniList outage.
- Discover-page caching remains unchanged.
- The description area on media details pages now fills the available card height instead of leaving a large unused space beside Genres and Tags.

## List editing and interface polish

- The Edit List Entry dialog grows naturally to fit its content and uses an internal vertical scrollbar only when the available app height requires one.
- The unexplained horizontal scrollbar in Edit List Entry has been removed.
- Information tooltips are rendered above modal boundaries, so progress controls no longer clip their labels.
- Tooltips preserve their intended position whenever space allows and move inward only when needed to remain inside the overall app viewport.
- Dropped Anime and Manga statistics now use a broken-heart icon instead of the standard heart used for positive favorites.
- Browser visits to `web.seenary.app` now redirect to `seenary.app`, while the Electron desktop renderer continues loading normally from its dedicated address.

## Reliability and fixes

- The release guide now documents GitHub Releases as the source of desktop updates and reflects the automated Windows and Linux publishing workflow.
- The guide includes the one-time transition path from the previous Hostinger update feed, plus updated readiness, deployment, upgrade, and clean-install checks.
- Updater configuration has a dedicated smoke test so an accidental return to the retired generic feed is caught before release.

## Privacy-first engagement analytics

- Seenary now asks clearly before sharing any anonymous usage statistics; sharing remains off unless the user chooses to enable it.
- Meaningful activity requires a real interaction and 15 seconds of visible, focused app use. Background launches, updates, synchronization, and ordinary API traffic never count.
- At most one record is accepted per account and UTC day, containing only the server date, operating-system platform, and Seenary version.
- Daily deduplication uses a server-derived pseudonymous key that rotates every month. IP addresses, media libraries, titles, searches, providers, browsing history, hardware identifiers, and fingerprints are excluded.
- The same exact privacy details and an immediate **Share anonymous usage statistics** toggle are available in Settings and Seenary's privacy information.
- Private server tools can export aggregate DAU, MAU, DAU/MAU, rolling 14-day observed active accounts, active-day ranges, platform share, and version adoption without exposing a public analytics endpoint.
- Administrators can view those aggregate reports at the protected `/reports` dashboard and download each CSV directly without creating report files on the hosting filesystem.
- The dashboard places active registered accounts from the past 14 days beside the complete count of all current registered accounts for broader context.
- Finalized monthly totals are retained while pseudonymous daily rows are pruned after a documented 45-day correction window.
