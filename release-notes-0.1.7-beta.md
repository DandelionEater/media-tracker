# Seenary 0.1.7 Beta

Tag: `v0.1.7-beta`

## Highlights

This update continues polishing Seenary's everyday experience with clearer anime details and more visible background activity.

## New and improved

- Anime detail pills are now color-coded for quicker scanning. Upcoming titles use red, currently airing titles use green, and finished titles use blue. Format, season, and episode information use their own separate violet, amber, and silver treatments so they do not compete with airing status colors.
- Anime formats now preserve familiar capitalization, including `TV` and `TV SHORT`.
- Anime details now request AniList's extra-large cover artwork. Covers remain compact on the details page and open no larger than their natural size in the artwork inspector, preserving more detail for deliberate zooming. Banners also open at their natural size instead of being stretched to fill the inspector.
- Successful automatic syncs now create both a toast and a notification naming the anime and the linked third-party service. Partial and failed automatic syncs also provide appropriate warning or error feedback instead of completing silently.
- Re-enabling the 18+ filter now immediately removes adult titles from already-loaded search, trending, Discover, and expanded shelf content. Opening a previously cached adult title shows a privacy-safe hidden state, and saved adult titles remain in My List with their title, artwork, notes, and recommendation metadata redacted while the filter is active.
- Searches with no matches now show a clear empty-results message with suggestions instead of silently returning to the home screen. Searches whose matches are all hidden by the 18+ filter explain that separately, and every search state is positioned safely below the navigation bar.
- Pressing Enter while the search field is focused now dismisses the search results and returns to the home content without clearing the query. Focusing the field again restores the retained search, while Delete continues to clear it explicitly.
- Navbar actions clicked with the mouse no longer retain focus and consume the next Enter press. Keyboard tab navigation remains unchanged, while Enter reliably returns to the global search shortcut after mouse navigation.
- Typing while search is unfocused now preserves the first typed character. Type-to-search focuses the field without selecting and replacing that initial input, while explicit Enter or mouse focus can still select an existing query for convenient replacement.
- Returning focus to a retained search now reruns the query with the current 18+ preference instead of restoring stale results. This makes switching the filter in either direction consistent without requiring the user to edit the query manually.

## Reliability and fixes

- Automatic sync feedback is emitted only after the background sync finishes, so notifications reflect the actual result rather than merely confirming that a change was queued.
- Adult-content metadata is now retained in anime details and local list caches. Existing list entries with older cached metadata are classified automatically so the 18+ filter can hide them without deleting personal progress.
