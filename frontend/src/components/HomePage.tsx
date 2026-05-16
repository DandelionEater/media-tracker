import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  HeartIcon,
  PlayCircleIcon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  TvIcon,
} from "@heroicons/react/24/outline";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";
import { getMigratedLocalStorageItem } from "../utils/localStorageMigration";

const HOME_TAB_STORAGE_KEY = "seenary.home-tab";
const HOME_TAB_LEGACY_STORAGE_KEY = "media-tracker.home-tab";
const HOME_DISCOVER_STATE_STORAGE_KEY = "seenary.discover-state";
const HOME_DISCOVER_STATE_LEGACY_STORAGE_KEY = "media-tracker.discover-state";
const TRENDING_CYCLE_MS = 6500;

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
  cover_image_large?: string | null;
  banner_image?: string | null;
  episodes?: number | null;
  format?: string | null;
  average_score?: number | null;
  mean_score?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  duration?: number | null;
  source?: string | null;
  country_of_origin?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  genres?: string[];
  season?: string | null;
  season_year?: number | null;
  updated_at?: string | null;
  recommendations?: RecommendationEntry[];
};

type RecommendationEntry = {
  rating?: number | null;
  mediaRecommendation?: RecommendationMedia | null;
};

type RecommendationMedia = {
  id: number;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  } | null;
  coverImage?: {
    large?: string | null;
  } | null;
  description?: string | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
};

type RecommendationSource = {
  animeId: number;
  title: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  };
  coverImage?: string | null;
  format?: string | null;
  score?: number | null;
};

type RecommendationCandidate = {
  animeId: number;
  title?: RecommendationMedia["title"];
  coverImage?: RecommendationMedia["coverImage"];
  description?: string | null;
  format?: string | null;
  episodes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  strength: number;
  sourceCount: number;
  sourceTitles: string[];
  source?: RecommendationSource | null;
  sourceStrength: number;
};

type TrendingAnime = {
  id: number;
  isAdult?: boolean;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  };
  coverImage?: {
    large?: string | null;
  };
  bannerImage?: string | null;
  episodes?: number | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  meanScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  nextAiringEpisode?: {
    episode?: number | null;
    airingAt?: number | null;
  } | null;
};

type HomeTab = "personal" | "discover";

type DiscoverShelf = {
  id: string;
  title: string;
  description: string;
  pills: string[];
  items: TrendingAnime[];
};

type DiscoverPageInfo = {
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
  total?: number | null;
  perPage?: number | null;
};

type DiscoverShelfPageState = {
  shelf: DiscoverShelf;
  items: TrendingAnime[];
  pageInfo: DiscoverPageInfo | null;
  page: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  scrollTop: number;
  warning?: string | null;
};

type SavedDiscoverState = {
  activeDiscoverShelfId: string | null;
  discoverShelfPages: Record<string, DiscoverShelfPageState>;
  overviewScrollTop: number;
  overviewRailScrolls: Record<string, number>;
};

type HomePageProps = {
  hasResults: boolean;
  showTutorial: boolean;
  onDismissTutorial: (dontShowAgain: boolean) => void | Promise<void>;
  trackedEntries: TrackedAnimeEntry[];
  onSelectAnime: (animeId: number) => void;
  onQuickAddAnime: (anime: QuickAddAnime) => void;
  onEditEntry: (entry: TrackedAnimeEntry) => void;
  titleLanguage: TitleLanguage;
  showTrendingCarousel: boolean;
  autoRotateTrending: boolean;
  autoScrollHomeShelves: boolean;
  hideAdultContent: boolean;
  initialScrollTop: number;
  resetScrollOnMount: boolean;
  onScrollRestored: () => void;
  onScrollPositionChange: (scrollTop: number) => void;
  children?: ReactNode;
};

type QuickAddAnime = {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
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
};

export function HomePage({
  hasResults,
  showTutorial,
  onDismissTutorial,
  trackedEntries,
  onSelectAnime,
  onQuickAddAnime,
  onEditEntry,
  titleLanguage,
  showTrendingCarousel,
  autoRotateTrending,
  autoScrollHomeShelves,
  hideAdultContent,
  initialScrollTop,
  resetScrollOnMount,
  onScrollRestored,
  onScrollPositionChange,
  children,
}: HomePageProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [activeHomeTab, setActiveHomeTab] = useState<HomeTab>(() => {
    const savedTab = getMigratedLocalStorageItem(
      HOME_TAB_STORAGE_KEY,
      HOME_TAB_LEGACY_STORAGE_KEY
    );
    return savedTab === "discover" ? "discover" : "personal";
  });
  const [trendingAnime, setTrendingAnime] = useState<TrendingAnime[]>([]);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [activeTrendingIndex, setActiveTrendingIndex] = useState(0);
  const [trendingCycleKey, setTrendingCycleKey] = useState(0);
  const [isTrendingPaused, setIsTrendingPaused] = useState(false);
  const [discoverShelves, setDiscoverShelves] = useState<DiscoverShelf[]>([]);
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false);
  const savedDiscoverState = useMemo(() => readSavedDiscoverState(), []);
  const [activeDiscoverShelfId, setActiveDiscoverShelfId] = useState<string | null>(
    savedDiscoverState?.activeDiscoverShelfId ?? null
  );
  const [discoverShelfPages, setDiscoverShelfPages] = useState<
    Record<string, DiscoverShelfPageState>
  >(savedDiscoverState?.discoverShelfPages ?? {});
  const homeScrollRef = useRef<HTMLDivElement | null>(null);
  const discoverRailRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const discoverOverviewScrollTop = useRef(savedDiscoverState?.overviewScrollTop ?? 0);
  const discoverOverviewRailScrolls = useRef<Record<string, number>>(
    savedDiscoverState?.overviewRailScrolls ?? {}
  );
  const trendingTimerStartedAt = useRef<number | null>(null);
  const trendingRemainingMs = useRef(TRENDING_CYCLE_MS);
  const skipNextDiscoverRestore = useRef(false);

  useLayoutEffect(() => {
    const targetScrollTop = resetScrollOnMount ? 0 : initialScrollTop;

    if (resetScrollOnMount) {
      skipNextDiscoverRestore.current = true;
    }

    window.requestAnimationFrame(() => {
      if (homeScrollRef.current) {
        homeScrollRef.current.scrollTop = targetScrollTop;
      }

      onScrollPositionChange(targetScrollTop);

      if (resetScrollOnMount) {
        onScrollRestored();
      }
    });
  }, [
    initialScrollTop,
    onScrollPositionChange,
    onScrollRestored,
    resetScrollOnMount,
  ]);

  function handleChangeHomeTab(tab: HomeTab) {
    setActiveHomeTab(tab);
    window.localStorage.setItem(HOME_TAB_STORAGE_KEY, tab);
  }

  function pauseTrendingRotation() {
    if (!autoRotateTrending || isTrendingPaused) return;

    if (trendingTimerStartedAt.current !== null) {
      const elapsed = Date.now() - trendingTimerStartedAt.current;
      trendingRemainingMs.current = Math.max(0, trendingRemainingMs.current - elapsed);
    }

    setIsTrendingPaused(true);
  }

  function resumeTrendingRotation() {
    if (!isTrendingPaused) return;
    setIsTrendingPaused(false);
  }

  function saveDiscoverOverviewPosition() {
    discoverOverviewScrollTop.current = homeScrollRef.current?.scrollTop ?? 0;
    discoverOverviewRailScrolls.current = Object.fromEntries(
      Object.entries(discoverRailRefs.current).map(([shelfId, rail]) => [
        shelfId,
        rail?.scrollLeft ?? 0,
      ])
    );
  }

  function saveDiscoverStateSnapshot(
    nextActiveDiscoverShelfId = activeDiscoverShelfId,
    nextDiscoverShelfPages = discoverShelfPages
  ) {
    const scrollTop = homeScrollRef.current?.scrollTop ?? 0;
    const pages =
      nextActiveDiscoverShelfId && nextDiscoverShelfPages[nextActiveDiscoverShelfId]
        ? {
            ...nextDiscoverShelfPages,
            [nextActiveDiscoverShelfId]: {
              ...nextDiscoverShelfPages[nextActiveDiscoverShelfId],
              scrollTop,
            },
          }
        : nextDiscoverShelfPages;

    window.localStorage.setItem(
      HOME_DISCOVER_STATE_STORAGE_KEY,
      JSON.stringify({
        activeDiscoverShelfId: nextActiveDiscoverShelfId,
        discoverShelfPages: pages,
        overviewScrollTop: discoverOverviewScrollTop.current,
        overviewRailScrolls: discoverOverviewRailScrolls.current,
      } satisfies SavedDiscoverState)
    );
  }

  function restoreDiscoverOverviewPosition() {
    window.requestAnimationFrame(() => {
      if (homeScrollRef.current) {
        homeScrollRef.current.scrollTop = discoverOverviewScrollTop.current;
      }

      for (const [shelfId, scrollLeft] of Object.entries(
        discoverOverviewRailScrolls.current
      )) {
        const rail = discoverRailRefs.current[shelfId];
        if (rail) {
          rail.scrollLeft = scrollLeft;
        }
      }
    });
  }

  function saveActiveDiscoverListPosition() {
    if (!activeDiscoverShelfId) return;

    const scrollTop = homeScrollRef.current?.scrollTop ?? 0;
    setDiscoverShelfPages((current) => {
      const existing = current[activeDiscoverShelfId];
      if (!existing) return current;

      return {
        ...current,
        [activeDiscoverShelfId]: {
          ...existing,
          scrollTop,
        },
      };
    });
  }

  async function loadDiscoverShelfPage(
    shelf: DiscoverShelf,
    page: number,
    scrollTop = 0,
    append = false
  ) {
    setDiscoverShelfPages((current) => ({
      ...current,
      [shelf.id]: {
        shelf,
        items: current[shelf.id]?.items ?? shelf.items,
        pageInfo: current[shelf.id]?.pageInfo ?? null,
        page,
        isLoading: !append,
        isLoadingMore: append,
        scrollTop,
        warning: current[shelf.id]?.warning ?? null,
      },
    }));

    try {
      const data = await window.api.getDiscoverShelfAnime(
        shelf.id,
        page,
        hideAdultContent
      );

      setDiscoverShelfPages((current) => ({
        ...current,
        [shelf.id]: {
          shelf: {
            id: data.id ?? shelf.id,
            title: data.title ?? shelf.title,
            description: data.description ?? shelf.description,
            pills: Array.isArray(data.pills) ? data.pills : shelf.pills,
            items: Array.isArray(data.items) ? data.items : shelf.items,
          },
          items: append
            ? mergeAnimeItems(current[shelf.id]?.items ?? [], data.items ?? [])
            : Array.isArray(data.items)
            ? data.items
            : [],
          pageInfo: data.pageInfo ?? null,
          page,
          isLoading: false,
          isLoadingMore: false,
          scrollTop,
          warning: typeof data.warning === "string" ? data.warning : null,
        },
      }));
    } catch (error) {
      console.error("Failed to load discover shelf page:", error);
      setDiscoverShelfPages((current) => ({
        ...current,
        [shelf.id]: {
          ...(current[shelf.id] ?? {
            shelf,
            items: shelf.items,
            pageInfo: null,
            page,
            isLoadingMore: false,
            scrollTop,
          }),
          isLoading: false,
          isLoadingMore: false,
        },
      }));
    }
  }

  function handleOpenDiscoverShelf(shelf: DiscoverShelf) {
    saveDiscoverOverviewPosition();
    setActiveDiscoverShelfId(shelf.id);

    const existing = discoverShelfPages[shelf.id];
    if (!existing) {
      void loadDiscoverShelfPage(shelf, 1, 0);
      window.requestAnimationFrame(() => {
        if (homeScrollRef.current) {
          homeScrollRef.current.scrollTop = 0;
        }
      });
      return;
    }

    window.requestAnimationFrame(() => {
      if (homeScrollRef.current) {
        homeScrollRef.current.scrollTop = existing.scrollTop;
      }
    });
  }

  function handleCloseDiscoverShelf() {
    saveActiveDiscoverListPosition();
    setActiveDiscoverShelfId(null);
    restoreDiscoverOverviewPosition();
  }

  function handleLoadMoreDiscoverShelf(shelf: DiscoverShelf) {
    const state = discoverShelfPages[shelf.id];
    if (!state?.pageInfo?.hasNextPage || state.isLoading || state.isLoadingMore) {
      return;
    }

    void loadDiscoverShelfPage(
      shelf,
      state.pageInfo.currentPage + 1,
      homeScrollRef.current?.scrollTop ?? state.scrollTop,
      true
    );
  }

  function handleSelectAnimeFromHome(animeId: number) {
    saveActiveDiscoverListPosition();
    saveDiscoverStateSnapshot();
    onSelectAnime(animeId);
  }

  useEffect(() => {
    saveDiscoverStateSnapshot();
  }, [activeDiscoverShelfId, discoverShelfPages]);

  useEffect(() => {
    if (resetScrollOnMount) return;
    if (skipNextDiscoverRestore.current) {
      skipNextDiscoverRestore.current = false;
      return;
    }
    if (activeHomeTab !== "discover") return;

    window.requestAnimationFrame(() => {
      if (activeDiscoverShelfId && discoverShelfPages[activeDiscoverShelfId]) {
        if (homeScrollRef.current) {
          homeScrollRef.current.scrollTop =
            discoverShelfPages[activeDiscoverShelfId].scrollTop;
        }
        return;
      }

      restoreDiscoverOverviewPosition();
    });
  }, [activeDiscoverShelfId, activeHomeTab, resetScrollOnMount]);

  useEffect(() => {
    let mounted = true;

    async function loadTrendingAnime() {
      setIsTrendingLoading(true);

      try {
        const data = await window.api.getTrendingAnime(hideAdultContent);

        if (mounted) {
          setTrendingAnime(data || []);
          setActiveTrendingIndex(0);
          setTrendingCycleKey(0);
          setIsTrendingPaused(false);
          trendingRemainingMs.current = TRENDING_CYCLE_MS;
        }
      } catch (error) {
        console.error("Failed to load trending anime:", error);
        if (mounted) {
          setTrendingAnime([]);
        }
      } finally {
        if (mounted) {
          setIsTrendingLoading(false);
        }
      }
    }

    if (
      !hasResults &&
      !showTutorial &&
      showTrendingCarousel &&
      activeHomeTab === "discover"
    ) {
      loadTrendingAnime();
    } else if (!showTrendingCarousel || activeHomeTab !== "discover") {
      setTrendingAnime([]);
      setIsTrendingLoading(false);
      setActiveTrendingIndex(0);
      setTrendingCycleKey(0);
      setIsTrendingPaused(false);
      trendingRemainingMs.current = TRENDING_CYCLE_MS;
    }

    return () => {
      mounted = false;
    };
  }, [hasResults, showTutorial, showTrendingCarousel, hideAdultContent, activeHomeTab]);

  useEffect(() => {
    let mounted = true;

    async function loadDiscoverAnime() {
      setIsDiscoverLoading(true);

      try {
        const data = await window.api.getDiscoverAnime(hideAdultContent);

        if (mounted) {
          setDiscoverShelves(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to load discover anime:", error);
        if (mounted) {
          setDiscoverShelves([]);
        }
      } finally {
        if (mounted) {
          setIsDiscoverLoading(false);
        }
      }
    }

    if (!hasResults && !showTutorial && activeHomeTab === "discover") {
      loadDiscoverAnime();
    }

    return () => {
      mounted = false;
    };
  }, [activeHomeTab, hasResults, hideAdultContent, showTutorial]);

  useEffect(() => {
    if (!autoRotateTrending || trendingAnime.length <= 1 || isTrendingPaused) {
      trendingTimerStartedAt.current = null;
      return;
    }

    trendingTimerStartedAt.current = Date.now();

    const timer = window.setTimeout(() => {
      trendingRemainingMs.current = TRENDING_CYCLE_MS;
      trendingTimerStartedAt.current = null;
      setActiveTrendingIndex((current) => (current + 1) % trendingAnime.length);
      setTrendingCycleKey((current) => current + 1);
    }, trendingRemainingMs.current);

    return () => window.clearTimeout(timer);
  }, [
    autoRotateTrending,
    trendingAnime.length,
    activeTrendingIndex,
    trendingCycleKey,
    isTrendingPaused,
  ]);

  function handleSelectTrendingIndex(index: number) {
    trendingRemainingMs.current = TRENDING_CYCLE_MS;
    trendingTimerStartedAt.current = null;
    setActiveTrendingIndex(index);
    setTrendingCycleKey((current) => current + 1);
  }

  const watching = useMemo(
    () => trackedEntries.filter((entry) => entry.status === "watching"),
    [trackedEntries]
  );
  const planned = useMemo(
    () => trackedEntries.filter((entry) => entry.status === "planned"),
    [trackedEntries]
  );
  const completed = useMemo(
    () => trackedEntries.filter((entry) => entry.status === "completed"),
    [trackedEntries]
  );
  const paused = useMemo(
    () => trackedEntries.filter((entry) => entry.status === "paused"),
    [trackedEntries]
  );
  const dropped = useMemo(
    () => trackedEntries.filter((entry) => entry.status === "dropped"),
    [trackedEntries]
  );
  const favoriteCount = useMemo(
    () => trackedEntries.filter((entry) => Boolean(entry.is_favorite)).length,
    [trackedEntries]
  );
  const watchedEpisodes = useMemo(
    () =>
      trackedEntries.reduce((sum, entry) => {
        if (entry.status !== "watching" && entry.status !== "completed") {
          return sum;
        }

        return sum + Math.max(0, entry.progress || 0);
      }, 0),
    [trackedEntries]
  );
  const averagePersonalScore = useMemo(() => {
    const scoredEntries = trackedEntries.filter(
      (entry) => typeof entry.score === "number" && entry.score > 0
    );

    if (!scoredEntries.length) return null;

    const total = scoredEntries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);
    return total / scoredEntries.length;
  }, [trackedEntries]);
  const recentlyUpdated = useMemo(() => trackedEntries.slice(0, 6), [trackedEntries]);
  const personalizedRecommendations = useMemo(
    () => buildPersonalizedRecommendations(trackedEntries, titleLanguage),
    [trackedEntries, titleLanguage]
  );
  const trackedAnimeIds = useMemo(
    () => new Set(trackedEntries.map((entry) => entry.anime_id)),
    [trackedEntries]
  );
  const trackedEntryByAnimeId = useMemo(
    () => new Map(trackedEntries.map((entry) => [entry.anime_id, entry])),
    [trackedEntries]
  );
  const spotlight = useMemo(() => {
    return (
      watching.find((entry) => entry.banner_image || entry.cover_image_large) ||
      planned.find((entry) => entry.banner_image || entry.cover_image_large) ||
      trackedEntries.find((entry) => entry.banner_image || entry.cover_image_large) ||
      null
    );
  }, [planned, trackedEntries, watching]);

  if (hasResults) {
    return <>{children}</>;
  }

  if (showTutorial) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-white/35">
            Welcome
          </p>

          <h1 className="text-4xl font-bold tracking-tight text-white">
            Your anime list starts here.
          </h1>

          <p className="mt-4 text-base leading-7 text-white/60">
            Search titles, open detail pages, build your list, and keep your
            library in one clean desktop app.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <TutorialCard
              icon={SparklesIcon}
              title="Search fast"
              body="Use the top bar to search for anime and jump into details fast."
            />
            <TutorialCard
              icon={BookmarkIcon}
              title="Build your list"
              body="Add shows, track progress, and keep everything tied to your account."
            />
            <TutorialCard
              icon={FireIcon}
              title="Stay focused"
              body="Minimal, overlay-friendly design meant to feel quick and clean."
            />
          </div>

          <label className="mt-8 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-transparent"
            />
            Don&apos;t show this again
          </label>

          <div className="mt-6">
            <button
              onClick={() => onDismissTutorial(dontShowAgain)}
              className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={homeScrollRef}
      onScroll={(event) => {
        onScrollPositionChange(event.currentTarget.scrollTop);
      }}
      className="scroll-container h-full overflow-y-auto px-6 py-24 text-white"
    >
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-white/35">Home</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              {activeHomeTab === "personal" ? "Personal overview" : "Discover anime"}
            </h1>
          </div>

          <HomeModeSwitch activeTab={activeHomeTab} onChange={handleChangeHomeTab} />
        </section>

        {activeHomeTab === "personal" ? (
          <>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_0.9fr]">
              <SpotlightPanel
                entry={spotlight}
                onSelectAnime={handleSelectAnimeFromHome}
                titleLanguage={titleLanguage}
              />

              <AccountOverviewPanel
                total={trackedEntries.length}
                watchedEpisodes={watchedEpisodes}
                averageScore={averagePersonalScore}
                favorites={favoriteCount}
              />
            </section>

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatTile icon={PlayCircleIcon} label="Watching" value={watching.length} />
              <StatTile icon={BookmarkIcon} label="Planned" value={planned.length} />
              <StatTile icon={CheckCircleIcon} label="Completed" value={completed.length} />
              <StatTile icon={ClockIcon} label="Paused" value={paused.length} />
              <StatTile icon={HeartIcon} label="Dropped" value={dropped.length} />
            </section>

            {trackedEntries.length ? (
              <>
                <HomeShelf
                  title="Continue Watching"
                  icon={PlayCircleIcon}
                  entries={watching.slice(0, 15)}
                  emptyText="Move something into Watching and it will appear here."
                  onSelectAnime={handleSelectAnimeFromHome}
                  variant="medium"
                  titleLanguage={titleLanguage}
                  carousel
                  autoScroll={autoScrollHomeShelves}
                />

                <HomeShelf
                  title="Planned Picks"
                  icon={BookmarkIcon}
                  entries={planned.slice(0, 15)}
                  emptyText="Add titles as Planned to build a clean watch queue."
                  onSelectAnime={handleSelectAnimeFromHome}
                  variant="medium"
                  titleLanguage={titleLanguage}
                  carousel
                  autoScroll={autoScrollHomeShelves}
                />

                <SinceYouLikedSection
                  entries={personalizedRecommendations}
                  onSelectAnime={handleSelectAnimeFromHome}
                  titleLanguage={titleLanguage}
                />

                <section>
                  <HomeShelf
                    title="Recently Updated"
                    icon={CalendarDaysIcon}
                    entries={recentlyUpdated}
                    emptyText="Your latest list activity will collect here."
                    onSelectAnime={handleSelectAnimeFromHome}
                    variant="gridCompact"
                    titleLanguage={titleLanguage}
                  />
                </section>
              </>
            ) : (
              <EmptyHomeState />
            )}
          </>
        ) : activeDiscoverShelfId ? (
          <DiscoverShelfListPage
            state={discoverShelfPages[activeDiscoverShelfId]}
            fallbackShelf={discoverShelves.find(
              (shelf) => shelf.id === activeDiscoverShelfId
            )}
            onBack={handleCloseDiscoverShelf}
            onSelectAnime={handleSelectAnimeFromHome}
            onQuickAddAnime={onQuickAddAnime}
            onEditEntry={onEditEntry}
            onLoadMore={handleLoadMoreDiscoverShelf}
            trackedAnimeIds={trackedAnimeIds}
            trackedEntryByAnimeId={trackedEntryByAnimeId}
            titleLanguage={titleLanguage}
          />
        ) : (
          <>
            {showTrendingCarousel && (
              <TrendingCarousel
                items={trendingAnime}
                activeIndex={activeTrendingIndex}
                onSelectIndex={handleSelectTrendingIndex}
                onSelectAnime={handleSelectAnimeFromHome}
                titleLanguage={titleLanguage}
                autoRotate={autoRotateTrending}
                cycleKey={trendingCycleKey}
                isPaused={isTrendingPaused}
                isLoading={isTrendingLoading}
                onPause={pauseTrendingRotation}
                onResume={resumeTrendingRotation}
              />
            )}

            <DiscoverFilters />

            {isDiscoverLoading && !discoverShelves.length ? (
              <DiscoverShelvesSkeleton />
            ) : discoverShelves.length ? (
              discoverShelves.map((shelf) => (
                <DiscoverAnimeShelf
                  key={shelf.id}
                  shelf={shelf}
                  onSelectAnime={handleSelectAnimeFromHome}
                  onQuickAddAnime={onQuickAddAnime}
                  onEditEntry={onEditEntry}
                  onSeeAll={handleOpenDiscoverShelf}
                  trackedAnimeIds={trackedAnimeIds}
                  trackedEntryByAnimeId={trackedEntryByAnimeId}
                  titleLanguage={titleLanguage}
                  autoScroll={autoScrollHomeShelves}
                  railRef={(element) => {
                    discoverRailRefs.current[shelf.id] = element;
                  }}
                />
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
                Discovery could not load right now. Try again in a moment.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HomeModeSwitch({
  activeTab,
  onChange,
}: {
  activeTab: HomeTab;
  onChange: (tab: HomeTab) => void;
}) {
  const tabs: Array<{ value: HomeTab; label: string }> = [
    { value: "personal", label: "Personal" },
    { value: "discover", label: "Discover" },
  ];

  return (
    <div className="grid w-full grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1 md:w-72">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
            activeTab === tab.value
              ? "bg-white text-black shadow-lg"
              : "text-white/55 hover:bg-white/8 hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function AccountOverviewPanel({
  total,
  watchedEpisodes,
  averageScore,
  favorites,
}: {
  total: number;
  watchedEpisodes: number;
  averageScore: number | null;
  favorites: number;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/70">
          <ChartBarIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Account Overview</h2>
          <p className="text-sm text-white/40">Your list at a glance</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <OverviewMetric label="Library" value={formatNumber(total)} />
        <OverviewMetric label="Episodes" value={formatNumber(watchedEpisodes)} />
        <OverviewMetric
          label="Avg Score"
          value={averageScore ? formatScore10(averageScore) : "-"}
        />
        <OverviewMetric label="Favorites" value={formatNumber(favorites)} />
      </div>
    </section>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/35">{label}</p>
    </div>
  );
}

function DiscoverFilters() {
  const filters = [
    "Seasonal",
    "Popular",
    "Top Rated",
    "Upcoming",
    "Movies",
    "TV",
  ];

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      {filters.map((filter) => (
        <span
          key={filter}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/65"
        >
          {filter}
        </span>
      ))}
    </section>
  );
}

function DiscoverAnimeShelf({
  shelf,
  onSelectAnime,
  onQuickAddAnime,
  onEditEntry,
  onSeeAll,
  trackedAnimeIds,
  trackedEntryByAnimeId,
  titleLanguage,
  autoScroll,
  railRef,
}: {
  shelf: DiscoverShelf;
  onSelectAnime: (animeId: number) => void;
  onQuickAddAnime: (anime: QuickAddAnime) => void;
  onEditEntry: (entry: TrackedAnimeEntry) => void;
  onSeeAll: (shelf: DiscoverShelf) => void;
  trackedAnimeIds: Set<number>;
  trackedEntryByAnimeId: Map<number, TrackedAnimeEntry>;
  titleLanguage: TitleLanguage;
  autoScroll: boolean;
  railRef: (element: HTMLDivElement | null) => void;
}) {
  const localRailRef = useRef<HTMLDivElement | null>(null);
  const manualPauseUntil = useRef(0);
  const [isInteracting, setIsInteracting] = useState(false);

  function rememberRail(element: HTMLDivElement | null) {
    localRailRef.current = element;
    railRef(element);
  }

  function scrollRail(source: "manual" | "auto" = "manual") {
    const rail = localRailRef.current;
    if (!rail) return;

    if (source === "manual") {
      manualPauseUntil.current = Date.now() + 12000;
    }

    const firstCard = rail.querySelector<HTMLElement>("[data-discover-shelf-card]");
    const cardWidth = firstCard?.offsetWidth ?? 176;
    const gap = 16;
    const distance = cardWidth + gap;
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;

    if (rail.scrollLeft >= maxScrollLeft - distance * 0.5) {
      rail.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    rail.scrollBy({ left: distance, behavior: "smooth" });
  }

  useEffect(() => {
    if (!autoScroll || shelf.items.length <= 5) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      if (isInteracting || Date.now() < manualPauseUntil.current) {
        return;
      }

      scrollRail("auto");
    }, 8500);

    return () => window.clearInterval(timer);
  }, [autoScroll, isInteracting, shelf.items.length]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/70">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{shelf.title}</h2>
              <p className="text-sm text-white/40">{shelf.description}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {shelf.pills.map((pill) => (
            <MetaPill key={`${shelf.id}-${pill}`}>{pill}</MetaPill>
          ))}
          <button
            type="button"
            onClick={() => onSeeAll(shelf)}
            className="rounded-full border border-white/10 bg-white px-4 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/55"
          >
            See all
          </button>
        </div>
      </div>

      <div
        ref={rememberRail}
        onMouseEnter={() => setIsInteracting(true)}
        onMouseLeave={() => setIsInteracting(false)}
        onFocusCapture={() => setIsInteracting(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsInteracting(false);
          }
        }}
        className="scroll-container flex gap-4 overflow-x-auto overflow-y-hidden pb-2"
      >
        {shelf.items.map((anime) => (
          <div
            key={`${shelf.id}-${anime.id}`}
            data-discover-shelf-card
            className="shrink-0"
          >
            <DiscoverAnimeCard
              anime={anime}
              onSelectAnime={onSelectAnime}
              onQuickAddAnime={onQuickAddAnime}
              onEditEntry={onEditEntry}
              titleLanguage={titleLanguage}
              isTracked={trackedAnimeIds.has(anime.id)}
              trackedEntry={trackedEntryByAnimeId.get(anime.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function DiscoverShelfListPage({
  state,
  fallbackShelf,
  onBack,
  onSelectAnime,
  onQuickAddAnime,
  onEditEntry,
  onLoadMore,
  trackedAnimeIds,
  trackedEntryByAnimeId,
  titleLanguage,
}: {
  state?: DiscoverShelfPageState;
  fallbackShelf?: DiscoverShelf;
  onBack: () => void;
  onSelectAnime: (animeId: number) => void;
  onQuickAddAnime: (anime: QuickAddAnime) => void;
  onEditEntry: (entry: TrackedAnimeEntry) => void;
  onLoadMore: (shelf: DiscoverShelf) => void;
  trackedAnimeIds: Set<number>;
  trackedEntryByAnimeId: Map<number, TrackedAnimeEntry>;
  titleLanguage: TitleLanguage;
}) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const shelf = state?.shelf ?? fallbackShelf;
  const items = state?.items ?? fallbackShelf?.items ?? [];
  const pageInfo = state?.pageInfo;
  const hasNextPage = Boolean(pageInfo?.hasNextPage);

  useEffect(() => {
    if (!shelf || !hasNextPage || state?.isLoading || state?.isLoadingMore) return;

    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore(shelf);
        }
      },
      { rootMargin: "600px 0px" }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore, shelf, state?.isLoading, state?.isLoadingMore]);

  if (!shelf) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
        Discovery list could not be opened.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </button>
          <h2 className="text-3xl font-bold tracking-tight text-white">{shelf.title}</h2>
          <p className="mt-2 text-sm text-white/45">{shelf.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {shelf.pills.map((pill) => (
            <MetaPill key={`list-${shelf.id}-${pill}`}>{pill}</MetaPill>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-white/45">
          {state?.isLoading
            ? "Loading titles..."
            : `${formatNumber(items.length)} loaded${
                pageInfo?.total ? ` of ${formatNumber(pageInfo.total)}` : ""
              }`}
        </p>
      </div>

      {state?.warning && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/80">
          {state.warning}
        </div>
      )}

      {state?.isLoading && !items.length ? (
        <DiscoverGridSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
          {items.map((anime) => (
            <DiscoverAnimeCard
              key={`${shelf.id}-full-${anime.id}`}
              anime={anime}
              onSelectAnime={onSelectAnime}
              onQuickAddAnime={onQuickAddAnime}
              onEditEntry={onEditEntry}
              titleLanguage={titleLanguage}
              variant="grid"
              isTracked={trackedAnimeIds.has(anime.id)}
              trackedEntry={trackedEntryByAnimeId.get(anime.id)}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          <button
            type="button"
            disabled={Boolean(state?.isLoadingMore)}
            onClick={() => onLoadMore(shelf)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {state?.isLoadingMore ? "Loading more..." : "Load more"}
          </button>
        </div>
      )}
    </section>
  );
}

function DiscoverAnimeCard({
  anime,
  onSelectAnime,
  onQuickAddAnime,
  onEditEntry,
  titleLanguage,
  variant = "rail",
  isTracked = false,
  trackedEntry,
}: {
  anime: TrendingAnime;
  onSelectAnime: (animeId: number) => void;
  onQuickAddAnime: (anime: QuickAddAnime) => void;
  onEditEntry: (entry: TrackedAnimeEntry) => void;
  titleLanguage: TitleLanguage;
  variant?: "rail" | "grid";
  isTracked?: boolean;
  trackedEntry?: TrackedAnimeEntry;
}) {
  const title = getTrendingTitle(anime, titleLanguage);
  const score = anime.averageScore || anime.meanScore;
  const season = anime.season && anime.seasonYear
    ? `${formatEnum(anime.season)} ${anime.seasonYear}`
    : anime.seasonYear
    ? String(anime.seasonYear)
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectAnime(anime.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectAnime(anime.id);
        }
      }}
      className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 text-left shadow-xl transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
        variant === "rail" ? "min-w-44 max-w-44" : "w-full"
      }`}
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-white/5">
        {anime.coverImage?.large ? (
          <img
            src={anime.coverImage.large}
            alt={title}
            className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full bg-white/5" />
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (trackedEntry) {
              onEditEntry(trackedEntry);
              return;
            }

            if (!isTracked) {
              onQuickAddAnime(toQuickAddAnime(anime));
            }
          }}
          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--app-accent)]/35 bg-black/55 text-[var(--app-accent)] shadow-lg backdrop-blur transition hover:bg-[var(--app-accent-soft)] disabled:cursor-default disabled:hover:bg-black/55"
          title={trackedEntry ? "Edit list entry" : "Add to list"}
          aria-label={trackedEntry ? "Edit list entry" : "Add to list"}
        >
          {trackedEntry || isTracked ? (
            <BookmarkIcon className="h-4 w-4" />
          ) : (
            <PlusIcon className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="flex min-h-30 flex-col p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-white">
          {title}
        </h3>
        <div className="mt-auto flex min-h-16 flex-wrap content-end gap-1.5 pt-3">
          {anime.format && <SmallInfoPill icon={TvIcon}>{anime.format}</SmallInfoPill>}
          {score ? (
            <SmallInfoPill icon={StarIcon}>Avg {formatScore10(score / 10)}</SmallInfoPill>
          ) : null}
          {season && <SmallInfoPill icon={CalendarDaysIcon}>{season}</SmallInfoPill>}
          {anime.popularity ? (
            <SmallInfoPill icon={FireIcon}>{formatNumber(anime.popularity)}</SmallInfoPill>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DiscoverShelvesSkeleton() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading discovery shelves">
      {Array.from({ length: 3 }).map((_, shelfIndex) => (
        <section key={shelfIndex}>
          <div className="mb-4 h-14 w-72 rounded-3xl bg-white/8" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((__, cardIndex) => (
              <div
                key={cardIndex}
                className="min-w-44 overflow-hidden rounded-3xl border border-white/10 bg-white/5"
              >
                <div className="aspect-[2/3] bg-white/8" />
                <div className="space-y-3 p-3">
                  <div className="h-4 w-28 rounded bg-white/10" />
                  <div className="h-4 w-20 rounded bg-white/8" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DiscoverGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5" aria-busy="true">
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"
        >
          <div className="aspect-[2/3] bg-white/8" />
          <div className="space-y-3 p-3">
            <div className="h-4 w-28 rounded bg-white/10" />
            <div className="h-4 w-20 rounded bg-white/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TutorialCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left shadow-xl">
      <Icon className="mb-4 h-6 w-6 text-white/75" />
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/55">{body}</p>
    </div>
  );
}

function TrendingCarousel({
  items,
  activeIndex,
  onSelectIndex,
  onSelectAnime,
  titleLanguage,
  autoRotate,
  cycleKey,
  isPaused,
  isLoading,
  onPause,
  onResume,
}: {
  items: TrendingAnime[];
  activeIndex: number;
  onSelectIndex: (index: number) => void;
  onSelectAnime: (animeId: number) => void;
  titleLanguage: TitleLanguage;
  autoRotate: boolean;
  cycleKey: number;
  isPaused: boolean;
  isLoading: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  const activeItem = items[activeIndex];

  if (isLoading && !activeItem) return <TrendingCarouselSkeleton />;
  if (!activeItem) return null;

  const title = getTrendingTitle(activeItem, titleLanguage);
  const image = activeItem.bannerImage || activeItem.coverImage?.large;
  const score = activeItem.averageScore || activeItem.meanScore;
  const nextEpisode = activeItem.nextAiringEpisode?.episode;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocusCapture={onPause}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onResume();
        }
      }}
    >
      <button
        type="button"
        onClick={() => onSelectAnime(activeItem.id)}
        className="group block h-80 w-full text-left focus:outline-none focus:ring-2 focus:ring-white/55"
      >
        <HeroBackdrop
          bannerImage={activeItem.bannerImage ?? null}
          coverImage={activeItem.coverImage?.large ?? null}
          title={title}
          className="absolute inset-0"
        />

        <div className="absolute inset-0 bg-linear-to-r from-[#0f0f0f] via-[#0f0f0f]/70 to-[#0f0f0f]/20" />
        <div className="absolute inset-0 bg-linear-to-t from-[#0f0f0f] via-transparent to-transparent" />

        <div className="relative flex h-full max-w-3xl flex-col justify-end p-8 pb-14">
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70 backdrop-blur">
            <FireIcon className="h-4 w-4" />
            Trending now
          </span>

          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            {title}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            {activeItem.isAdult && <MetaPill>18+</MetaPill>}
            {activeItem.format && <MetaPill>{activeItem.format}</MetaPill>}
            {activeItem.season && activeItem.seasonYear && (
              <MetaPill>
                {formatEnum(activeItem.season)} {activeItem.seasonYear}
              </MetaPill>
            )}
            {score ? <MetaPill>Avg {formatScore10(score / 10)}</MetaPill> : null}
            {nextEpisode ? <MetaPill>Episode {nextEpisode} next</MetaPill> : null}
          </div>
        </div>
      </button>

      <div className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectIndex(index)}
            className="h-2 w-9 overflow-hidden rounded-full bg-white/15 transition-all duration-200 hover:w-11 hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/55"
              title={getTrendingTitle(item, titleLanguage)}
            >
              <span
                key={`${cycleKey}-${activeIndex}-${index}`}
                className="block h-full rounded-full bg-[var(--app-accent)]"
                style={{
                width: index === activeIndex ? "100%" : "0%",
                animation:
                  autoRotate && index === activeIndex
                    ? `carousel-pill-fill ${TRENDING_CYCLE_MS}ms linear forwards`
                    : undefined,
                animationPlayState: isPaused ? "paused" : "running",
              }}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function TrendingCarouselSkeleton() {
  return (
    <section
      className="relative h-80 overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl"
      aria-busy="true"
      aria-label="Loading trending anime"
    >
      <div className="absolute inset-0 bg-linear-to-br from-white/8 via-white/[0.03] to-black/30" />
      <div className="carousel-skeleton-shimmer absolute inset-0" />
      <div className="absolute inset-0 bg-linear-to-r from-[#0f0f0f]/90 via-[#0f0f0f]/65 to-[#0f0f0f]/25" />

      <div className="relative flex h-full max-w-3xl flex-col justify-end p-8 pb-14">
        <div className="mb-4 h-7 w-40 rounded-full bg-white/10" />
        <div className="h-10 w-[min(28rem,75%)] rounded-xl bg-white/14" />
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="h-7 w-14 rounded-full bg-white/10" />
          <div className="h-7 w-24 rounded-full bg-white/10" />
          <div className="h-7 w-20 rounded-full bg-white/10" />
          <div className="h-7 w-32 rounded-full bg-white/10" />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-3">
        <span className="carousel-loading-ring h-5 w-5 rounded-full border-2 border-white/15 border-t-[var(--app-accent)]" />
        <div className="flex gap-2" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="h-2 w-9 rounded-full bg-white/15" />
          ))}
        </div>
      </div>
    </section>
  );
}

function SpotlightPanel({
  entry,
  onSelectAnime,
  titleLanguage,
}: {
  entry: TrackedAnimeEntry | null;
  onSelectAnime: (animeId: number) => void;
  titleLanguage: TitleLanguage;
}) {
  if (!entry) {
    return (
      <section className="relative min-h-72 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <div className="absolute inset-0 bg-linear-to-br from-white/8 via-transparent to-black/30" />
        <div className="relative flex h-full flex-col justify-end">
          <p className="text-sm uppercase tracking-[0.3em] text-white/35">
            Home
          </p>
          <h1 className="mt-3 max-w-xl text-3xl font-bold tracking-tight">
            Start with a search, then make this space yours.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60">
            Saved titles will turn this into a personal dashboard with progress,
            planned picks, and recent activity.
          </p>
        </div>
      </section>
    );
  }

  const title = getEntryTitle(entry, titleLanguage);
  const progress = getProgressLabel(entry);
  const image = entry.banner_image || entry.cover_image_large;

  return (
    <button
      type="button"
      onClick={() => onSelectAnime(entry.anime_id)}
      className="group relative min-h-72 overflow-hidden rounded-3xl border border-white/10 bg-white/5 text-left shadow-xl focus:outline-none focus:ring-2 focus:ring-white/55"
    >
      <HeroBackdrop
        bannerImage={entry.banner_image ?? null}
        coverImage={entry.cover_image_large ?? null}
        title={title}
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-linear-to-r from-[#0f0f0f] via-[#0f0f0f]/75 to-[#0f0f0f]/20" />
      <div className="absolute inset-0 bg-linear-to-t from-[#0f0f0f] via-transparent to-transparent" />

      <div className="relative flex min-h-72 flex-col justify-end p-8">
        <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/65 backdrop-blur">
          <FireIcon className="h-4 w-4" />
          Spotlight
        </span>
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-white">
          {title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <MetaPill>{formatStatus(entry.status)}</MetaPill>
          {progress && <MetaPill>{progress}</MetaPill>}
          {entry.average_score !== null && entry.average_score !== undefined && (
            <MetaPill>{entry.average_score}% avg</MetaPill>
          )}
        </div>
      </div>
    </button>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
      <Icon className="h-5 w-5 text-white/60" />
      <p className="mt-5 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-white/45">{label}</p>
    </div>
  );
}

function HomeShelf({
  title,
  icon: Icon,
  entries,
  emptyText,
  onSelectAnime,
  variant = "medium",
  titleLanguage,
  mode = "library",
  carousel = false,
  autoScroll = false,
}: {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  entries: TrackedAnimeEntry[] | RecommendationCandidate[];
  emptyText: string;
  onSelectAnime: (animeId: number) => void;
  variant?: "medium" | "compact" | "gridCompact" | "list";
  titleLanguage: TitleLanguage;
  mode?: "library" | "recommendations";
  carousel?: boolean;
  autoScroll?: boolean;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const manualPauseUntil = useRef(0);
  const [isInteracting, setIsInteracting] = useState(false);

  const shouldUseCarousel =
    carousel && variant === "medium" && mode === "library" && entries.length > 0;

  function scrollRail(direction: "left" | "right", source: "manual" | "auto" = "manual") {
    const rail = railRef.current;
    if (!rail) return;

    if (source === "manual") {
      manualPauseUntil.current = Date.now() + 12000;
    }

    const firstCard = rail.querySelector<HTMLElement>("[data-home-shelf-card]");
    const cardWidth = firstCard?.offsetWidth ?? Math.max(220, rail.clientWidth * 0.35);
    const gap = 20;
    const distance = cardWidth + gap;
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;

    if (direction === "right" && rail.scrollLeft >= maxScrollLeft - distance * 0.5) {
      rail.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    rail.scrollBy({
      left: direction === "right" ? distance : -distance,
      behavior: "smooth",
    });
  }

  useEffect(() => {
    if (!shouldUseCarousel || !autoScroll || entries.length <= 5) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      if (isInteracting || Date.now() < manualPauseUntil.current) {
        return;
      }

      scrollRail("right", "auto");
    }, 8500);

    return () => window.clearInterval(timer);
  }, [autoScroll, entries.length, isInteracting, shouldUseCarousel]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/70">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="text-sm text-white/40">{entries.length || emptyText}</p>
          </div>
        </div>

        {shouldUseCarousel && entries.length > 5 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollRail("left")}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-white/65 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
              title={`Scroll ${title} left`}
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollRail("right")}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-white/65 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
              title={`Scroll ${title} right`}
            >
              <ArrowRightIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {entries.length ? (
        <div
          ref={shouldUseCarousel ? railRef : undefined}
          onMouseEnter={() => setIsInteracting(true)}
          onMouseLeave={() => setIsInteracting(false)}
          onFocusCapture={() => setIsInteracting(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsInteracting(false);
            }
          }}
          className={
            shouldUseCarousel
              ? "scroll-container flex snap-x gap-5 overflow-x-auto overflow-y-hidden pb-2 scroll-smooth"
              : variant === "gridCompact"
                ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              : variant === "compact" || variant === "list"
                ? "grid grid-cols-1 gap-3"
                : "grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5"
          }
        >
          {entries.map((entry, index) => (
            mode === "recommendations" ? (
              <RecommendationLibraryCard
                key={`${title}-recommendation-${index}`}
                entry={entry as RecommendationCandidate}
                onSelectAnime={onSelectAnime}
                titleLanguage={titleLanguage}
              />
            ) : (
              <div
                key={`${title}-${(entry as TrackedAnimeEntry).anime_id}`}
                data-home-shelf-card={shouldUseCarousel ? true : undefined}
                className={shouldUseCarousel ? "min-w-0 shrink-0 snap-start" : ""}
                style={
                  shouldUseCarousel
                    ? { flexBasis: "calc((100% - 5rem) / 5)" }
                    : undefined
                }
              >
                <HomeAnimeCard
                  entry={entry as TrackedAnimeEntry}
                  onSelectAnime={onSelectAnime}
                  variant={variant}
                  titleLanguage={titleLanguage}
                />
              </div>
            )
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function HomeAnimeCard({
  entry,
  onSelectAnime,
  variant = "medium",
  titleLanguage,
}: {
  entry: TrackedAnimeEntry;
  onSelectAnime: (animeId: number) => void;
  variant?: "medium" | "compact" | "gridCompact" | "list";
  titleLanguage: TitleLanguage;
}) {
  const title = getEntryTitle(entry, titleLanguage);
  const progress = getProgressLabel(entry);
  const score = getDisplayScore(entry);
  const subMeta = buildEntryMeta(entry);

  if (variant === "compact" || variant === "gridCompact" || variant === "list") {
    return (
      <button
        type="button"
        onClick={() => onSelectAnime(entry.anime_id)}
        className={`group flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-white/5 text-left shadow-xl transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
          variant === "gridCompact" ? "min-h-34 p-4" : "p-3"
        }`}
      >
        <PosterImage
          entry={entry}
          title={title}
          className={variant === "gridCompact" ? "h-28 w-20" : "h-24 w-16"}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 truncate text-xs text-white/45">
            {variant === "list" && subMeta.length
              ? subMeta.join(" - ")
              : `${formatStatus(entry.status)}${progress ? ` - ${progress}` : ""}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {score && <SmallInfoPill icon={StarIcon}>{score}</SmallInfoPill>}
            {entry.source && (
              <SmallInfoPill icon={BookmarkIcon}>{formatEnum(entry.source)}</SmallInfoPill>
            )}
            {entry.popularity && (
              <SmallInfoPill icon={HeartIcon}>{formatNumber(entry.popularity)}</SmallInfoPill>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectAnime(entry.anime_id)}
      className="group block w-full text-left focus:outline-none focus:ring-2 focus:ring-white/55"
    >
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-xl">
        <PosterImage entry={entry} title={title} className="h-72 w-full" />
      </div>
      <div className="mt-3">
        <h3 className="line-clamp-2 min-h-10 text-base font-semibold leading-5 text-white">
          {title}
        </h3>
        <p className="mt-1 truncate text-sm text-white/45">
          {progress || subMeta.join(" - ") || formatStatus(entry.status)}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.format && <SmallInfoPill icon={TvIcon}>{entry.format}</SmallInfoPill>}
          {score && <SmallInfoPill icon={StarIcon}>{score}</SmallInfoPill>}
          {entry.duration && (
            <SmallInfoPill icon={ClockIcon}>{entry.duration} min</SmallInfoPill>
          )}
          {entry.source && (
            <SmallInfoPill icon={BookmarkIcon}>{formatEnum(entry.source)}</SmallInfoPill>
          )}
        </div>
      </div>
    </button>
  );
}

function RecommendationLibraryCard({
  entry,
  onSelectAnime,
  titleLanguage,
}: {
  entry: RecommendationCandidate;
  onSelectAnime: (animeId: number) => void;
  titleLanguage: TitleLanguage;
}) {
  const title = getPreferredTitle(entry.title, titleLanguage);
  const meta = [
    entry.format,
    entry.season && entry.seasonYear
      ? `${formatEnum(entry.season)} ${entry.seasonYear}`
      : entry.seasonYear
      ? `${entry.seasonYear}`
      : null,
    entry.episodes ? `${entry.episodes} eps` : null,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={() => onSelectAnime(entry.animeId)}
      className="group flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-3 text-left shadow-xl transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55"
    >
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/5">
        {entry.coverImage?.large ? (
          <img
            src={entry.coverImage.large}
            alt={title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-white/5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 truncate text-xs text-white/45">
          {entry.sourceTitles[0]
            ? `Because you liked ${entry.sourceTitles[0]}`
            : meta.join(" - ") || "Recommendation"}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meta.length > 0 && (
            <SmallInfoPill icon={TvIcon}>{meta.join(" - ")}</SmallInfoPill>
          )}
          {typeof entry.averageScore === "number" && entry.averageScore > 0 && (
            <SmallInfoPill icon={StarIcon}>
              Avg {formatScore10(entry.averageScore / 10)}
            </SmallInfoPill>
          )}
          <SmallInfoPill icon={ArrowTrendingUpIcon}>
            {entry.sourceCount} match{entry.sourceCount === 1 ? "" : "es"}
          </SmallInfoPill>
        </div>
      </div>
    </button>
  );
}

function SinceYouLikedSection({
  entries,
  onSelectAnime,
  titleLanguage,
}: {
  entries: RecommendationCandidate[];
  onSelectAnime: (animeId: number) => void;
  titleLanguage: TitleLanguage;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/70">
          <ArrowTrendingUpIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Since You Liked...</h2>
          <p className="text-sm text-white/40">
            Personal next-watch suggestions built from your strongest ratings.
          </p>
        </div>
      </div>

      {entries.length ? (
        <div className="space-y-4">
          {entries.slice(0, 4).map((entry) => (
            <SinceYouLikedPairCard
              key={`since-you-liked-${entry.animeId}`}
              entry={entry}
              onSelectAnime={onSelectAnime}
              titleLanguage={titleLanguage}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
          Score and favorite a few shows you liked to get more personal next-watch suggestions.
        </div>
      )}
    </section>
  );
}

function SinceYouLikedPairCard({
  entry,
  onSelectAnime,
  titleLanguage,
}: {
  entry: RecommendationCandidate;
  onSelectAnime: (animeId: number) => void;
  titleLanguage: TitleLanguage;
}) {
  const recommendedTitle = getPreferredTitle(entry.title, titleLanguage);
  const sourceTitle = entry.source
    ? getPreferredTitle(entry.source.title, titleLanguage)
    : "Favorite pick";
  const recommendedMeta = [
    entry.format,
    entry.episodes ? `${entry.episodes} eps` : null,
    typeof entry.averageScore === "number" && entry.averageScore > 0
      ? `Avg ${formatScore10(entry.averageScore / 10)}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <button
          type="button"
          onClick={() => entry.source && onSelectAnime(entry.source.animeId)}
          disabled={!entry.source}
          className="flex min-w-0 items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:bg-white/8 disabled:cursor-default disabled:hover:bg-white/[0.03] lg:basis-[29%] lg:max-w-[29%]"
        >
          <div className="h-28 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/5">
            {entry.source?.coverImage ? (
              <img
                src={entry.source.coverImage}
                alt={sourceTitle}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-white/5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-white/35">
              You liked
            </p>
            <h3 className="mt-2 line-clamp-2 text-base font-semibold text-white">
              {sourceTitle}
            </h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {entry.source?.format && (
                <SmallInfoPill icon={TvIcon}>{entry.source.format}</SmallInfoPill>
              )}
              {typeof entry.source?.score === "number" && entry.source.score > 0 && (
                <SmallInfoPill icon={StarIcon}>Mine {entry.source.score}</SmallInfoPill>
              )}
            </div>
          </div>
        </button>

        <div className="flex items-center justify-center text-white/30 lg:w-12">
          <ArrowRightIcon className="h-6 w-6" />
        </div>

        <button
          type="button"
          onClick={() => onSelectAnime(entry.animeId)}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:bg-white/8 lg:basis-[71%]"
        >
          <div className="h-32 w-22 shrink-0 overflow-hidden rounded-2xl bg-white/5">
            {entry.coverImage?.large ? (
              <img
                src={entry.coverImage.large}
                alt={recommendedTitle}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-white/5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-white/35">
              Try next
            </p>
            <h3 className="mt-2 line-clamp-2 text-lg font-semibold text-white">
              {recommendedTitle}
            </h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {recommendedMeta.map((item) => (
                <SmallInfoPill key={`${entry.animeId}-${item}`} icon={item.startsWith("Avg ") ? StarIcon : TvIcon}>
                  {item}
                </SmallInfoPill>
              ))}
            </div>
            <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/50">
              {getRecommendationSummary(entry.description)}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

function EmptyHomeState() {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-xl">
      <SparklesIcon className="mx-auto h-8 w-8 text-white/55" />
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
        Your home page is ready for its first title.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/55">
        Search from the top bar, open a detail page, and add something to your
        list. Continue Watching, Planned Picks, and recent activity will fill in
        from there.
      </p>
    </section>
  );
}

function PosterImage({
  entry,
  title,
  className,
}: {
  entry: TrackedAnimeEntry;
  title: string;
  className: string;
}) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-2xl bg-white/5 ${className}`}>
      {entry.cover_image_large ? (
        <img
          src={entry.cover_image_large}
          alt={title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="h-full w-full bg-white/5" />
      )}
    </div>
  );
}

function HeroBackdrop({
  bannerImage,
  coverImage,
  title,
  className,
}: {
  bannerImage?: string | null;
  coverImage?: string | null;
  title: string;
  className?: string;
}) {
  const [useBanner, setUseBanner] = useState(Boolean(bannerImage));

  useEffect(() => {
    setUseBanner(Boolean(bannerImage));
  }, [bannerImage]);

  const handleBannerLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const hasWeakWidth = image.naturalWidth > 0 && image.naturalWidth < 1100;
    const hasWeakHeight = image.naturalHeight > 0 && image.naturalHeight < 320;
    const hasWeakArea =
      image.naturalWidth > 0 &&
      image.naturalHeight > 0 &&
      image.naturalWidth * image.naturalHeight < 500000;

    if ((hasWeakWidth && hasWeakHeight) || hasWeakArea) {
      setUseBanner(false);
    }
  };

  if (useBanner && bannerImage) {
    return (
      <img
        src={bannerImage}
        alt={title}
        onLoad={handleBannerLoad}
        onError={() => setUseBanner(false)}
        className={`${className ?? ""} h-full w-full object-cover object-center opacity-65 transition duration-500 group-hover:scale-[1.01] group-hover:opacity-75`}
      />
    );
  }

  if (coverImage) {
    return (
      <div className={`${className ?? ""} overflow-hidden bg-white/5`}>
        <img
          src={coverImage}
          alt={title}
          className="h-full w-full scale-[1.06] object-cover object-center opacity-32 blur-[1.5px] transition duration-500 group-hover:scale-[1.08] group-hover:opacity-42"
        />
      </div>
    );
  }

  return <div className={`${className ?? ""} bg-white/5`} />;
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/75 backdrop-blur">
      {children}
    </span>
  );
}

function SmallInfoPill({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] text-white/60">
      <Icon className="h-3.5 w-3.5 text-white/35" />
      {children}
    </span>
  );
}

function buildPersonalizedRecommendations(
  entries: TrackedAnimeEntry[],
  titleLanguage: TitleLanguage
) {
  const libraryIds = new Set(entries.map((entry) => entry.anime_id));
  const genreWeights = buildGenreWeights(entries);
  const candidates = new Map<number, RecommendationCandidate>();

  for (const entry of entries) {
    if (entry.status === "dropped") continue;

    const sourceStrength = getTasteStrength(entry, genreWeights);
    if (sourceStrength <= 0) continue;

    for (const recommendation of entry.recommendations ?? []) {
      const media = recommendation.mediaRecommendation;
      if (!media?.id || libraryIds.has(media.id)) continue;

      const existing = candidates.get(media.id);
      const recommendationStrength =
        sourceStrength +
        (typeof recommendation.rating === "number" ? recommendation.rating / 25 : 0) +
        (typeof media.averageScore === "number" ? media.averageScore / 40 : 0);
      const sourceTitle = getRecommendationSourceTitle(entry, titleLanguage);

      if (existing) {
        existing.strength += recommendationStrength;
        existing.sourceCount += 1;
        existing.averageScore = Math.max(
          existing.averageScore ?? 0,
          media.averageScore ?? 0
        );
        if (sourceTitle && !existing.sourceTitles.includes(sourceTitle)) {
          existing.sourceTitles.push(sourceTitle);
        }
        if (recommendationStrength > existing.sourceStrength) {
          existing.sourceStrength = recommendationStrength;
          existing.source = buildRecommendationSource(entry);
          existing.description = media.description ?? existing.description ?? null;
        }
        continue;
      }

      candidates.set(media.id, {
        animeId: media.id,
        title: media.title,
        coverImage: media.coverImage,
        description: media.description ?? null,
        format: media.format ?? null,
        episodes: media.episodes ?? null,
        season: media.season ?? null,
        seasonYear: media.seasonYear ?? null,
        averageScore: media.averageScore ?? null,
        strength: recommendationStrength,
        sourceCount: 1,
        sourceTitles: sourceTitle ? [sourceTitle] : [],
        source: buildRecommendationSource(entry),
        sourceStrength: recommendationStrength,
      });
    }
  }

  return [...candidates.values()]
    .sort((a, b) => {
      if (b.strength !== a.strength) {
        return b.strength - a.strength;
      }

      return (b.averageScore ?? 0) - (a.averageScore ?? 0);
    })
    .slice(0, 6);
}

function buildGenreWeights(entries: TrackedAnimeEntry[]) {
  const weights = new Map<string, number>();

  for (const entry of entries) {
    if (entry.status === "dropped" || !entry.genres?.length) continue;

    const baseWeight =
      typeof entry.score === "number" && entry.score > 0
        ? entry.score / 10
        : typeof entry.average_score === "number" && entry.average_score > 0
        ? entry.average_score / 100
        : entry.status === "completed" || entry.status === "watching"
        ? 0.45
        : 0.2;

    for (const genre of entry.genres) {
      weights.set(genre, (weights.get(genre) ?? 0) + baseWeight);
    }
  }

  return weights;
}

function getTasteStrength(
  entry: TrackedAnimeEntry,
  genreWeights: Map<string, number>
) {
  const personalScore =
    typeof entry.score === "number" && entry.score > 0
      ? entry.score / 10
      : typeof entry.average_score === "number" && entry.average_score > 0
      ? entry.average_score / 100
      : 0;

  const genreBonus =
    entry.genres?.reduce((sum, genre) => sum + (genreWeights.get(genre) ?? 0), 0) ?? 0;

  return personalScore * 2 + genreBonus * 0.35;
}

function getRecommendationSourceTitle(
  entry: TrackedAnimeEntry,
  titleLanguage: TitleLanguage
) {
  if (hasNegativePersonalSignal(entry)) {
    return null;
  }

  return getEntryTitle(entry, titleLanguage);
}

function buildRecommendationSource(entry: TrackedAnimeEntry): RecommendationSource | null {
  if (
    !entry.title_preferred &&
    !entry.title_english &&
    !entry.title_romaji &&
    !entry.title_native
  ) {
    return null;
  }

  return {
    animeId: entry.anime_id,
    title: {
      userPreferred: entry.title_preferred,
      english: entry.title_english,
      romaji: entry.title_romaji,
      native: entry.title_native,
    },
    coverImage: entry.cover_image_large ?? null,
    format: entry.format ?? null,
    score: entry.score ?? null,
  };
}

function getRecommendationSummary(description?: string | null) {
  const cleaned = stripHtml(description);

  if (!cleaned) {
    return "A strong match based on what you rated highly in your library.";
  }

  return cleaned;
}

function stripHtml(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasNegativePersonalSignal(entry: TrackedAnimeEntry) {
  return typeof entry.score === "number" && entry.score > 0 && entry.score <= 4;
}

function getEntryTitle(entry: TrackedAnimeEntry, titleLanguage: TitleLanguage) {
  return getPreferredTitle(
    {
      userPreferred: entry.title_preferred,
      english: entry.title_english,
      romaji: entry.title_romaji,
      native: entry.title_native,
    },
    titleLanguage
  );
}

function getTrendingTitle(anime: TrendingAnime, titleLanguage: TitleLanguage) {
  return getPreferredTitle(anime.title, titleLanguage);
}

function getProgressLabel(entry: TrackedAnimeEntry) {
  if (
    entry.status !== "watching" &&
    entry.status !== "paused" &&
    entry.status !== "completed"
  ) {
    return null;
  }

  if (entry.episodes) {
    return `${entry.progress} / ${entry.episodes} eps`;
  }

  return `${entry.progress} eps`;
}

function formatStatus(status: TrackedAnimeEntry["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function buildEntryMeta(entry: TrackedAnimeEntry) {
  return [
    entry.format,
    entry.season && entry.season_year
      ? `${formatEnum(entry.season)} ${entry.season_year}`
      : entry.season_year
      ? `${entry.season_year}`
      : null,
    entry.duration ? `${entry.duration} min` : null,
    entry.source ? formatEnum(entry.source) : null,
  ].filter(Boolean) as string[];
}

function formatEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

function getDisplayScore(entry: TrackedAnimeEntry) {
  if (typeof entry.score === "number" && entry.score > 0) {
    return `Mine ${entry.score}`;
  }

  if (typeof entry.average_score === "number" && entry.average_score > 0) {
    return `Avg ${formatScore10(entry.average_score / 10)}`;
  }

  if (typeof entry.mean_score === "number" && entry.mean_score > 0) {
    return `Avg ${formatScore10(entry.mean_score / 10)}`;
  }

  return null;
}

function getDisplayScoreValue(entry: TrackedAnimeEntry) {
  if (typeof entry.score === "number" && entry.score > 0) {
    return entry.score * 10;
  }

  if (typeof entry.average_score === "number" && entry.average_score > 0) {
    return entry.average_score / 10;
  }

  if (typeof entry.mean_score === "number" && entry.mean_score > 0) {
    return entry.mean_score / 10;
  }

  return null;
}

function formatScore10(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function readSavedDiscoverState(): SavedDiscoverState | null {
  try {
    const raw = getMigratedLocalStorageItem(
      HOME_DISCOVER_STATE_STORAGE_KEY,
      HOME_DISCOVER_STATE_LEGACY_STORAGE_KEY
    );
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedDiscoverState;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      activeDiscoverShelfId:
        typeof parsed.activeDiscoverShelfId === "string"
          ? parsed.activeDiscoverShelfId
          : null,
      discoverShelfPages:
        parsed.discoverShelfPages && typeof parsed.discoverShelfPages === "object"
          ? parsed.discoverShelfPages
          : {},
      overviewScrollTop:
        typeof parsed.overviewScrollTop === "number" ? parsed.overviewScrollTop : 0,
      overviewRailScrolls:
        parsed.overviewRailScrolls && typeof parsed.overviewRailScrolls === "object"
          ? parsed.overviewRailScrolls
          : {},
    };
  } catch {
    return null;
  }
}

function mergeAnimeItems(currentItems: TrendingAnime[], nextItems: TrendingAnime[]) {
  const seenIds = new Set(currentItems.map((item) => item.id));
  const merged = [...currentItems];

  for (const item of nextItems) {
    if (seenIds.has(item.id)) continue;

    seenIds.add(item.id);
    merged.push(item);
  }

  return merged;
}

function toQuickAddAnime(anime: TrendingAnime): QuickAddAnime {
  return {
    id: anime.id,
    title: {
      romaji: anime.title?.romaji ?? undefined,
      english: anime.title?.english ?? undefined,
      native: anime.title?.native ?? undefined,
      userPreferred: anime.title?.userPreferred ?? undefined,
    },
    coverImage: {
      large: anime.coverImage?.large ?? "",
    },
    episodes: anime.episodes ?? null,
    format: anime.format ?? null,
    averageScore: anime.averageScore ?? null,
    season: anime.season ?? null,
    seasonYear: anime.seasonYear ?? null,
  };
}
