import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ResultsGrid } from "./components/ResultsGrid";
import { searchAnime } from "./services/anilist";
import AnimeDetails from "./components/AnimeDetails";
import { TopNavbar } from "./components/TopNavbar";
import { HomePage } from "./components/HomePage";
import { AuthScreen } from "./components/AuthScreen";
import { MyListPage } from "./components/MyListPage";
import { ListEntryModal } from "./components/ListEntryModal";
import { SettingsPage, type AppSettings } from "./components/SettingsPage";
import { getPreferredTitle } from "./utils/titlePreference";
import { SyncToast, type SyncToastState } from "./components/SyncToast";
import { UpdateModal } from "./components/UpdateModal";

const DEFAULT_APP_SETTINGS: AppSettings = {
  themeAccent: "cyan",
  titleLanguage: "userPreferred",
  showTrendingCarousel: true,
  autoRotateTrending: true,
  autoScrollHomeShelves: true,
  hideAdultContent: true,
};

type AuthUser = {
  id: number;
  username: string;
  tutorial_dismissed: number;
};

type AniListImportResult = {
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
};

type ClearListResult = {
  ok: boolean;
  message: string;
  removedCount?: number;
};

type AppView = "home" | "list" | "details" | "settings";

type TrackedAnimeEntry = {
  anime_id: number;
  status: "planned" | "watching" | "completed" | "paused" | "dropped";
  is_favorite?: number | boolean;
  progress: number;
  score: number | null;
  notes: string | null;
  title_romaji?: string | null;
  title_english?: string | null;
  title_native?: string | null;
  title_preferred?: string | null;
  episodes?: number | null;
};

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

function App() {
  const [results, setResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAnimeId, setSelectedAnimeId] = useState<number | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [trackedEntries, setTrackedEntries] = useState<TrackedAnimeEntry[]>([]);
  const [editingListEntry, setEditingListEntry] = useState<TrackedAnimeEntry | null>(null);
  const [previousView, setPreviousView] = useState<AppView>("home");
  const [previousAnimeId, setPreviousAnimeId] = useState<number | null>(null);
  const [detailsReturnView, setDetailsReturnView] = useState<AppView>("home");
  const [showTutorial, setShowTutorial] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [syncToast, setSyncToast] = useState<SyncToastState>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateState>({
    visible: false,
    status: "available",
    info: null,
    progress: 0,
    errorMessage: null,
  });
  const sessionWarningKeysRef = useRef<Set<string>>(new Set());

  const showSyncToast = (
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
  };

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

  const loadTrackedEntries = useCallback(async () => {
    try {
      const result = await window.api.getMyList();

      if (!result.ok) {
        setTrackedEntries([]);
        return;
      }

      setTrackedEntries(result.entries || []);
    } catch (error) {
      console.error("Failed to load tracked anime entries:", error);
      setTrackedEntries([]);
    }
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const appSettings = await window.api.getSettings();
        setSettings(appSettings);

        const session = await window.api.getSession();

        if (session.authenticated && session.user) {
          setAuthUser({
            id: session.user.id,
            username: session.user.username,
            tutorial_dismissed: session.user.tutorial_dismissed,
          });

          setShowTutorial(!Boolean(session.user.tutorial_dismissed));
          notifyIfSessionIsExpiring(session.expiresAt);
          await loadTrackedEntries();
        }
      } finally {
        setCheckingSession(false);
      }
    };

    loadSession();
  }, [loadTrackedEntries]);

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
  }, [authUser, loadTrackedEntries]);

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

  const notifyIfSessionIsExpiring = (expiresAt?: number) => {
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
  };

  const handleUpdateSettings = async (nextSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = await window.api.updateSettings(nextSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error("Failed to update settings:", error);
      showSyncToast("error", "Settings update failed", "Failed to save your settings.");
    }
  };

  const handleResetSettings = async () => {
    try {
      const updatedSettings = await window.api.updateSettings(DEFAULT_APP_SETTINGS);
      setSettings(updatedSettings);
      showSyncToast("success", "Settings reset", "Preferences were reset to defaults.");
    } catch (error) {
      console.error("Failed to reset settings:", error);
      showSyncToast("error", "Settings reset failed", "Failed to reset your settings.");
    }
  };

  const handleImportAniList = async (
    username: string,
    selectedStatuses: string[],
    selectedAnimeIds: number[]
  ): Promise<AniListImportResult> => {
    const result = await window.api.importAniList(
      username,
      selectedStatuses,
      selectedAnimeIds
    );

    if (result.ok) {
      await loadTrackedEntries();
      showSyncToast("success", "AniList import complete", result.message);
    } else {
      showSyncToast("error", "AniList import failed", result.message);
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
      result.ok ? "success" : "error",
      result.ok ? "AniList update complete" : "AniList update failed",
      result.message
    );

    return result;
  };

  const handleClearMyList = async (): Promise<ClearListResult> => {
    const result = await window.api.clearMyList();

    if (result.ok) {
      await loadTrackedEntries();
      showSyncToast("success", "List cleared", result.message);
    } else {
      showSyncToast("error", "List clear failed", result.message);
    }

    return result;
  };

  const handleAuthenticated = async (user: {
    id: number;
    username: string;
    tutorial_dismissed: number;
  }) => {
    setAuthUser(user);
    setShowTutorial(!Boolean(user.tutorial_dismissed));
    setCurrentView("home");
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
    setResults([]);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setPreviousView("home");
    setPreviousAnimeId(null);
    setDetailsReturnView("home");
    setShowTutorial(true);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setResults([]);
      if (selectedAnimeId === null) {
        setCurrentView("home");
      }
      return;
    }

    const data = await searchAnime(query, settings.hideAdultContent);
    setResults(data);
    setSelectedAnimeId(null);
    setCurrentView("home");
  };

  const handleQuickAddToList = async (anime: {
    id: number;
    title: {
      romaji?: string;
      english?: string;
      userPreferred?: string;
    };
    coverImage: {
      large: string;
    };
    episodes?: number | null;
    format?: string | null;
    averageScore?: number | null;
    season?: string | null;
    seasonYear?: number | null;
  }) => {
    try {
      const cacheResult = await window.api.cacheMinimalAnime(anime);

      if (!cacheResult.ok) {
        console.error("Failed to cache anime before quick add:", cacheResult.message);
        return;
      }

      const result = await window.api.saveMyListEntry(anime.id, {
        status: "planned",
        progress: 0,
        score: null,
        notes: "",
      });

      if (!result.ok) {
        console.error("Failed to quick add anime to list:", result.message);
        showSyncToast("error", "List update failed", result.message);
        return;
      }

      await loadTrackedEntries();
      showSyncToast("success", "List updated", result.message);
    } catch (error) {
      console.error("Failed to quick add anime to list:", error);
      showSyncToast("error", "List update failed", "Failed to add anime to your list.");
    }
  };

  const handleLogout = async () => {
    await window.api.logout();
    setAuthUser(null);
    setShowTutorial(false);
    setSearchQuery("");
    setResults([]);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setTrackedEntries([]);
    setPreviousAnimeId(null);
    setDetailsReturnView("home");
    setPreviousView("home");
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

  const handleOpenAnimeDetails = (animeId: number) => {
    setDetailsReturnView(currentView);
    setSelectedAnimeId(animeId);
    setCurrentView("details");
  };

  const handleOpenMyList = () => {
    if (currentView === "list") {
      if (previousView === "details") {
        setSelectedAnimeId(previousAnimeId);
      }

      setCurrentView(previousView);
      return;
    }

    setPreviousView(currentView);

    if (currentView === "details") {
      setPreviousAnimeId(selectedAnimeId);
    } else {
      setPreviousAnimeId(null);
    }

    setCurrentView("list");
  };

  const handleOpenHome = () => {
    setSearchQuery("");
    setResults([]);
    setSelectedAnimeId(null);
    setCurrentView("home");
    setPreviousView("home");
    setPreviousAnimeId(null);
    setDetailsReturnView("home");
  };

  const handleOpenSettings = () => {
    if (currentView === "settings") {
      setCurrentView(previousView === "settings" ? "home" : previousView);
      return;
    }

    setPreviousView(currentView);

    if (currentView === "details") {
      setPreviousAnimeId(selectedAnimeId);
    } else {
      setPreviousAnimeId(null);
    }

    setCurrentView("settings");
  };

  const handleBackFromDetails = async () => {
    setSelectedAnimeId(null);
    await loadTrackedEntries();

    if (detailsReturnView === "list") {
      setCurrentView("list");
      return;
    }

    if (searchQuery.trim()) {
      setCurrentView("home");
      return;
    }

    setResults([]);
    setSearchQuery("");
    setCurrentView("home");
  };

  if (checkingSession) {
    return (
      <div className="w-screen h-screen bg-transparent">
        <div className="flex h-full w-full items-center justify-center rounded-3xl bg-[#0f0f0f] text-white">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-screen h-screen bg-transparent"
      style={
        {
          "--app-accent": getThemeAccent(settings.themeAccent),
          "--app-accent-soft": getThemeAccentSoft(settings.themeAccent),
        } as CSSProperties
      }
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl bg-[#0f0f0f] shadow-2xl">
        {!authUser ? (
          <AuthScreen onAuthenticated={handleAuthenticated} />
        ) : (
          <>
            <TopNavbar
              query={searchQuery}
              onSearch={handleSearch}
              onClear={() => {
                setSearchQuery("");
                setResults([]);
                if (currentView === "home") {
                  setSelectedAnimeId(null);
                }
              }}
              username={authUser.username}
              notifications={notifications}
              onReadNotification={handleReadNotification}
              onClearNotifications={handleClearNotifications}
              onLogout={handleLogout}
              currentView={currentView}
              onOpenHome={handleOpenHome}
              onOpenMyList={handleOpenMyList}
              onOpenSettings={handleOpenSettings}
            />

            <SyncToast toast={syncToast} />

            <div className="min-h-0 flex-1">
              {currentView === "details" && selectedAnimeId !== null ? (
                <AnimeDetails
                  animeId={selectedAnimeId}
                  onBack={handleBackFromDetails}
                  onListChanged={loadTrackedEntries}
                  titleLanguage={settings.titleLanguage}
                />
              ) : currentView === "list" ? (
                <MyListPage
                  entries={trackedEntries}
                  onSelectAnime={handleOpenAnimeDetails}
                  onRefreshList={loadTrackedEntries}
                  onListChanged={loadTrackedEntries}
                  onNotify={showSyncToast}
                  titleLanguage={settings.titleLanguage}
                />
              ) : currentView === "settings" ? (
                <SettingsPage
                  username={authUser.username}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onShowWelcomeScreen={handleShowWelcomeScreen}
                  onResetSettings={handleResetSettings}
                  onImportAniList={handleImportAniList}
                  onLinkAniListAccount={handleLinkAniListAccount}
                  onRunSyncNow={handleRunSyncNow}
                  onPullFromAniList={handlePullFromAniList}
                  onClearMyList={handleClearMyList}
                />
              ) : (
                <HomePage
                  hasResults={results.length > 0}
                  showTutorial={showTutorial}
                  onDismissTutorial={handleDismissTutorial}
                  trackedEntries={trackedEntries}
                  onSelectAnime={handleOpenAnimeDetails}
                  onQuickAddAnime={handleQuickAddToList}
                  onEditEntry={setEditingListEntry}
                  titleLanguage={settings.titleLanguage}
                  showTrendingCarousel={settings.showTrendingCarousel}
                  autoRotateTrending={settings.autoRotateTrending}
                  autoScrollHomeShelves={settings.autoScrollHomeShelves}
                  hideAdultContent={settings.hideAdultContent}
                >
                  <div className="scroll-container h-full overflow-y-auto px-6 py-6">
                    <ResultsGrid
                      results={results}
                      onSelectAnime={handleOpenAnimeDetails}
                      trackedEntries={trackedEntries}
                      onQuickAdd={handleQuickAddToList}
                      onEditEntry={setEditingListEntry}
                      titleLanguage={settings.titleLanguage}
                    />
                  </div>
                </HomePage>
              )}
            </div>

            {editingListEntry && (
              <ListEntryModal
                animeId={editingListEntry.anime_id}
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
                onClose={() => setEditingListEntry(null)}
                onSaved={async (_entry, message) => {
                  setEditingListEntry(null);
                  await loadTrackedEntries();
                  showSyncToast("success", "List updated", message || "List entry updated.");
                }}
                onRemoved={async (message) => {
                  setEditingListEntry(null);
                  await loadTrackedEntries();
                  showSyncToast("success", "List updated", message || "Anime removed from your list.");
                }}
              />
            )}

          </>
        )}
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

function getThemeAccent(themeAccent: AppSettings["themeAccent"]) {
  const colors: Record<AppSettings["themeAccent"], string> = {
    cyan: "#67e8f9",
    violet: "#a78bfa",
    rose: "#fb7185",
    amber: "#fbbf24",
    emerald: "#34d399",
  };

  return colors[themeAccent];
}

function getThemeAccentSoft(themeAccent: AppSettings["themeAccent"]) {
  const colors: Record<AppSettings["themeAccent"], string> = {
    cyan: "rgba(103, 232, 249, 0.16)",
    violet: "rgba(167, 139, 250, 0.16)",
    rose: "rgba(251, 113, 133, 0.16)",
    amber: "rgba(251, 191, 36, 0.16)",
    emerald: "rgba(52, 211, 153, 0.16)",
  };

  return colors[themeAccent];
}
