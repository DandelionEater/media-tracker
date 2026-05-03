import { useEffect, useState, type CSSProperties } from "react";
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
  kind: "success" | "error";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

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

  const showSyncToast = (
    kind: "success" | "error",
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
          await loadTrackedEntries();
        }
      } finally {
        setCheckingSession(false);
      }
    };

    loadSession();
  }, []);

  const loadTrackedEntries = async () => {
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
  };

  const handleUpdateSettings = async (nextSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = await window.api.updateSettings(nextSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  const handleResetSettings = async () => {
    await handleUpdateSettings(DEFAULT_APP_SETTINGS);
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
                  titleLanguage={settings.titleLanguage}
                />
              ) : currentView === "list" ? (
                <MyListPage
                  onSelectAnime={handleOpenAnimeDetails}
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
                onSaved={async () => {
                  setEditingListEntry(null);
                  await loadTrackedEntries();
                }}
                onRemoved={async () => {
                  setEditingListEntry(null);
                  await loadTrackedEntries();
                }}
              />
            )}
          </>
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
