# Seenary 0.1.10 Beta

Tag: `v0.1.10-beta`

## New and improved

This update focuses on fixing some annoying app behavior and improving the overall speed and clarity of information loading throughout Seenary.

- Anime details now appear before franchise-history calculations finish, making detail pages feel much faster.
- The franchise-age card displays **Calculating...** while Seenary traces the full prequel history, then updates automatically with the completed result.
- Completed Anime and Manga details are cached and reused, reducing repeated AniList requests and making previously visited pages open faster.
- App startup no longer waits for background list-metadata work before showing the main interface.
- Linux installations now check GitHub for new Seenary releases and show the update window with a **Manual download** action that opens the Seenary website.

## Reliability and fixes

- Fixed Seasonal Picks becoming permanently stuck on **Loading more** in the live app. Failed requests now stop cleanly and offer a visible retry action.
- Fixed the first search after launching Seenary occasionally behaving like a ghost search and requiring extra Enter presses.
- Added sensible request time limits so information loading and account authorization cannot remain stuck indefinitely without feedback.
- Reduced unnecessary duplicate startup and AniList requests.
- Franchise age is no longer estimated from the current Anime's start date. Seenary shows **Calculating...** until traversal finishes and **Unavailable** if an accurate result cannot be produced.
- Previously cached details remain available when AniList is temporarily unreachable.
