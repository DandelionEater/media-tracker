# Seenary 0.1.8 Beta

Tag: `v0.1.8-beta`

## New and improved

This update turns Seenary's search into a broader discovery tool, brings opening and ending music into Anime details, introduces the first full Linux beta, and completes the custom Windows install and removal experience.

## Search and discovery

- Search can now run several ideas together instead of forcing every query into one title. A search for different titles, characters, studios, songs, or artists can live in the same search bar and produce one organized set of results.
- Chosen terms become compact chips that show how Seenary understood them. Every chip can be edited or removed independently, and the unfinished text remains ready for another term.
- When a term could mean more than one thing, Seenary offers clear interpretations such as **Anime + Manga**, **Character only**, **Studio only**, **Song only**, or **Artist only**. Users can accept the highlighted choice with Tab, Right Arrow, or a click and use Up or Down to choose another.
- The search field now explains its wider scope with a new titles, characters, studios, and music prompt. Once a term has been accepted, the prompt changes to **Add another** instead of pretending the search is finished.
- Search results are arranged into dedicated Anime, Manga, Character, Studio, Theme song, and Artist sections. Each section keeps its own count and presentation so a character portrait cannot be mistaken for an Anime cover or a song for a title.
- Loading, empty, filtered, and partly unavailable states now account for every supported result type. Seenary can explain when nothing matched, when the 18+ preference hid every match, or when only part of the search could be completed.
- Character matches show the character portrait and preferred name beside the Anime or Manga that caused the match. Each card clearly labels both the character and its destination before opening the related title.
- Character discovery follows the saved title-language preference and the existing 18+ preference. Related adult titles stay hidden without preventing safe character results from appearing.
- Studio matches explain whether the studio was the main animation studio or contributed in another role. Cards open the credited Anime directly instead of leaving users to repeat the title search.
- A matching studio can now open a complete studio catalogue with continuous loading. Catalogue titles retain Seenary's normal tracked status, quick-add, edit, title-language, and adult-content behavior.
- Animation studios listed on Anime details are now clickable. Users can move from a title to the studio's wider catalogue and return to the same details or search context afterward.
- Theme songs now appear in search with their opening or ending label, sequence number, credited artists, related Anime, and available preview.
- Song cards include a 20-second preview with visible loading, play, pause, and progress states. Starting another preview stops the previous one, preventing several songs from playing over each other.
- Preview volume is remembered and shared between search, artist catalogues, and Anime details. Users can adjust it once instead of correcting every song separately.
- Artist search understands performer names, alternate names, group credits, and credited group members. The result explains both the matched artist and the song credit that connected them to an Anime.
- Artists now have dedicated catalogues containing their opening and ending performances. Catalogues load additional results as needed, retain preview controls, and provide their own remembered volume control.
- Anime details now include a dedicated **Openings and endings** section below Staff. It lists song titles, artists, OP or ED sequence numbers, and available previews without requiring a separate search.

## Library and everyday improvements

- **Recently Updated** now reflects meaningful activity from both Seenary and connected AniList or MyAnimeList libraries. A title changed on a connected service can appear beside one edited directly in Seenary.
- Recent activity focuses on the last seven days so an old import does not permanently fill the Personal page. Anime and Manga keep their own activity shelves.
- My List's recent-activity filters and card timestamps now use the latest Seenary or connected-service change, giving imported and synchronized titles a more accurate place in activity-based browsing.
- Manga's **Since You Liked** recommendations now use the same paired presentation as Anime, showing the Manga that inspired a suggestion beside what Seenary recommends reading next.
- Anime and Manga recommendation cards are more compact and easier to compare, with clearer **You liked** and **Try next** sides, media-appropriate icons, useful score or format details, and shorter summaries.
- Personal-page wording is now consistently media-aware, including distinct **Anime overview**, **Manga overview**, next-watch, and next-read language.
- Settings now shows the desktop platform, architecture, Linux desktop environment, and active display system. This makes it easier to confirm exactly which desktop build and display setup are running.
- A new **Copy app & system information** action prepares useful diagnostic details without asking users to find them manually. A nearby **Report on GitHub** link opens the correct issue page.

## Windows desktop

- Seenary now has a complete custom Windows uninstaller matching the installer's borderless dark interface, artwork, typography, rounded surfaces, and violet visual language.
- Removing Seenary preserves the local library, settings, and sign-ins by default, making a later reinstall feel familiar instead of starting from nothing.
- Users who want a complete removal can uncheck **Keep my Seenary data**. Seenary clearly warns that the local data will be permanently deleted and asks for confirmation before continuing.
- Dedicated uninstalling, success, and failure screens explain what is happening without falling back to a stock setup wizard.
- Personal and shared-computer installations are both supported, including the administrator approval Windows may require for a shared installation.
- App files, shortcuts, the Windows installed-apps listing, update handoffs, and final cleanup continue to be handled automatically.
- Silent application updates remain silent and can preserve the current installation while replacing it, so the custom interface does not interrupt normal Seenary updates.
- Secondary desktop windows now use the Seenary icon consistently instead of inheriting a generic Electron window icon.

## Linux beta

- Seenary is now available as a Linux desktop beta after hands-on testing under both X11 and native Wayland.
- The frameless transparent Seenary window, rounded outer area, shadows, dragging, and manual edge or corner resizing adapt to both display systems.
- Saved window sizes return across restarts. Native Wayland leaves final placement to the compositor, avoiding unreliable coordinates or windows reopening off-screen.
- Compact, Balanced, Cinematic, and custom window sizes remain available, with honest behavior when a Wayland compositor controls the final dimensions.
- Tray controls provide Show/Hide, Gaming mode, and Exit actions. Launching Seenary again reveals the existing window instead of opening a duplicate.
- External links and AniList or MyAnimeList authorization open through the default Linux browser.
- Linux display detection distinguishes native Wayland from X11 or Xwayland and shows the active desktop environment in Settings.
- Fractional scaling, transparent edges, and resize areas have been checked on real Linux hardware rather than only through a Windows-built test package.
- Linux packages are built directly on Linux for dependable installation and compatibility.
- The release provides Flatpak, AppImage, and compressed archive choices so users can choose an installed, portable, or fallback format.
- Flatpak provides an installed, sandboxed experience; AppImage provides one portable executable; and the archive offers a permission-preserving fallback when AppImage or FUSE is unavailable.
- The same **Launch Seenary at login** setting used on Windows works across all three Linux formats. Login startup opens Seenary quietly in the tray instead of covering the desktop.
- Disabling launch at login removes Seenary's own startup entry without changing other applications.
- Global hide/show shortcuts are available under X11 and Xwayland. Native Wayland does not offer them in this release because support varies between desktop environments.
- Automatic application updates remain disabled in this first Linux beta. Linux users should download the next package manually from the Seenary website or release page.
- The Linux download page provides the three formats together with short explanations, allowing users to choose without already knowing Linux package terminology.

## Reliability and fixes

- Theme music loads separately from the ordinary Anime details, so Anime information remains available even when music information takes longer to arrive or is temporarily unavailable.
- Search remains useful when one of its information services is temporarily unavailable. Available results still appear with a clear warning about anything that could not be loaded.
- Search results are reused during the session, making edits, restored searches, and repeated terms feel immediate without changing the visible results.

## Data and services

- Anime and Manga metadata, characters, studios, and relations are provided through AniList.
- Opening and ending metadata, artist credits, and audio previews are provided through AnimeThemes.
- Preview availability depends on the media exposed by AnimeThemes and may vary by title.
