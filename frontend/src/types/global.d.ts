import type {
  AnimeMedia,
  DiscoverShelfResult,
  ImportPayload,
  ImportPreviewItem,
  MediaSearchResults,
  MediaType,
  PersonDetails,
  SearchAnime,
  SeenaryBackup,
  TrackedAnimeEntry,
  TrackedMangaEntry,
} from "./domain";

export {};

type AuthUser = {
  id: number;
  username: string;
  username_normalized: string;
  tutorial_dismissed: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

type AuthResponse = {
  ok: boolean;
  message: string;
  user?: AuthUser;
};

type SessionResponse = {
  authenticated: boolean;
  user: AuthUser | null;
  expiresAt?: number;
};

type AniListLinkedAccount = {
  anilistUserId: number;
  anilistUsername: string;
  originalAniListUsername: string;
  lastImportAt: string | null;
  updatedAt: string;
};

type MalLinkedAccount = {
  malUserId: number;
  malUsername: string;
  originalMalUsername: string;
  lastImportAt: string | null;
  updatedAt: string;
};

type AppSettings = {
  themeAccent: "violet" | "rose" | "amber" | "emerald" | "custom";
  customAccentColor: string;
  titleLanguage: "userPreferred" | "english" | "romaji" | "native";
  showTrendingCarousel: boolean;
  autoRotateTrending: boolean;
  autoScrollHomeShelves: boolean;
  hideAdultContent: boolean;
  overlayOpacity: number;
  overlayBackground: "solid" | "glass" | "transparent";
  backgroundDim: number;
  animationLevel: "full" | "reduced" | "off";
  compactMode: boolean;
  discoverDensity: "comfortable" | "balanced" | "compact";
  homeDensity: "comfortable" | "balanced" | "compact";
  myListDensity: "comfortable" | "balanced" | "compact";
  startView: "home" | "list" | "search";
};

type SyncActivityItem = {
  id: number;
  user_id?: number;
  anime_id?: number | null;
  manga_id?: number | null;
  media_type?: "ANIME" | "MANGA";
  animeTitle?: string | null;
  anime_title?: string | null;
  operation: string;
  status: string;
  attempts?: number;
  last_error?: string | null;
  next_attempt_at?: string | null;
  created_at: string;
  updated_at?: string;
  message?: string | null;
  changedFields?: Array<{
    field: string;
    from: unknown;
    to: unknown;
  }>;
};

type SyncProgressEvent = {
  operation: "manual-sync" | "pull-anilist" | "pull-mal";
  stage: "fetching" | "mapping" | "saving" | "processing" | "complete" | "failed";
  label: string;
  current?: number | null;
  total?: number | null;
  updatedAt?: string;
};

declare global {
  type AutoSyncCompleteEvent = {
    ok: boolean;
    message: string;
    synced?: number;
    failed?: number;
    pending?: number;
    syncedItems?: Array<{ animeTitle?: string | null; provider?: string | null }>;
    activity?: Array<{
      animeTitle?: string | null;
      anime_title?: string | null;
      operation?: string;
      status?: string;
    }>;
  };
}

type DesktopUpdateInfo = {
  version: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string | null;
};

declare global {
  const __APP_VERSION__: string;

  interface Window {
    api: {
      searchMedia: (
        query: string,
        hideAdultContent?: boolean
      ) => Promise<MediaSearchResults>;
      searchAnime: (query: string, hideAdultContent?: boolean) => Promise<SearchAnime[]>;
      getTrendingAnime: (hideAdultContent?: boolean) => Promise<unknown>;
      getDiscoverAnime: (hideAdultContent?: boolean) => Promise<unknown>;
      getDiscoverShelfAnime: (
        shelfId: string,
        page?: number,
        hideAdultContent?: boolean
      ) => Promise<DiscoverShelfResult>;
      previewAniListImport: (username: string) => Promise<{
        ok: boolean;
        message?: string;
        username?: string;
        preview?: {
          totalFound: number;
          groups: Array<{
            status: string;
            mediaType?: "ANIME" | "MANGA";
            items: ImportPreviewItem[];
          }>;
        };
      }>;
      importAniList: (
        username: string,
        selectedStatuses?: string[],
        selectedMediaKeys?: string[],
        options?: { signal?: AbortSignal }
      ) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        message: string;
        summary?: {
          sourceUsername: string;
          totalFound: number;
          selectedStatuses: string[];
          selectedAnimeIds: number[];
          imported: number;
          created: number;
          updated: number;
          skipped: number;
          mappingFailures?: Array<{
            malAnimeId?: number | null;
            malMangaId?: number | null;
            mediaType?: "ANIME" | "MANGA";
            title?: string | null;
            reason?: string | null;
            message?: string | null;
          }>;
        };
      }>;
      previewMalImport: (username: string) => Promise<{
        ok: boolean;
        message?: string;
        username?: string;
        preview?: {
          totalFound: number;
          skipped?: number;
          groups: Array<{
            status: string;
            mediaType?: "ANIME" | "MANGA";
            items: ImportPreviewItem[];
          }>;
        };
      }>;
      importMal: (
        username: string,
        selectedStatuses?: string[],
        selectedMediaKeys?: string[],
        options?: { signal?: AbortSignal }
      ) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        message: string;
        summary?: {
          sourceUsername: string;
          totalFound: number;
          selectedStatuses: string[];
          selectedAnimeIds: number[];
          imported: number;
          created: number;
          updated: number;
          skipped: number;
          mapped?: number;
          unmapped?: number;
          mappingFailures?: Array<{
            malAnimeId?: number | null;
            malMangaId?: number | null;
            mediaType?: "ANIME" | "MANGA";
            title?: string | null;
            reason?: string | null;
            message?: string | null;
          }>;
        };
      }>;
      previewTextImport: (text: string, hideAdultContent?: boolean, options?: { signal?: AbortSignal }) => Promise<{
        ok: boolean;
        message?: string;
        preview?: {
          totalFound: number;
          unmatched?: string[];
          groups: Array<{
            status: string;
            items: Array<{
              animeId: number;
              status: string;
              progress: number;
              score: number | null;
              notes: string | null;
              title: {
                romaji?: string | null;
                english?: string | null;
                native?: string | null;
                userPreferred?: string | null;
              };
              coverImage?: {
                large?: string | null;
              };
              episodes?: number | null;
              format?: string | null;
              season?: string | null;
              seasonYear?: number | null;
              sourceTitle?: string;
              guessed?: boolean;
              guessedFrom?: string | null;
              interpretedTitle?: string | null;
              media?: AnimeMedia;
            }>;
          }>;
        };
      }>;
      previewPdfImport: (pdfBase64: string, hideAdultContent?: boolean, options?: { signal?: AbortSignal }) => Promise<{
        ok: boolean;
        message?: string;
        preview?: {
          totalFound: number;
          unmatched?: string[];
          groups: Array<{
            status: string;
            items: Array<{
              animeId: number;
              status: string;
              progress: number;
              score: number | null;
              notes: string | null;
              title: {
                romaji?: string | null;
                english?: string | null;
                native?: string | null;
                userPreferred?: string | null;
              };
              coverImage?: {
                large?: string | null;
              };
              episodes?: number | null;
              format?: string | null;
              season?: string | null;
              seasonYear?: number | null;
              sourceTitle?: string;
              guessed?: boolean;
              guessedFrom?: string | null;
              interpretedTitle?: string | null;
              media?: AnimeMedia;
            }>;
          }>;
        };
      }>;
      importTextList: (
        entries: ImportPreviewItem[],
        selectedAnimeIds?: number[],
        options?: { signal?: AbortSignal }
      ) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        message: string;
        summary?: {
          sourceUsername: string;
          totalFound: number;
          selectedStatuses: string[];
          selectedAnimeIds: number[];
          imported: number;
          created: number;
          updated: number;
          skipped: number;
        };
      }>;
      getSettings: () => Promise<AppSettings>;
      updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      getSyncStatus: () => Promise<{
        ok: boolean;
        message?: string;
        linked?: boolean;
        provider?: "anilist" | "mal" | null;
        providerLabel?: string | null;
        syncTargetsLabel?: string | null;
        autoSyncEnabled?: boolean;
        pendingCount?: number;
      }>;
      setAutoSync: (enabled: boolean) => Promise<{
        ok: boolean;
        message?: string;
        linked?: boolean;
        provider?: "anilist" | "mal" | null;
        providerLabel?: string | null;
        syncTargetsLabel?: string | null;
        autoSyncEnabled?: boolean;
        pendingCount?: number;
      }>;
      runSyncNow: () => Promise<{
        ok: boolean;
        message: string;
        synced?: number;
        failed?: number;
        pending?: number;
      }>;
      pullFromAniList: () => Promise<ImportPayload & {
        ok: boolean;
        partial?: boolean;
        message: string;
        summary?: {
          sourceUsername: string;
          totalFound: number;
          selectedStatuses: string[];
          selectedAnimeIds: number[];
          imported: number;
          created: number;
          updated: number;
          skipped: number;
        };
      }>;
      pullFromMal: () => Promise<ImportPayload & {
        ok: boolean;
        partial?: boolean;
        message: string;
        summary?: {
          sourceUsername: string;
          totalFound: number;
          selectedStatuses: string[];
          selectedAnimeIds: number[];
          imported: number;
          created: number;
          updated: number;
          skipped: number;
          mapped?: number;
          unmapped?: number;
        };
      }>;
      onSyncProgress: (callback: (progress: SyncProgressEvent) => void) => () => void;
      onAutoSyncComplete: (callback: (result: AutoSyncCompleteEvent) => void) => () => void;
      getSyncActivity: () => Promise<{
        ok: boolean;
        message?: string;
        pending?: SyncActivityItem[];
        completed?: SyncActivityItem[];
        failed?: SyncActivityItem[];
        pulled?: SyncActivityItem[];
      }>;
      onFocusSearch: (callback: () => void) => void;
      getAnimeDetails: (id: number) => Promise<AnimeMedia>;
      getMediaDetails: (mediaType: MediaType, id: number) => Promise<AnimeMedia>;
      getCharacterDetails: (id: number) => Promise<PersonDetails>;
      getStaffDetails: (id: number) => Promise<PersonDetails>;
      cacheMinimalAnime: (media: AnimeMedia) => Promise<{ ok: boolean; message?: string }>;

      register: (username: string, password: string) => Promise<AuthResponse>;
      login: (username: string, password: string) => Promise<AuthResponse>;
      startAniListLogin: () => Promise<
        AuthResponse & {
          needsProfile?: boolean;
          anilist?: {
            id: number;
            username: string;
          };
          suggestedUsername?: string;
          import?: {
            ok: boolean;
            message: string;
          };
        }
      >;
      completeAniListLogin: (username: string) => Promise<
        AuthResponse & {
          import?: {
            ok: boolean;
            message: string;
          };
        }
      >;
      startMalLogin: () => Promise<
        AuthResponse & {
          needsProfile?: boolean;
          mal?: {
            id: number;
            username: string;
          };
          suggestedUsername?: string;
          import?: {
            ok: boolean;
            message: string;
          };
        }
      >;
      completeMalLogin: (username: string) => Promise<
        AuthResponse & {
          import?: {
            ok: boolean;
            message: string;
          };
        }
      >;
      getAniListLinkStatus: () => Promise<{
        ok: boolean;
        message?: string;
        linked: boolean;
        account?: AniListLinkedAccount | null;
      }>;
      linkAniListAccount: () => Promise<{
        ok: boolean;
        message: string;
        linked: boolean;
        account?: AniListLinkedAccount | null;
        needsConflictResolution?: boolean;
        conflict?: {
          anilistUserId: number;
          anilistUsername: string;
          sourceUser: {
            id: number;
            username: string;
          } | null;
          targetUser: {
            id: number;
            username: string;
          };
        };
        import?: {
          ok: boolean;
          message: string;
        };
      }>;
      resolveAniListLinkConflict: (action: "transfer" | "merge") => Promise<{
        ok: boolean;
        message: string;
        linked: boolean;
        account?: AniListLinkedAccount | null;
        resolution?: "transfer" | "merge";
        mergeSummary?: {
          movedEntries: number;
        } | null;
      }>;
      getMalLinkStatus: () => Promise<{
        ok: boolean;
        message?: string;
        linked: boolean;
        account?: MalLinkedAccount | null;
      }>;
      linkMalAccount: () => Promise<{
        ok: boolean;
        message: string;
        linked: boolean;
        account?: MalLinkedAccount | null;
        needsConflictResolution?: boolean;
        conflict?: {
          malUserId: number;
          malUsername: string;
          sourceUser: {
            id: number;
            username: string;
          } | null;
          targetUser: {
            id: number;
            username: string;
          };
        };
      }>;
      resolveMalLinkConflict: (action: "transfer" | "merge") => Promise<{
        ok: boolean;
        message: string;
        linked: boolean;
        account?: MalLinkedAccount | null;
        resolution?: "transfer" | "merge";
        mergeSummary?: {
          movedEntries: number;
        } | null;
      }>;
      logout: () => Promise<{ ok: boolean; message: string }>;
      getSession: () => Promise<SessionResponse>;

      setTutorialDismissed: (dismissed: boolean) => Promise<{
        ok: boolean;
        message: string;
        user: AuthUser | null;
      }>;

      getMyList: () => Promise<{
        ok: boolean;
        message?: string;
        entries: TrackedAnimeEntry[];
      }>;

      getMyListEntry: (animeId: number) => Promise<{
        ok: boolean;
        message?: string;
        entry: TrackedAnimeEntry | null;
      }>;

      saveMyListEntry: (
        animeId: number,
        data: {
          status?: string;
          isFavorite?: boolean;
          progress?: number;
          score?: number | null;
          notes?: string | null;
          startedAt?: string | null;
          completedAt?: string | null;
          isRewatching?: boolean;
          repeatCount?: number;
        }
      ) => Promise<{
        ok: boolean;
        message: string;
        entry?: TrackedAnimeEntry;
      }>;

      removeMyListEntry: (animeId: number) => Promise<{
        ok: boolean;
        message: string;
      }>;

      getMyMangaList: () => Promise<{
        ok: boolean;
        message?: string;
        entries: TrackedMangaEntry[];
      }>;

      getMyMangaListEntry: (mangaId: number) => Promise<{
        ok: boolean;
        message?: string;
        entry: TrackedMangaEntry | null;
      }>;

      saveMyMangaListEntry: (
        mangaId: number,
        data: {
          status?: string;
          isFavorite?: boolean;
          progress?: number;
          volumeProgress?: number;
          score?: number | null;
          notes?: string | null;
          startedAt?: string | null;
          completedAt?: string | null;
          isRereading?: boolean;
          repeatCount?: number;
        }
      ) => Promise<{
        ok: boolean;
        message: string;
        entry?: TrackedMangaEntry;
      }>;

      removeMyMangaListEntry: (mangaId: number) => Promise<{
        ok: boolean;
        message: string;
      }>;

      clearMyList: () => Promise<{
        ok: boolean;
        message: string;
        removedCount?: number;
      }>;

      exportLocalBackup: () => Promise<SeenaryBackup>;

      importLocalBackup: (backup: unknown) => Promise<{
        ok: boolean;
        message: string;
        imported?: number;
      }>;
    };
    desktopUpdater?: {
      onUpdateAvailable: (callback: (info: DesktopUpdateInfo) => void) => () => void;
      onUpdateDownloading: (
        callback: (progress: {
          percent?: number;
          transferred?: number;
          total?: number;
          bytesPerSecond?: number;
        }) => void
      ) => () => void;
      onUpdateDownloaded: (callback: (info: DesktopUpdateInfo) => void) => () => void;
      onUpdateError: (callback: (error: { message?: string }) => void) => () => void;
      downloadUpdate: () => Promise<{ ok: boolean; message?: string }>;
      installUpdate: () => Promise<{ ok: boolean; message?: string }>;
      remindLater: () => Promise<{ ok: boolean }>;
      getState: () => Promise<{
        ok: boolean;
        checking: boolean;
        downloading: boolean;
        intervalMs: number;
        availableUpdate?: DesktopUpdateInfo | null;
        downloadedUpdate?: DesktopUpdateInfo | null;
      }>;
    };
    desktopShortcuts?: {
      getHideShowShortcut: () => Promise<{
        ok: boolean;
        enabled: boolean;
        accelerator: string;
        defaultAccelerator?: string;
        message?: string;
      }>;
      setHideShowShortcut: (payload: {
        enabled: boolean;
        accelerator: string;
      }) => Promise<{
        ok: boolean;
        enabled: boolean;
        accelerator: string;
        message?: string;
      }>;
      setShortcutRecordingActive: (active: boolean) => Promise<{
        ok: boolean;
        active: boolean;
        message?: string;
      }>;
    };
    desktopStartup?: {
      getStartupSetting: () => Promise<{
        ok: boolean;
        available: boolean;
        openAtLogin: boolean;
        wasOpenedAtLogin?: boolean;
        message?: string;
      }>;
      setStartupSetting: (enabled: boolean) => Promise<{
        ok: boolean;
        available: boolean;
        openAtLogin: boolean;
        wasOpenedAtLogin?: boolean;
        message?: string;
      }>;
    };
    desktopWindow?: {
      getWindowState: () => Promise<{
        ok: boolean;
        preset?: "compact" | "balanced" | "cinematic" | "custom";
        message?: string;
        bounds?: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        customBounds?: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        presets?: Array<{
          id: "compact" | "balanced" | "cinematic";
          width: number;
          height: number;
        }>;
      }>;
      setWindowPreset: (preset: "compact" | "balanced" | "cinematic") => Promise<{
        ok: boolean;
        preset?: "compact" | "balanced" | "cinematic" | "custom";
        message?: string;
        bounds?: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        customBounds?: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
      }>;
      setCustomBounds: (bounds: { width: number; height: number }) => Promise<{
        ok: boolean;
        preset?: "custom";
        message?: string;
        minimum?: {
          width: number;
          height: number;
        };
        bounds?: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        customBounds?: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
      }>;
      onWindowStateChanged: (
        callback: (state: {
          ok: boolean;
          preset?: "compact" | "balanced" | "cinematic" | "custom";
          bounds?: {
            x: number;
            y: number;
            width: number;
            height: number;
          } | null;
          customBounds?: {
            x: number;
            y: number;
            width: number;
            height: number;
          } | null;
        }) => void
      ) => () => void;
    };
    desktopConfig?: {
      getLayoutOrders: (userId: number) => Promise<{
        ok: boolean;
        message?: string;
        personalLayoutOrder?: string[];
        discoverLayoutOrder?: string[];
        myListSectionOrder?: string[];
        mangaMyListSectionOrder?: string[];
      }>;
      setLayoutOrders: (
        userId: number,
        layouts: {
          personalLayoutOrder?: string[];
          discoverLayoutOrder?: string[];
          myListSectionOrder?: string[];
          mangaMyListSectionOrder?: string[];
        }
      ) => {
        ok: boolean;
        message?: string;
        personalLayoutOrder?: string[];
        discoverLayoutOrder?: string[];
        myListSectionOrder?: string[];
        mangaMyListSectionOrder?: string[];
      };
    };
    systemLocale?: {
      locale: string | null;
      locales: string[];
      regionalFormat?: {
        localeName?: string | null;
        shortDate?: string | null;
        longDate?: string | null;
        shortTime?: string | null;
        longTime?: string | null;
        is24Hour?: boolean;
        amDesignator?: string | null;
        pmDesignator?: string | null;
        dateSeparator?: string | null;
        timeSeparator?: string | null;
      } | null;
    };
  }
}
