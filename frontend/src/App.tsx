import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { ResultsGrid } from "./components/ResultsGrid";
import { searchMedia } from "./services/anilist";
import { TopNavbar } from "./components/TopNavbar";
import { HomePage } from "./components/HomePage";
import { AuthScreen } from "./components/AuthScreen";
import { MyListPage } from "./components/MyListPage";
import { ListEntryModal } from "./components/ListEntryModal";
import type { AppSettings } from "./components/SettingsPage";
import { getPreferredTitle } from "./utils/titlePreference";
import { SyncToast, type SyncToastState } from "./components/SyncToast";
import { UpdateModal } from "./components/UpdateModal";
import { GlobalScrollToTop } from "./components/GlobalScrollToTop";
import type { LibraryDestination } from "./components/LibraryLens";
import type {
  ImportPreviewItem,
  MediaSearchResults,
  MediaType,
  SearchAnime,
  SearchMedia,
  TrackedAnimeEntry,
  TrackedMediaEntry,
  TrackedMangaEntry,
} from "./types/domain";
import { AsyncStatePanel } from "./components/ui/AsyncStatePanel";
import {
  applyBackupPreferences,
  collectBackupPreferences,
} from "./utils/portablePreferences";

const MediaDetails = lazy(() => import("./components/AnimeDetails"));
const SettingsPage = lazy(() =>
  import("./components/SettingsPage").then((module) => ({ default: module.SettingsPage }))
);

const EMPTY_MEDIA_SEARCH_RESULTS: MediaSearchResults = { anime: [], manga: [] };

const DEFAULT_APP_SETTINGS: AppSettings = {
  themeAccent: "violet",
  customAccentColor: "#a78bfa",
  titleLanguage: "userPreferred",
  showTrendingCarousel: true,
  autoRotateTrending: true,
  autoScrollHomeShelves: true,
  hideAdultContent: true,
  overlayOpacity: 100,
  overlayBackground: "solid",
  navbarStyle: "integrated",
  browseCardStyle: "default",
  backgroundDim: 65,
  animationLevel: "full",
  compactMode: false,
  discoverDensity: "balanced",
  homeDensity: "balanced",
  myListDensity: "balanced",
  startView: "home",
};

type AuthUser = {
  id: number;
  username: string;
  tutorial_dismissed: number;
};

type MediaReference = {
  id: number;
  type: MediaType;
};

type AniListImportResult = {
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
};

type MalImportResult = {
  ok: boolean;
  cancelled?: boolean;
  message: string;
  summary?: AniListImportResult["summary"] & {
    mapped?: number;
    unmapped?: number;
  };
};

type ClearListResult = {
  ok: boolean;
  message: string;
  removedCount?: number;
  animeRemovedCount?: number;
  mangaRemovedCount?: number;
};

type BackupImportResult = {
  ok: boolean;
  message: string;
  imported?: number;
};

type ImportOptions = {
  signal?: AbortSignal;
};

type AppView = "home" | "list" | "details" | "settings";
type HomeMode = Exclude<LibraryDestination, "list">;

const LIBRARY_MEDIA_STORAGE_KEY = "seenary.library-lens.media";
const LEGACY_MY_LIST_MEDIA_STORAGE_KEY = "seenary.my-list.media-type";
const HOME_MODE_STORAGE_KEY = "seenary.home-tab";
const LEGACY_HOME_MODE_STORAGE_KEY = "media-tracker.home-tab";

function readLibraryMediaType(): MediaType {
  const value =
    window.localStorage.getItem(LIBRARY_MEDIA_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_MY_LIST_MEDIA_STORAGE_KEY);
  return value === "MANGA" ? "MANGA" : "ANIME";
}

function readHomeMode(): HomeMode {
  const value =
    window.localStorage.getItem(HOME_MODE_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_HOME_MODE_STORAGE_KEY);
  return value === "discover"
    ? "discover"
    : "personal";
}

type AppNotification = {
  id: number;
  kind: "success" | "error" | "warning";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

type DesktopUpdateInfo = {
  version: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string | null;
};

type DesktopUpdateState = {
  visible: boolean;
  status: "available" | "downloading" | "downloaded" | "error";
  info: DesktopUpdateInfo | null;
  progress: number;
  errorMessage: string | null;
};

const SESSION_WARNING_THRESHOLDS = [
  { key: "3d", label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { key: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { key: "12h", label: "12 hours", ms: 12 * 60 * 60 * 1000 },
  { key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
];

const SESSION_WARNING_POLL_MS = 15 * 60 * 1000;

function joinLabels(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function PageLoadingFallback() {
  return <AsyncStatePanel title="Loading view..." busy compact />;
}

function formatAutoSyncMessage(result: AutoSyncCompleteEvent) {
  const completedActivity = (result.activity ?? []).filter((item) => item.status === "completed");
  const items = result.syncedItems?.length
    ? result.syncedItems
    : completedActivity.map((item) => ({
        animeTitle: item.animeTitle ?? item.anime_title,
        provider: item.operation?.includes("_mal_")
          ? "MyAnimeList"
          : item.operation?.includes("_anilist_")
            ? "AniList"
            : null,
      }));
  const titles = [...new Set(items.map((item) => item.animeTitle?.trim()).filter(Boolean))] as string[];
  const providers = [...new Set(items.map((item) => item.provider?.trim()).filter(Boolean))] as string[];
  const syncedCount = result.synced ?? items.length;

  const subject =
    titles.length === 1
      ? titles[0]
      : titles.length === 2
        ? joinLabels(titles)
        : `${titles.length || syncedCount} changes`;
  const destination = providers.length
    ? joinLabels(providers)
    : "your linked third-party app";
  const verb = titles.length === 1 ? "was" : "were";

  return `${subject} ${verb} automatically synced to ${destination}.`;
}

function isAdultListEntry(entry: TrackedAnimeEntry) {
  if (entry.is_adult !== null && entry.is_adult !== undefined) {
    return Boolean(entry.is_adult);
  }

  if (entry.details?.isAdult !== null && entry.details?.isAdult !== undefined) {
    return Boolean(entry.details.isAdult);
  }

  // When the privacy filter is active, unclassified legacy cache entries fail closed
  // until their adult-content flag has been refreshed.
  return true;
}

function redactAdultListEntry(entry: TrackedAnimeEntry): TrackedAnimeEntry {
  return {
    ...entry,
    hidden_by_adult_filter: true,
    title_romaji: "Hidden by 18+ filter",
    title_english: "Hidden by 18+ filter",
    title_native: null,
    title_preferred: "Hidden by 18+ filter",
    cover_image_large: null,
    banner_image: null,
    format: null,
    genres: [],
    tags: [],
    recommendations: [],
    details: null,
  };
}

function App() {
  const [results, setResults] = useState<MediaSearchResults>(EMPTY_MEDIA_SEARCH_RESULTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultsVisible, setSearchResultsVisible] = useState(false);
  const [selectedAnimeId, setSelectedAnimeId] = useState<number | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>("ANIME");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [libraryMediaType, setLibraryMediaType] = useState<MediaType>(readLibraryMediaType);
  const [homeMode, setHomeMode] = useState<HomeMode>(readHomeMode);
  const [isLibraryLensVisible, setIsLibraryLensVisible] = useState(false);
  const [trackedEntries, setTrackedEntries] = useState<TrackedAnimeEntry[]>([]);
  const [trackedMangaEntries, setTrackedMangaEntries] = useState<TrackedMangaEntry[]>([]);
  const [editingListEntry, setEditingListEntry] = useState<TrackedMediaEntry | null>(null);
  const [previousView, setPreviousView] = useState<AppView>("home");
  const [previousAnimeId, setPreviousAnimeId] = useState<number | null>(null);
  const [previousMediaType, setPreviousMediaType] = useState<MediaType>("ANIME");
  const [detailsReturnView, setDetailsReturnView] = useState<AppView>("home");
  const [detailsHistory, setDetailsHistory] = useState<MediaReference[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [syncToast, setSyncToast] = useState<SyncToastState>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateState>({
    visible: false,
    status: "available",
    info: null,
    progress: 0,
    errorMessage: null,
  });
  const sessionWarningKeysRef = useRef<Set<string>>(new Set());
  const homeScrollTopRef = useRef(0);
  const homeScrollElementRef = useRef<HTMLDivElement | null>(null);
  const listScrollTopRef = useRef(0);
  const listScrollElementRef = useRef<HTMLDivElement | null>(null);
  const searchRequestIdRef = useRef(0);

  const privacySafeTrackedEntries = useMemo(
    () =>
      settings.hideAdultContent
        ? trackedEntries.map((entry) =>
            isAdultListEntry(entry) ? redactAdultListEntry(entry) : entry
          )
        : trackedEntries,
    [settings.hideAdultContent, trackedEntries]
  );
  const privacySafeTrackedMangaEntries = useMemo(
    () =>
      settings.hideAdultContent
        ? trackedMangaEntries.map((entry) =>
            entry.is_adult === null || entry.is_adult === undefined || Boolean(entry.is_adult)
              ? {
                  ...entry,
                  hidden_by_adult_filter: true,
                  title_romaji: "Hidden by 18+ filter",
                  title_english: "Hidden by 18+ filter",
                  title_native: null,
                  title_preferred: "Hidden by 18+ filter",
                  cover_image_large: null,
                  banner_image: null,
                  notes: null,
                  genres: [],
                  tags: [],
                  recommendations: [],
                  details: null,
                }
              : entry
          )
        : trackedMangaEntries,
    [settings.hideAdultContent, trackedMangaEntries]
  );
  const privacySafeResults = useMemo(
    () =>
      settings.hideAdultContent
        ? {
            anime: results.anime.filter((media) => !media.isAdult),
            manga: results.manga.filter((media) => !media.isAdult),
          }
        : results,
    [results, settings.hideAdultContent]
  );
  const visibleSearchResultCount =
    privacySafeResults.anime.length + privacySafeResults.manga.length;
  const searchResultCount = results.anime.length + results.manga.length;

  const showSyncToast = useCallback((
    kind: "success" | "error" | "warning",
    title: string,
    message: string
  ) => {
    const id = Date.now();
    const notification = {
      id,
      kind,
      title,
      message,
      createdAt: new Date().toISOString(),
      read: false,
    };

    setNotifications((current) => [notification, ...current].slice(0, 30));
    setSyncToast({ id, kind, title, message });

    window.setTimeout(() => {
      setSyncToast((current) => (current?.id === id ? null : current));
    }, 4200);
  }, []);

  useEffect(() => {
    if (!window.api.onAutoSyncComplete) {
      return;
    }

    return window.api.onAutoSyncComplete((result) => {
      if (result.ok) {
        showSyncToast("success", "Auto-sync completed", formatAutoSyncMessage(result));
        return;
      }

      if ((result.synced ?? 0) > 0) {
        const failedCount = result.failed ?? 0;
        showSyncToast(
          "warning",
          "Auto-sync partially completed",
          `${formatAutoSyncMessage(result)} ${failedCount} change${failedCount === 1 ? "" : "s"} will retry later.`
        );
        return;
      }

      showSyncToast("error", "Auto-sync failed", result.message);
    });
  }, [showSyncToast]);

  const handleHomeScrollPositionChange = useCallback((scrollTop: number) => {
    homeScrollTopRef.current = scrollTop;
  }, []);

  const handleHomeScrollContainerChange = useCallback((element: HTMLDivElement | null) => {
    homeScrollElementRef.current = element;
  }, []);

  const captureHomeScrollTop = useCallback(() => {
    if (currentView === "home" && homeScrollElementRef.current) {
      homeScrollTopRef.current = homeScrollElementRef.current.scrollTop;
    }
  }, [currentView]);

  const handleListScrollPositionChange = useCallback((scrollTop: number) => {
    listScrollTopRef.current = scrollTop;
  }, []);

  const handleListScrollContainerChange = useCallback((element: HTMLDivElement | null) => {
    listScrollElementRef.current = element;
  }, []);

  const captureListScrollTop = useCallback(() => {
    if (currentView === "list" && listScrollElementRef.current) {
      listScrollTopRef.current = listScrollElementRef.current.scrollTop;
    }
  }, [currentView]);

  const handleReadNotification = (id: number) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  };

  const handleClearNotifications = () => {
    setNotifications([]);
  };

  const handleDismissNotification = (id: number) => {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== id)
    );
  };

  const loadTrackedEntries = useCallback(async () => {
    try {
      const [result, mangaResult] = await Promise.all([
        window.api.getMyList(),
        window.api.getMyMangaList(),
      ]);

      if (!result.ok) {
        setTrackedEntries([]);
      } else {
        setTrackedEntries(result.entries || []);
      }

      setTrackedMangaEntries(mangaResult.ok ? mangaResult.entries || [] : []);
    } catch (error) {
      console.error("Failed to load tracked media entries:", error);
      setTrackedEntries([]);
      setTrackedMangaEntries([]);
    }
  }, []);

  const notifyIfSessionIsExpiring = useCallback((expiresAt?: number) => {
    if (!expiresAt) {
      return;
    }

    const remainingMs = expiresAt - Date.now();

    if (remainingMs <= 0) {
      return;
    }

    const nextWarning = [...SESSION_WARNING_THRESHOLDS].reverse().find(
      (threshold) =>
        remainingMs <= threshold.ms &&
        !sessionWarningKeysRef.current.has(`${expiresAt}:${threshold.key}`)
    );

    if (!nextWarning) {
      return;
    }

    sessionWarningKeysRef.current.add(`${expiresAt}:${nextWarning.key}`);
    showSyncToast(
      "warning",
      "Session expiring soon",
      `Your session expires in about ${nextWarning.label}. Use the app or log in again to keep background sync running.`
    );
  }, [showSyncToast]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const appSettings = await window.api.getSettings();
        const normalizedSettings = normalizeAppSettings(appSettings);
        setSettings(normalizedSettings);
        setCurrentView(normalizedSettings.startView === "list" ? "list" : "home");

        const session = await window.api.getSession();

        if (session.authenticated && session.user) {
          setAuthUser({
            id: session.user.id,
            username: session.user.username,
            tutorial_dismissed: session.user.tutorial_dismissed,
          });

          setShowTutorial(!session.user.tutorial_dismissed);
          notifyIfSessionIsExpiring(session.expiresAt);
          await loadTrackedEntries();
        }
      } finally {
        setCheckingSession(false);
      }
    };

    loadSession();
  }, [loadTrackedEntries, notifyIfSessionIsExpiring]);

  useEffect(() => {
    const updater = window.desktopUpdater;

    if (!updater) {
      return;
    }

    const removeAvailable = updater.onUpdateAvailable((info) => {
      setDesktopUpdate({
        visible: true,
        status: "available",
        info,
        progress: 0,
        errorMessage: null,
      });
    });

    const removeDownloading = updater.onUpdateDownloading((progress) => {
      setDesktopUpdate((current) => ({
        ...current,
        visible: true,
        status: "downloading",
        progress: Math.max(0, Math.min(100, progress.percent ?? current.progress)),
      }));
    });

    const removeDownloaded = updater.onUpdateDownloaded((info) => {
      setDesktopUpdate((current) => ({
        visible: true,
        status: "downloaded",
        info: info || current.info,
        progress: 100,
        errorMessage: null,
      }));
    });

    const removeError = updater.onUpdateError((error) => {
      setDesktopUpdate((current) => ({
        ...current,
        visible: Boolean(current.info),
        status: "error",
        errorMessage: error.message || "Seenary could not finish the update.",
      }));
    });

    updater.getState?.().then((state) => {
      if (!state?.ok) {
        return;
      }

      if (state.downloadedUpdate) {
        setDesktopUpdate({
          visible: true,
          status: "downloaded",
          info: state.downloadedUpdate,
          progress: 100,
          errorMessage: null,
        });
        return;
      }

      if (state.availableUpdate) {
        setDesktopUpdate({
          visible: true,
          status: state.downloading ? "downloading" : "available",
          info: state.availableUpdate,
          progress: state.downloading ? 4 : 0,
          errorMessage: null,
        });
      }
    });

    return () => {
      removeAvailable();
      removeDownloading();
      removeDownloaded();
      removeError();
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      sessionWarningKeysRef.current.clear();
      return;
    }

    const checkSessionExpiry = async () => {
      try {
        const session = await window.api.getSession();

        if (!session.authenticated || !session.user) {
          setAuthUser(null);
          setShowTutorial(false);
          setTrackedEntries([]);
          setTrackedMangaEntries([]);
          showSyncToast(
            "warning",
            "Session expired",
            "Your session has expired. Log in again to keep syncing your list."
          );
          return;
        }

        notifyIfSessionIsExpiring(session.expiresAt);
      } catch (error) {
        console.error("Failed to check session expiry:", error);
      }
    };

    const intervalId = window.setInterval(checkSessionExpiry, SESSION_WARNING_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [authUser, notifyIfSessionIsExpiring, showSyncToast]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    const refreshLiveState = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      loadTrackedEntries();
    };

    window.addEventListener("focus", refreshLiveState);
    document.addEventListener("visibilitychange", refreshLiveState);

    return () => {
      window.removeEventListener("focus", refreshLiveState);
      document.removeEventListener("visibilitychange", refreshLiveState);
    };
  }, [authUser, loadTrackedEntries]);

  const handleUpdateSettings = async (nextSettings: Partial<AppSettings>) => {
    const optimisticSettings = normalizeAppSettings({
      ...settings,
      ...nextSettings,
    });

    setSettings(optimisticSettings);

    try {
      const updatedSettings = await window.api.updateSettings(nextSettings);
      setSettings(
        normalizeAppSettings({
          ...optimisticSettings,
          ...updatedSettings,
        })
      );
    } catch (error) {
      setSettings(settings);
      console.error("Failed to update settings:", error);
      showSyncToast("error", "Settings update failed", "Failed to save your settings.");
    }
  };

  const handleResetSettings = async () => {
    setSettings(DEFAULT_APP_SETTINGS);

    try {
      const updatedSettings = await window.api.updateSettings(DEFAULT_APP_SETTINGS);
      setSettings(normalizeAppSettings(updatedSettings));
      showSyncToast("success", "Settings reset", "Preferences were reset to defaults.");
    } catch (error) {
      setSettings(settings);
      console.error("Failed to reset settings:", error);
      showSyncToast("error", "Settings reset failed", "Failed to reset your settings.");
    }
  };

  const handleImportAniList = async (
    username: string,
    selectedStatuses: string[],
    selectedMediaKeys: string[],
    options?: ImportOptions
  ): Promise<AniListImportResult> => {
    const result = await window.api.importAniList(
      username,
      selectedStatuses,
      selectedMediaKeys,
      options
    );

    if (result.cancelled) {
      return result;
    }

    if (result.ok) {
      await loadTrackedEntries();
      showSyncToast("success", "AniList import complete", result.message);
    } else {
      showSyncToast("error", "AniList import failed", result.message);
    }

    return result;
  };

  const handleImportMal = async (
    username: string,
    selectedStatuses: string[],
    selectedMediaKeys: string[],
    options?: ImportOptions
  ): Promise<MalImportResult> => {
    const result = await window.api.importMal(
      username,
      selectedStatuses,
      selectedMediaKeys,
      options
    );

    if (result.cancelled) {
      return result;
    }

    if (result.ok) {
      await loadTrackedEntries();
      showSyncToast("success", "MyAnimeList import complete", result.message);
    } else {
      showSyncToast("error", "MyAnimeList import failed", result.message);
    }

    return result;
  };

  const handleImportTextList = async (
    entries: ImportPreviewItem[],
    selectedMediaKeys: string[],
    options?: ImportOptions
  ): Promise<AniListImportResult> => {
    const result = await window.api.importTextList(entries, selectedMediaKeys, options);

    if (result.cancelled) {
      return result;
    }

    if (result.ok) {
      await loadTrackedEntries();
      showSyncToast("success", "Text import complete", result.message);
    } else {
      showSyncToast("error", "Text import failed", result.message);
    }

    return result;
  };

  const handleLinkAniListAccount = async () => {
    const result = await window.api.linkAniListAccount();

    if (result.ok) {
      await loadTrackedEntries();

      if (!result.needsConflictResolution) {
        showSyncToast("success", "AniList link complete", result.message);
      }
    } else {
      showSyncToast("error", "AniList link failed", result.message);
    }

    return result;
  };

  const handleLinkMalAccount = async () => {
    const result = await window.api.linkMalAccount();

    if (result.ok) {
      if (!result.needsConflictResolution) {
        showSyncToast("success", "MyAnimeList link complete", result.message);
      }
    } else {
      showSyncToast("error", "MyAnimeList link failed", result.message);
    }

    return result;
  };

  const handleRunSyncNow = async () => {
    const result = await window.api.runSyncNow();

    showSyncToast(
      result.ok ? "success" : "error",
      result.ok ? "Sync complete" : "Sync failed",
      result.message
    );

    return result;
  };

  const handlePullFromAniList = async () => {
    const result = await window.api.pullFromAniList();

    if (result.ok) {
      await loadTrackedEntries();
    }

    showSyncToast(
      result.ok ? (result.partial ? "warning" : "success") : "error",
      result.ok
        ? result.partial
          ? "AniList update partially complete"
          : "AniList update complete"
        : "AniList update failed",
      result.message
    );

    return result;
  };

  const handlePullFromMal = async () => {
    const result = await window.api.pullFromMal();

    if (result.ok) {
      await loadTrackedEntries();
    }

    showSyncToast(
      result.ok ? (result.partial ? "warning" : "success") : "error",
      result.ok
        ? result.partial
          ? "MyAnimeList update partially complete"
          : "MyAnimeList update complete"
        : "MyAnimeList update failed",
      result.message
    );

    return result;
  };

  const handleClearLists = async (
    target: "anime" | "manga" | "all",
    queueProviderDeletion: boolean
  ): Promise<ClearListResult> => {
    const options = { queueProviderDeletion };
    const result = await (target === "anime"
      ? window.api.clearMyList(options)
      : target === "manga"
        ? window.api.clearMyMangaList(options)
        : window.api.clearAllMediaLists(options));

    if (result.ok) {
      await loadTrackedEntries();
      showSyncToast("success", "List cleared", result.message);
    } else {
      showSyncToast("error", "List clear failed", result.message);
    }

    return result;
  };

  const handleDeleteAccount = async (usernameConfirmation: string) => {
    const result = await window.api.deleteAccount(usernameConfirmation);
    if (!result.ok) return result;

    setAuthUser(null);
    setShowTutorial(false);
    setSearchQuery("");
    setResults(EMPTY_MEDIA_SEARCH_RESULTS);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setTrackedEntries([]);
    setTrackedMangaEntries([]);
    setPreviousAnimeId(null);
    setDetailsReturnView("home");
    setPreviousView("home");
    setDetailsHistory([]);
    return result;
  };

  const handleExportLocalBackup = async () => {
    const preferenceBundle = authUser
      ? await collectBackupPreferences(authUser.id)
      : undefined;
    const backup = await window.api.exportLocalBackup(preferenceBundle);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `seenary-portable-backup-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    showSyncToast("success", "Backup exported", "Your portable Seenary backup was downloaded.");
  };

  const handleImportLocalBackup = async (
    backup: unknown,
    options: { restoreDesktopPreferences?: boolean } = {}
  ): Promise<BackupImportResult> => {
    const result = await window.api.importLocalBackup(backup);

    if (result.ok) {
      let desktopRestored = 0;
      if (authUser && result.portablePreferences) {
        const restored = await applyBackupPreferences(
          authUser.id,
          result.portablePreferences,
          result.desktopPreferences,
          options
        );
        setLibraryMediaType(restored.preferences.navigation.libraryMediaType);
        setHomeMode(restored.preferences.navigation.homeMode);
        desktopRestored = restored.desktopRestored;
      }
      if (result.settings && typeof result.settings === "object") {
        setSettings((current) => ({
          ...current,
          ...(result.settings as Partial<AppSettings>),
        }));
      }
      await loadTrackedEntries();
      const message = desktopRestored > 0
        ? `${result.message} Restored ${desktopRestored} device preference${desktopRestored === 1 ? "" : "s"}.`
        : result.message;
      showSyncToast("success", "Backup imported", message);
      return { ...result, message };
    } else {
      showSyncToast("error", "Backup import failed", result.message);
    }

    return result;
  };

  const handleAuthenticated = async (user: {
    id: number;
    username: string;
    tutorial_dismissed: number;
  }) => {
    setAuthUser(user);
    setShowTutorial(!user.tutorial_dismissed);
    setCurrentView(settings.startView === "list" ? "list" : "home");
    await loadTrackedEntries();
  };

  const handleDismissTutorial = async (dontShowAgain: boolean) => {
    setShowTutorial(false);

    if (!dontShowAgain) {
      return;
    }

    try {
      const result = await window.api.setTutorialDismissed(true);

      if (!result.ok || !result.user) {
        console.error(result.message);
        return;
      }

      setAuthUser({
        id: result.user.id,
        username: result.user.username,
        tutorial_dismissed: result.user.tutorial_dismissed,
      });
    } catch (error) {
      console.error("Failed to save tutorial preference:", error);
    }
  };

  const handleShowWelcomeScreen = async () => {
    try {
      const result = await window.api.setTutorialDismissed(false);

      if (result.ok && result.user) {
        setAuthUser({
          id: result.user.id,
          username: result.user.username,
          tutorial_dismissed: result.user.tutorial_dismissed,
        });
      }
    } catch (error) {
      console.error("Failed to reset tutorial preference:", error);
    }

    setSearchQuery("");
    setResults(EMPTY_MEDIA_SEARCH_RESULTS);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setPreviousView("home");
    setPreviousAnimeId(null);
    setDetailsReturnView("home");
    setDetailsHistory([]);
    setShowTutorial(true);
  };

  const handleSearch = async (query: string) => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    captureHomeScrollTop();
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResultsVisible(false);
      setSearchError(null);
      setIsSearching(false);
      setResults(EMPTY_MEDIA_SEARCH_RESULTS);
      if (selectedAnimeId === null) {
        setCurrentView("home");
      }
      return;
    }

    setSearchResultsVisible(true);
    setIsSearching(true);
    setSearchError(null);

    try {
      const data = await searchMedia(query, settings.hideAdultContent);

      if (searchRequestIdRef.current !== requestId) {
        return;
      }

      setResults(data);
      setSelectedAnimeId(null);
      setCurrentView("home");
    } catch (error) {
      console.error("Failed to search AniList:", error);

      if (searchRequestIdRef.current !== requestId) {
        return;
      }

      setResults(EMPTY_MEDIA_SEARCH_RESULTS);
      setSelectedAnimeId(null);
      setCurrentView("home");
      setSearchError(
        error instanceof Error && error.message
          ? error.message
          : "There was a problem searching AniList."
      );
    } finally {
      if (searchRequestIdRef.current === requestId) {
        setIsSearching(false);
      }
    }
  };

  const handleRetrySearch = () => {
    if (!searchQuery.trim()) return;
    void handleSearch(searchQuery);
  };

  const handleDismissSearchResults = () => {
    setSearchResultsVisible(false);
  };

  const handleRestoreSearchResults = () => {
    if (!searchQuery.trim()) return;

    setSelectedAnimeId(null);
    setCurrentView("home");
    void handleSearch(searchQuery);
  };

  const handleQuickAddToList = async (media: SearchMedia | SearchAnime) => {
    const title = getPreferredTitle(media.title, settings.titleLanguage);
    const isManga = media.type === "MANGA";
    const mediaLabel = isManga ? "manga" : "anime";

    try {
      const cacheResult = isManga
        ? await window.api.cacheMinimalManga(media)
        : await window.api.cacheMinimalAnime(media);

      if (!cacheResult.ok) {
        console.error(`Failed to cache ${mediaLabel} before quick add:`, cacheResult.message);
        showSyncToast("error", "List update failed", cacheResult.message || `Failed to prepare ${title}.`);
        return;
      }

      const entryData = { status: "planned", progress: 0, score: null, notes: "" };
      const result = isManga
        ? await window.api.saveMyMangaListEntry(media.id, { ...entryData, volumeProgress: 0 })
        : await window.api.saveMyListEntry(media.id, entryData);

      if (!result.ok) {
        console.error(`Failed to quick add ${mediaLabel} to list:`, result.message);
        showSyncToast("error", "List update failed", result.message);
        return;
      }

      await loadTrackedEntries();
      showSyncToast(
        "success",
        "List updated",
        `${title} was added to your list as ${isManga ? "Plan to Read" : "Planned"}.`
      );
    } catch (error) {
      console.error(`Failed to quick add ${mediaLabel} to list:`, error);
      showSyncToast("error", "List update failed", `Failed to add ${title} to your list.`);
    }
  };

  const handleLogout = async () => {
    await window.api.logout();
    setAuthUser(null);
    setShowTutorial(false);
    setSearchQuery("");
    setResults(EMPTY_MEDIA_SEARCH_RESULTS);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setTrackedEntries([]);
    setTrackedMangaEntries([]);
    setPreviousAnimeId(null);
    setDetailsReturnView("home");
    setPreviousView("home");
    setDetailsHistory([]);
  };

  const handleDownloadDesktopUpdate = async () => {
    const result = await window.desktopUpdater?.downloadUpdate();

    if (result && !result.ok) {
      setDesktopUpdate((current) => ({
        ...current,
        status: "error",
        errorMessage: result.message || "Seenary could not download the update.",
      }));
    }
  };

  const handleInstallDesktopUpdate = async () => {
    await window.desktopUpdater?.installUpdate();
  };

  const handleRemindDesktopUpdateLater = async () => {
    await window.desktopUpdater?.remindLater();
    setDesktopUpdate((current) => ({
      ...current,
      visible: false,
    }));
  };

  const handleOpenMediaDetails = (mediaId: number, mediaType: MediaType) => {
    captureHomeScrollTop();
    captureListScrollTop();

    window.localStorage.setItem(LIBRARY_MEDIA_STORAGE_KEY, mediaType);
    window.localStorage.setItem(LEGACY_MY_LIST_MEDIA_STORAGE_KEY, mediaType);
    setLibraryMediaType(mediaType);

    if (currentView === "details" && selectedAnimeId !== null) {
      if (selectedAnimeId === mediaId && selectedMediaType === mediaType) {
        return;
      }

      setDetailsHistory((current) => [
        ...current,
        { id: selectedAnimeId, type: selectedMediaType },
      ]);
    } else {
      setDetailsHistory([]);
      setDetailsReturnView(currentView);
    }

    setSelectedAnimeId(mediaId);
    setSelectedMediaType(mediaType);
    setCurrentView("details");
  };

  const handleOpenAnimeDetails = (animeId: number) => {
    handleOpenMediaDetails(animeId, "ANIME");
  };

  const handleOpenMyList = () => {
    if (currentView === "list") {
      if (previousView === "details") {
        setSelectedAnimeId(previousAnimeId);
        setSelectedMediaType(previousMediaType);
      }

      setCurrentView(previousView);
      return;
    }

    captureHomeScrollTop();
    setPreviousView(currentView);

    if (currentView === "details") {
      setPreviousAnimeId(selectedAnimeId);
      setPreviousMediaType(selectedMediaType);
    } else {
      setPreviousAnimeId(null);
    }

    setCurrentView("list");
  };

  const handleOpenHome = () => {
    setSearchQuery("");
    setResults(EMPTY_MEDIA_SEARCH_RESULTS);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setPreviousView("home");
    setPreviousAnimeId(null);
    setDetailsReturnView("home");
    setDetailsHistory([]);
  };

  const handleLibraryMediaChange = (mediaType: MediaType) => {
    window.localStorage.setItem(LIBRARY_MEDIA_STORAGE_KEY, mediaType);
    window.localStorage.setItem(LEGACY_MY_LIST_MEDIA_STORAGE_KEY, mediaType);
    setLibraryMediaType(mediaType);
  };

  const handleLibraryDestinationChange = (destination: LibraryDestination) => {
    if (destination === "list") {
      if (currentView === "list") return;

      captureHomeScrollTop();
      setPreviousView(currentView);
      setCurrentView("list");
      setSelectedAnimeId(null);
      setDetailsHistory([]);
      return;
    }

    if (currentView === "home" && homeMode === destination) return;

    window.localStorage.setItem(HOME_MODE_STORAGE_KEY, destination);
    setHomeMode(destination);
    setSearchQuery("");
    setResults(EMPTY_MEDIA_SEARCH_RESULTS);
    setSearchResultsVisible(false);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setPreviousView("home");
    setDetailsReturnView("home");
    setDetailsHistory([]);
  };

  const handleOpenSettings = () => {
    if (currentView === "settings") {
      setCurrentView(previousView === "settings" ? "home" : previousView);
      return;
    }

    captureHomeScrollTop();
    setPreviousView(currentView);

    if (currentView === "details") {
      setPreviousAnimeId(selectedAnimeId);
      setPreviousMediaType(selectedMediaType);
    } else {
      setPreviousAnimeId(null);
    }

    setCurrentView("settings");
  };

  const handleBackFromDetails = async () => {
    const previousDetailsMedia = detailsHistory.at(-1);

    if (previousDetailsMedia !== undefined) {
      setDetailsHistory((current) => current.slice(0, -1));
      setSelectedAnimeId(previousDetailsMedia.id);
      setSelectedMediaType(previousDetailsMedia.type);
      await loadTrackedEntries();
      return;
    }

    setDetailsHistory([]);

    if (detailsReturnView === "list") {
      setCurrentView("list");
      setSelectedAnimeId(null);
      await loadTrackedEntries();
      return;
    }

    setSelectedAnimeId(null);
    await loadTrackedEntries();

    if (searchQuery.trim()) {
      setCurrentView("home");
      return;
    }

    setResults(EMPTY_MEDIA_SEARCH_RESULTS);
    setSearchQuery("");
    setCurrentView("home");
  };

  if (checkingSession) {
    return (
      <div className="h-screen w-screen bg-transparent max-sm:h-dvh">
        <div className="flex h-full w-full items-center justify-center rounded-3xl bg-[#0f0f0f] text-white max-sm:rounded-none">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen bg-transparent max-sm:h-dvh"
      style={
        {
          "--app-accent": getThemeAccent(settings.themeAccent, settings.customAccentColor),
          "--app-accent-soft": getThemeAccentSoft(settings.themeAccent, settings.customAccentColor),
        } as CSSProperties
      }
    >
      <div
        data-browse-card-style={settings.browseCardStyle}
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-3xl shadow-2xl max-sm:rounded-none max-sm:shadow-none ${getOverlayBackgroundClass(
          settings.overlayBackground
        )} ${getAnimationLevelClass(settings.animationLevel)} ${
          settings.compactMode ? "app-compact" : ""
        }`}
        style={getOverlayBackgroundStyle(
          settings.overlayBackground,
          settings.overlayOpacity
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={getOverlayReadabilityStyle(
            settings.overlayBackground,
            settings.backgroundDim
          )}
        />
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          {!authUser ? (
            <AuthScreen onAuthenticated={handleAuthenticated} />
          ) : (
            <>
              <TopNavbar
                query={searchQuery}
                onSearch={handleSearch}
                onClear={() => {
                  searchRequestIdRef.current += 1;
                  setSearchQuery("");
                  setResults(EMPTY_MEDIA_SEARCH_RESULTS);
                  setSearchError(null);
                  setIsSearching(false);
                  setSearchResultsVisible(false);
                  if (currentView === "home") {
                    setSelectedAnimeId(null);
                  }
                }}
                onDismissSearchResults={handleDismissSearchResults}
                onRestoreSearchResults={handleRestoreSearchResults}
                username={authUser.username}
                notifications={notifications}
                onReadNotification={handleReadNotification}
                onDismissNotification={handleDismissNotification}
                onClearNotifications={handleClearNotifications}
                onLogout={handleLogout}
                currentView={currentView}
                onOpenHome={handleOpenHome}
                onOpenMyList={handleOpenMyList}
                onOpenSettings={handleOpenSettings}
                focusSearchOnMount={settings.startView === "search"}
                navbarStyle={settings.navbarStyle}
                hideMyListShortcut={isLibraryLensVisible}
              />

              <SyncToast
                key={syncToast?.id ?? "no-sync-toast"}
                toast={syncToast}
                onDismiss={() => setSyncToast(null)}
              />

              <div className="min-h-0 flex-1">
                <Suspense fallback={<PageLoadingFallback />}>
                  {currentView === "details" && selectedAnimeId !== null ? (
                    <MediaDetails
                    mediaId={selectedAnimeId}
                    mediaType={selectedMediaType}
                    onBack={handleBackFromDetails}
                    onSelectMedia={handleOpenMediaDetails}
                    onListChanged={loadTrackedEntries}
                    onNotify={showSyncToast}
                    titleLanguage={settings.titleLanguage}
                    hideAdultContent={settings.hideAdultContent}
                  />
                  ) : currentView === "list" ? (
                    <MyListPage
                    userId={authUser.id}
                    entries={privacySafeTrackedEntries}
                    mangaEntries={privacySafeTrackedMangaEntries}
                    onSelectMedia={handleOpenMediaDetails}
                    onRefreshList={loadTrackedEntries}
                    onListChanged={loadTrackedEntries}
                    onNotify={showSyncToast}
                    titleLanguage={settings.titleLanguage}
                    density={settings.myListDensity}
                    activeMediaType={libraryMediaType}
                    onMediaTypeChange={handleLibraryMediaChange}
                    onLibraryDestinationChange={handleLibraryDestinationChange}
                    onLibraryLensVisibilityChange={setIsLibraryLensVisible}
                    initialScrollTop={listScrollTopRef.current}
                    onScrollContainerChange={handleListScrollContainerChange}
                    onScrollPositionChange={handleListScrollPositionChange}
                  />
                  ) : currentView === "settings" ? (
                    <SettingsPage
                    username={authUser.username}
                    settings={settings}
                    onUpdateSettings={handleUpdateSettings}
                    onShowWelcomeScreen={handleShowWelcomeScreen}
                    onResetSettings={handleResetSettings}
                    onImportAniList={handleImportAniList}
                    onImportMal={handleImportMal}
                    onImportTextList={handleImportTextList}
                    onLinkAniListAccount={handleLinkAniListAccount}
                    onLinkMalAccount={handleLinkMalAccount}
                    onRunSyncNow={handleRunSyncNow}
                    onPullFromAniList={handlePullFromAniList}
                    onPullFromMal={handlePullFromMal}
                    onClearLists={handleClearLists}
                    onDeleteAccount={handleDeleteAccount}
                    onExportLocalBackup={handleExportLocalBackup}
                    onImportLocalBackup={handleImportLocalBackup}
                  />
                  ) : (
                    <HomePage
                    userId={authUser.id}
                    hasResults={
                      searchResultsVisible &&
                      (Boolean(searchQuery.trim()) || Boolean(searchError) || isSearching)
                    }
                    showTutorial={showTutorial}
                    onDismissTutorial={handleDismissTutorial}
                    trackedEntries={privacySafeTrackedEntries}
                    trackedMangaEntries={privacySafeTrackedMangaEntries}
                    mediaType={libraryMediaType}
                    activeHomeTab={homeMode}
                    onMediaTypeChange={handleLibraryMediaChange}
                    onLibraryDestinationChange={handleLibraryDestinationChange}
                    onLibraryLensVisibilityChange={setIsLibraryLensVisible}
                    onSelectMedia={handleOpenMediaDetails}
                    onSelectAnime={handleOpenAnimeDetails}
                    onQuickAddAnime={handleQuickAddToList}
                    onEditEntry={setEditingListEntry}
                    titleLanguage={settings.titleLanguage}
                    showTrendingCarousel={settings.showTrendingCarousel}
                    autoRotateTrending={settings.autoRotateTrending}
                    autoScrollHomeShelves={settings.autoScrollHomeShelves}
                    animationLevel={settings.animationLevel}
                    discoverDensity={settings.discoverDensity}
                    homeDensity={settings.homeDensity}
                    hideAdultContent={settings.hideAdultContent}
                    initialScrollTop={homeScrollTopRef.current}
                    onScrollContainerChange={handleHomeScrollContainerChange}
                    onScrollPositionChange={handleHomeScrollPositionChange}
                  >
                    <div data-global-scroll-root className="scroll-container h-full overflow-y-auto px-6 pb-6 pt-20">
                      {searchError ? (
                        <SearchErrorPanel
                          message={searchError}
                          isRetrying={isSearching}
                          onRetry={handleRetrySearch}
                        />
                      ) : isSearching && !visibleSearchResultCount ? (
                        <div className="flex min-h-72 items-center justify-center text-white/55">
                          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Searching AniList...</span>
                          </div>
                        </div>
                      ) : searchQuery.trim() && !visibleSearchResultCount ? (
                        <SearchEmptyPanel
                          query={searchQuery.trim()}
                          filteredByAdultContent={
                            settings.hideAdultContent && searchResultCount > 0
                          }
                        />
                      ) : (
                        <div className="flex flex-col gap-12 px-10 pb-10 pt-10">
                          <div className={libraryMediaType === "MANGA" ? "order-2" : "order-1"}>
                            <SearchResultSection
                              title="Anime results"
                              emptyMessage="No anime matches"
                              results={privacySafeResults.anime}
                            >
                              <ResultsGrid
                                results={privacySafeResults.anime}
                                onSelectMedia={handleOpenAnimeDetails}
                                trackedEntries={privacySafeTrackedEntries}
                                onQuickAdd={handleQuickAddToList}
                                onEditEntry={setEditingListEntry}
                                titleLanguage={settings.titleLanguage}
                              />
                            </SearchResultSection>
                          </div>

                          <div className={libraryMediaType === "MANGA" ? "order-1" : "order-2"}>
                            <SearchResultSection
                              title="Manga results"
                              emptyMessage="No manga matches"
                              results={privacySafeResults.manga}
                            >
                              <ResultsGrid
                                results={privacySafeResults.manga}
                                onSelectMedia={(mediaId) =>
                                  handleOpenMediaDetails(mediaId, "MANGA")
                                }
                                trackedEntries={privacySafeTrackedMangaEntries}
                                onQuickAdd={handleQuickAddToList}
                                onEditEntry={setEditingListEntry}
                                titleLanguage={settings.titleLanguage}
                              />
                            </SearchResultSection>
                          </div>
                        </div>
                      )}
                    </div>
                    </HomePage>
                  )}
                </Suspense>
              </div>

              <GlobalScrollToTop
                viewKey={`${currentView}:${selectedMediaType}:${selectedAnimeId ?? "none"}:${homeMode}:${libraryMediaType}`}
              />

              {editingListEntry && (
                <ListEntryModal
                  animeId={editingListEntry.anime_id}
                  mediaType={editingListEntry.media_type === "MANGA" ? "MANGA" : "ANIME"}
                  isOpen={true}
                  entry={editingListEntry}
                  title={getPreferredTitle(
                    {
                      userPreferred: editingListEntry.title_preferred,
                      english: editingListEntry.title_english,
                      romaji: editingListEntry.title_romaji,
                      native: editingListEntry.title_native,
                    },
                    settings.titleLanguage
                  )}
                  totalEpisodes={editingListEntry.episodes ?? null}
                  totalVolumes={
                    editingListEntry.media_type === "MANGA"
                      ? editingListEntry.volumes ?? null
                      : null
                  }
                  onClose={() => setEditingListEntry(null)}
                  onSaved={async () => {
                    setEditingListEntry(null);
                    await loadTrackedEntries();
                    const title = getPreferredTitle(
                      {
                        userPreferred: editingListEntry.title_preferred,
                        english: editingListEntry.title_english,
                        romaji: editingListEntry.title_romaji,
                        native: editingListEntry.title_native,
                      },
                      settings.titleLanguage
                    );
                    showSyncToast("success", "List entry updated", `${title} was updated.`);
                  }}
                  onRemoved={async () => {
                    setEditingListEntry(null);
                    await loadTrackedEntries();
                    const title = getPreferredTitle(
                      {
                        userPreferred: editingListEntry.title_preferred,
                        english: editingListEntry.title_english,
                        romaji: editingListEntry.title_romaji,
                        native: editingListEntry.title_native,
                      },
                      settings.titleLanguage
                    );
                    showSyncToast("success", "List entry removed", `${title} was removed from your list.`);
                  }}
                />
              )}
            </>
          )}
        </div>
        {desktopUpdate.visible && desktopUpdate.info && (
          <UpdateModal
            info={desktopUpdate.info}
            status={desktopUpdate.status}
            progress={desktopUpdate.progress}
            errorMessage={desktopUpdate.errorMessage}
            onDownload={handleDownloadDesktopUpdate}
            onInstall={handleInstallDesktopUpdate}
            onRemindLater={handleRemindDesktopUpdateLater}
          />
        )}
      </div>
    </div>
  );
}

export default App;

function SearchResultSection({
  title,
  emptyMessage,
  description,
  results,
  children,
}: {
  title: string;
  emptyMessage: string;
  description?: string;
  results: SearchMedia[];
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`search-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2
              id={`search-${title.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-lg font-semibold text-white"
            >
              {title}
            </h2>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-white/55">
              {results.length}
            </span>
          </div>
          {description && <p className="mt-1.5 text-xs text-white/40">{description}</p>}
        </div>
      </div>

      {results.length ? (
        children
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-5 py-8 text-center text-sm text-white/40">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

function SearchErrorPanel({
  message,
  isRetrying,
  onRetry,
}: {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return <AsyncStatePanel icon={ExclamationTriangleIcon} title="There was a problem searching AniList." message={message} busy={isRetrying} actionLabel={isRetrying ? "Retrying..." : "Retry"} onAction={onRetry} />;
}

function SearchEmptyPanel({
  query,
  filteredByAdultContent,
}: {
  query: string;
  filteredByAdultContent: boolean;
}) {
  return (
    <div className="flex min-h-72 items-center justify-center px-4 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/55">
          <MagnifyingGlassIcon className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">
          {filteredByAdultContent
            ? "Results hidden by the 18+ filter"
            : "No anime or manga found"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/55">
          {filteredByAdultContent
            ? `Matches for “${query}” were found, but they are hidden by your adult-content preference.`
            : `We couldn't find anything matching “${query}”. Check the spelling or try a shorter title.`}
        </p>
        <p className="mt-4 text-xs text-white/35">
          {filteredByAdultContent
            ? "You can change the 18+ filter in Settings."
            : "Try an English, Romaji, or alternate title."}
        </p>
      </section>
    </div>
  );
}

function getThemeAccent(themeAccent: AppSettings["themeAccent"], customAccentColor?: string) {
  const colors: Record<AppSettings["themeAccent"], string> = {
    violet: "#a78bfa",
    rose: "#fb7185",
    amber: "#fbbf24",
    emerald: "#34d399",
    custom: normalizeAccentColor(customAccentColor),
  };

  return colors[themeAccent];
}

function normalizeAccentColor(value: string | null | undefined) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#a78bfa";
}

function hexToRgb(value: string) {
  const color = normalizeAccentColor(value).slice(1);
  return {
    r: Number.parseInt(color.slice(0, 2), 16),
    g: Number.parseInt(color.slice(2, 4), 16),
    b: Number.parseInt(color.slice(4, 6), 16),
  };
}

function normalizeAppSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const overlayOpacity = Number(value?.overlayOpacity);
  const backgroundDim = Number(value?.backgroundDim);
  const overlayBackgrounds: AppSettings["overlayBackground"][] = [
    "solid",
    "glass",
    "transparent",
  ];
  const navbarStyles: AppSettings["navbarStyle"][] = [
    "integrated",
    "floating",
    "minimal",
  ];
  const browseCardStyles: AppSettings["browseCardStyle"][] = [
    "default",
    "immersive",
    "gallery",
  ];
  const startViews: AppSettings["startView"][] = ["home", "list", "search"];
  const animationLevels: AppSettings["animationLevel"][] = ["full", "reduced", "off"];
  const discoverDensities: AppSettings["discoverDensity"][] = [
    "comfortable",
    "balanced",
    "compact",
  ];
  const cardDensities: AppSettings["homeDensity"][] = [
    "comfortable",
    "balanced",
    "compact",
  ];
  const themeAccents: AppSettings["themeAccent"][] = [
    "violet",
    "rose",
    "amber",
    "emerald",
    "custom",
  ];

  return {
    ...DEFAULT_APP_SETTINGS,
    ...(value ?? {}),
    themeAccent: themeAccents.includes(value?.themeAccent as AppSettings["themeAccent"])
      ? (value?.themeAccent as AppSettings["themeAccent"])
      : DEFAULT_APP_SETTINGS.themeAccent,
    customAccentColor: normalizeAccentColor(value?.customAccentColor),
    overlayOpacity: Number.isFinite(overlayOpacity)
      ? Math.min(100, Math.max(70, Math.round(overlayOpacity)))
      : DEFAULT_APP_SETTINGS.overlayOpacity,
    overlayBackground: overlayBackgrounds.includes(value?.overlayBackground as AppSettings["overlayBackground"])
      ? (value?.overlayBackground as AppSettings["overlayBackground"])
      : DEFAULT_APP_SETTINGS.overlayBackground,
    navbarStyle: navbarStyles.includes(value?.navbarStyle as AppSettings["navbarStyle"])
      ? (value?.navbarStyle as AppSettings["navbarStyle"])
      : DEFAULT_APP_SETTINGS.navbarStyle,
    browseCardStyle: browseCardStyles.includes(value?.browseCardStyle as AppSettings["browseCardStyle"])
      ? (value?.browseCardStyle as AppSettings["browseCardStyle"])
      : DEFAULT_APP_SETTINGS.browseCardStyle,
    backgroundDim: Number.isFinite(backgroundDim)
      ? Math.min(100, Math.max(0, Math.round(backgroundDim)))
      : DEFAULT_APP_SETTINGS.backgroundDim,
    animationLevel: animationLevels.includes(value?.animationLevel as AppSettings["animationLevel"])
      ? (value?.animationLevel as AppSettings["animationLevel"])
      : DEFAULT_APP_SETTINGS.animationLevel,
    compactMode:
      typeof value?.compactMode === "boolean"
        ? value.compactMode
        : DEFAULT_APP_SETTINGS.compactMode,
    discoverDensity: discoverDensities.includes(
      value?.discoverDensity as AppSettings["discoverDensity"]
    )
      ? (value?.discoverDensity as AppSettings["discoverDensity"])
      : DEFAULT_APP_SETTINGS.discoverDensity,
    homeDensity: cardDensities.includes(value?.homeDensity as AppSettings["homeDensity"])
      ? (value?.homeDensity as AppSettings["homeDensity"])
      : DEFAULT_APP_SETTINGS.homeDensity,
    myListDensity: cardDensities.includes(value?.myListDensity as AppSettings["myListDensity"])
      ? (value?.myListDensity as AppSettings["myListDensity"])
      : DEFAULT_APP_SETTINGS.myListDensity,
    startView: startViews.includes(value?.startView as AppSettings["startView"])
      ? (value?.startView as AppSettings["startView"])
      : DEFAULT_APP_SETTINGS.startView,
  };
}

function getThemeAccentSoft(themeAccent: AppSettings["themeAccent"], customAccentColor?: string) {
  const colors: Record<AppSettings["themeAccent"], string> = {
    violet: "rgba(167, 139, 250, 0.16)",
    rose: "rgba(251, 113, 133, 0.16)",
    amber: "rgba(251, 191, 36, 0.16)",
    emerald: "rgba(52, 211, 153, 0.16)",
    custom: (() => {
      const { r, g, b } = hexToRgb(customAccentColor || "#a78bfa");
      return `rgba(${r}, ${g}, ${b}, 0.16)`;
    })(),
  };

  return colors[themeAccent];
}

function getOverlayBackgroundClass(background: AppSettings["overlayBackground"]) {
  switch (background) {
    case "glass":
      return "app-glass backdrop-blur-2xl";
    case "transparent":
      return "app-light-glass backdrop-blur-md";
    default:
      return "";
  }
}

function getAnimationLevelClass(animationLevel: AppSettings["animationLevel"]) {
  switch (animationLevel) {
    case "reduced":
      return "app-motion-reduced";
    case "off":
      return "app-motion-off";
    default:
      return "";
  }
}

function getOverlayBackgroundStyle(
  background: AppSettings["overlayBackground"],
  opacity: number
): CSSProperties {
  const normalizedOpacity = Math.min(100, Math.max(70, opacity)) / 100;

  switch (background) {
    case "glass":
      return {
        backgroundColor: `rgba(18, 18, 18, ${normalizedOpacity * 0.78})`,
        border: "1px solid rgba(255, 255, 255, 0.10)",
      };
    case "transparent":
      return {
        backgroundColor: `rgba(10, 10, 10, ${normalizedOpacity * 0.58})`,
        border: "1px solid rgba(255, 255, 255, 0.08)",
      };
    default:
      return {
        backgroundColor: `rgba(15, 15, 15, ${normalizedOpacity})`,
      };
  }
}

function getOverlayReadabilityStyle(
  background: AppSettings["overlayBackground"],
  dimStrength: number
): CSSProperties {
  const normalizedDim = Math.min(100, Math.max(0, dimStrength)) / 100;
  const glassTop = 0.12 + normalizedDim * 0.62;
  const glassBottom = 0.18 + normalizedDim * 0.68;
  const lightTop = 0.08 + normalizedDim * 0.54;
  const lightBottom = 0.12 + normalizedDim * 0.62;

  switch (background) {
    case "glass":
      return {
        background: `linear-gradient(180deg, rgba(12, 12, 12, ${glassTop.toFixed(2)}), rgba(12, 12, 12, ${glassBottom.toFixed(2)}))`,
      };
    case "transparent":
      return {
        background: `linear-gradient(180deg, rgba(12, 12, 12, ${lightTop.toFixed(2)}), rgba(12, 12, 12, ${lightBottom.toFixed(2)}))`,
      };
    default:
      return {};
  }
}
