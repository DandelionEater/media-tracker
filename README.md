<div align="center">
  <img src="icons/1024x1024.png" alt="Seenary icon" width="128" />

  # Seenary

  **A focused home for tracking, discovering, and enjoying Anime and Manga.**

  [Open Seenary on the web](https://web.seenary.app) ·
  [Download Seenary](https://github.com/DandelionEater/Seenary/releases) ·
  [Report an issue](https://github.com/DandelionEater/Seenary/issues)

  ![Latest release](https://img.shields.io/github/v/release/DandelionEater/Seenary?include_prereleases&label=release)
  ![Linux release build](https://github.com/DandelionEater/Seenary/actions/workflows/linux-test-build.yml/badge.svg)
  ![Windows](https://img.shields.io/badge/Windows-x64-5b8def)
  ![Linux](https://img.shields.io/badge/Linux-x64-f2b84b)
</div>

> [!NOTE]
> Seenary is currently in beta. Back up important library data and report anything that does
> not behave as expected.

## What is Seenary?

Seenary is a personal Anime and Manga tracker available on the web and as a desktop overlay for
Windows and Linux. It combines local-first library management with discovery, detailed media
information, provider synchronization, portable backups, and an interface designed to stay useful
without taking over the desktop.

The hosted Seenary API provides accounts, metadata, imports, and provider integration. Personal
library state remains responsive in local browser storage and can be synchronized with one linked
AniList or MyAnimeList account.

## Highlights

- **Anime and Manga libraries** — statuses, progress, scores, notes, dates, favourites, rewatches,
  rereads, chapters, and volumes.
- **Personal and discovery views** — trends, recommendations, recent activity, configurable
  shelves, multiple layouts, filters, sorting, and density controls.
- **Broader search** — find titles, characters, studios, theme songs, and artists in one search.
- **Rich details** — relations, characters, staff, studios, tags, streaming links, trailers,
  artwork inspection, and opening or ending music previews.
- **AniList and MyAnimeList integration** — import public lists, link an account, pull changes,
  and manually or automatically synchronize a chosen provider.
- **Flexible imports and backups** — import AniList, MyAnimeList, text, or PDF lists and move
  versioned backups between the web, Windows, and Linux.
- **Desktop integration** — a transparent frameless overlay, tray controls, remembered window
  sizes, launch at login, configurable shortcuts, and custom Windows installation and removal.
- **Linux-aware behavior** — AppImage, Flatpak, and archive builds with X11, Xwayland, and native
  Wayland fallbacks.

## Download and use

### Web

Open [web.seenary.app](https://web.seenary.app) in a modern browser.

### Windows

Download the latest `Seenary.Setup.<version>.exe` from
[GitHub Releases](https://github.com/DandelionEater/Seenary/releases). The installer supports
per-user and shared-computer installation and includes Seenary's custom uninstaller.

### Linux

Linux x64 releases provide:

- **AppImage** for a portable single-file application.
- **Flatpak bundle** for a sandboxed installed application.
- **Compressed archive** as a permission-preserving fallback.

Download the format you prefer from
[GitHub Releases](https://github.com/DandelionEater/Seenary/releases). The first Linux beta uses
manual application updates; AppImage updating and repository-backed Flatpak updates are planned.

## Data and connected services

Seenary uses:

- [AniList](https://anilist.co) for Anime and Manga metadata, characters, staff, studios,
  relations, discovery, and optional account synchronization.
- [MyAnimeList](https://myanimelist.net) for optional list imports and account synchronization.
- [AnimeThemes](https://animethemes.moe) for opening and ending metadata, artist credits, and
  available audio previews.

Provider accounts are optional. Exported Seenary backups do not include login sessions, OAuth
tokens, service credentials, or disposable caches. OAuth tokens stored by the hosted service are
encrypted at rest.

## How it fits together

| Area | Technology | Responsibility |
| --- | --- | --- |
| Web interface | React, TypeScript, Vite | Navigation, local-first lists, discovery, settings, and synchronization UX |
| Desktop clients | Electron | Windows/Linux shell, tray, window behavior, startup, shortcuts, and updates |
| Hosted API | Node.js, HTTP JSON-RPC | Accounts, sessions, provider OAuth, imports, metadata, and synchronization |
| Data | SQLite and IndexedDB | Hosted account/provider state plus responsive per-device library storage |
| Packaging | Electron Builder, GitHub Actions | Windows installer and Linux AppImage, Flatpak, and archive releases |

## Development

### Requirements

- Node.js 24
- npm
- Provider application credentials for OAuth development
- Platform build tools when producing native installers

### Install dependencies

```bash
git clone https://github.com/DandelionEater/Seenary.git
cd Seenary
npm ci --prefix backend
npm ci --prefix frontend
```

Copy `backend/.env.example` to `backend/.env`, then provide at least:

```dotenv
ANILIST_CLIENT_ID=
ANILIST_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=
```

Generate a local encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep that key private and stable for any database containing encrypted provider tokens.

### Run the web client and API

Start the API:

```bash
npm start --prefix backend
```

In another terminal, start Vite:

```bash
npm run dev --prefix frontend
```

The development frontend runs at `http://localhost:5173` and uses
`http://localhost:3000` by default. Set `VITE_API_BASE_URL` to use another API.

### Run the Electron development client

Keep the Vite development server running, then use:

```bash
npm run desktop --prefix backend
```

### Validate changes

Frontend checks:

```bash
npm run lint --prefix frontend
npm run build --prefix frontend
```

Backend security smoke test:

```bash
npm run security:check --prefix backend
```

Full release-readiness pass:

```bash
npm run release:check --prefix backend
```

The full pass validates version alignment, packaging inputs, syntax, frontend lint and build,
fresh and legacy database migrations, authentication and encryption behavior, backup restoration,
security controls, and patch integrity. It does not replace hands-on release testing.

## Building packages

From `backend/`:

```bash
npm run dist
```

builds the Windows release on Windows, while:

```bash
npm run dist:linux
```

builds Linux artifacts on Linux. Linux release artifacts are also built and attached by GitHub
Actions.

## Project status and contributions

Seenary is an actively developed personal project. Bug reports, reproducible compatibility
details, and focused suggestions are welcome through
[GitHub Issues](https://github.com/DandelionEater/Seenary/issues).

Before proposing a large change, open an issue so its fit, platform impact, data migration, and
maintenance cost can be discussed first.

