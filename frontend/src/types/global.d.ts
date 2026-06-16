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
  themeAccent: "cyan" | "violet" | "rose" | "amber" | "emerald";
  titleLanguage: "userPreferred" | "english" | "romaji" | "native";
  showTrendingCarousel: boolean;
  autoRotateTrending: boolean;
  autoScrollHomeShelves: boolean;
  hideAdultContent: boolean;
};

type SyncActivityItem = {
  id: number;
  user_id: number;
  anime_id: number | null;
  animeTitle?: string;
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
      searchAnime: (query: string, hideAdultContent?: boolean) => Promise<any>;
      getTrendingAnime: (hideAdultContent?: boolean) => Promise<any[]>;
      getDiscoverAnime: (hideAdultContent?: boolean) => Promise<any[]>;
      getDiscoverShelfAnime: (
        shelfId: string,
        page?: number,
        hideAdultContent?: boolean
      ) => Promise<any>;
      previewAniListImport: (username: string) => Promise<{
        ok: boolean;
        message?: string;
        username?: string;
        preview?: {
          totalFound: number;
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
            }>;
          }>;
        };
      }>;
      importAniList: (
        username: string,
        selectedStatuses?: string[],
        selectedAnimeIds?: number[]
      ) => Promise<{
        ok: boolean;
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
      previewMalImport: () => Promise<{
        ok: boolean;
        message?: string;
        username?: string;
        preview?: {
          totalFound: number;
          skipped?: number;
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
              source?: {
                provider: "mal";
                animeId: number;
                title: string;
              };
            }>;
          }>;
        };
      }>;
      importMal: (
        selectedStatuses?: string[],
        selectedAnimeIds?: number[]
      ) => Promise<{
        ok: boolean;
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
      previewTextImport: (text: string, hideAdultContent?: boolean) => Promise<{
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
              media?: any;
            }>;
          }>;
        };
      }>;
      previewPdfImport: (pdfBase64: string, hideAdultContent?: boolean) => Promise<{
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
              media?: any;
            }>;
          }>;
        };
      }>;
      importTextList: (
        entries: any[],
        selectedAnimeIds?: number[]
      ) => Promise<{
        ok: boolean;
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
        autoSyncEnabled?: boolean;
        pendingCount?: number;
      }>;
      setAutoSync: (enabled: boolean) => Promise<{
        ok: boolean;
        message?: string;
        linked?: boolean;
        provider?: "anilist" | "mal" | null;
        providerLabel?: string | null;
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
      pullFromAniList: () => Promise<{
        ok: boolean;
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
      pullFromMal: () => Promise<{
        ok: boolean;
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
      getSyncActivity: () => Promise<{
        ok: boolean;
        message?: string;
        pending?: SyncActivityItem[];
        completed?: SyncActivityItem[];
        failed?: SyncActivityItem[];
      }>;
      onFocusSearch: (callback: () => void) => void;
      getAnimeDetails: (id: number) => Promise<any>;
      cacheMinimalAnime: (media: any) => Promise<{ ok: boolean; message?: string }>;

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
        entries: any[];
      }>;

      getMyListEntry: (animeId: number) => Promise<{
        ok: boolean;
        message?: string;
        entry: any | null;
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
        entry?: any;
      }>;

      removeMyListEntry: (animeId: number) => Promise<{
        ok: boolean;
        message: string;
      }>;

      clearMyList: () => Promise<{
        ok: boolean;
        message: string;
        removedCount?: number;
      }>;

      exportLocalBackup: () => Promise<any>;

      importLocalBackup: (backup: any) => Promise<{
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
