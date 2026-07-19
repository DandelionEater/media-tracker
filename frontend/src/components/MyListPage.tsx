import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import {
  BookmarkIcon,
  Bars3BottomLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  FunnelIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  PauseCircleIcon,
  RectangleGroupIcon,
  Squares2X2Icon,
  ViewColumnsIcon,
  StarIcon,
  XCircleIcon,
  EyeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ListEntryModal } from "./ListEntryModal";
import { MyListCard } from "./MyListCard";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";
import { getMigratedLocalStorageItem } from "../utils/localStorageMigration";

type MyListEntry = {
  anime_id: number;
  status: "planned" | "watching" | "completed" | "paused" | "dropped";
  is_favorite?: number | boolean;
  progress: number;
  score: number | null;
  notes: string | null;
  updated_at?: string | null;
  title_romaji?: string | null;
  title_english?: string | null;
  title_native?: string | null;
  title_preferred?: string | null;
  cover_image_large?: string | null;
  hidden_by_adult_filter?: boolean;
  episodes?: number | null;
  format?: string | null;
  anime_status?: string | null;
  next_airing_episode?: number | null;
  next_airing_at?: number | null;
  average_score?: number | null;
  season?: string | null;
  season_year?: number | null;
};

type MyListPageProps = {
  userId: number;
  entries: MyListEntry[];
  onSelectAnime: (id: number) => void;
  onRefreshList: () => void | Promise<void>;
  onListChanged?: () => void | Promise<void>;
  onNotify?: (
    kind: "success" | "error" | "warning",
    title: string,
    message: string
  ) => void;
  titleLanguage: TitleLanguage;
  density: MyListDensity;
};

type SortMode = "alphabetical" | "personalScore";
type ListStatus = MyListEntry["status"];
type MyListDensity = "comfortable" | "balanced" | "compact";
type MyListView = "list" | "grid" | "board";
type ProgressFilter = "all" | "notStarted" | "inProgress" | "finished";
type RatingFilter = "all" | "rated" | "unrated" | "favorites";

const DEFAULT_STATUS_ORDER: ListStatus[] = [
  "watching",
  "planned",
  "completed",
  "paused",
  "dropped",
];

const STATUS_META: Record<
  ListStatus,
  {
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    description: string;
  }
> = {
  watching: {
    label: "Watching",
    icon: EyeIcon,
    description: "What you're actively going through right now.",
  },
  planned: {
    label: "Planned",
    icon: BookmarkIcon,
    description: "Titles waiting for their turn.",
  },
  completed: {
    label: "Completed",
    icon: CheckCircleIcon,
    description: "Finished and safely archived.",
  },
  paused: {
    label: "Paused",
    icon: PauseCircleIcon,
    description: "Stuff you stepped away from for now.",
  },
  dropped: {
    label: "Dropped",
    icon: XCircleIcon,
    description: "Titles you decided not to continue.",
  },
};

const DEFAULT_OPEN_SECTIONS: Record<MyListEntry["status"], boolean> = {
  watching: true,
  planned: true,
  completed: false,
  paused: false,
  dropped: false,
};

const MY_LIST_OPEN_SECTIONS_KEY = "seenary.my-list.open-sections";
const MY_LIST_OPEN_SECTIONS_LEGACY_KEY = "media-tracker.my-list.open-sections";
const MY_LIST_SORT_MODE_KEY = "seenary.my-list.sort-mode";
const MY_LIST_SORT_MODE_LEGACY_KEY = "media-tracker.my-list.sort-mode";
const MY_LIST_SECTION_ORDER_KEY = "seenary.my-list.section-order";
const MY_LIST_SECTION_ORDER_LEGACY_KEY = "media-tracker.my-list.section-order";
const MY_LIST_VIEW_KEY = "seenary.my-list.view";

function readStoredView(): MyListView {
  if (typeof window === "undefined") return "list";
  const value = window.localStorage.getItem(MY_LIST_VIEW_KEY);
  return value === "grid" || value === "board" || value === "list" ? value : "list";
}

function readStoredOpenSections() {
  if (typeof window === "undefined") {
    return DEFAULT_OPEN_SECTIONS;
  }

  try {
    const rawValue = getMigratedLocalStorageItem(
      MY_LIST_OPEN_SECTIONS_KEY,
      MY_LIST_OPEN_SECTIONS_LEGACY_KEY
    );

    if (!rawValue) {
      return DEFAULT_OPEN_SECTIONS;
    }

    const parsed = JSON.parse(rawValue);

    return {
      watching:
        typeof parsed?.watching === "boolean"
          ? parsed.watching
          : DEFAULT_OPEN_SECTIONS.watching,
      planned:
        typeof parsed?.planned === "boolean"
          ? parsed.planned
          : DEFAULT_OPEN_SECTIONS.planned,
      completed:
        typeof parsed?.completed === "boolean"
          ? parsed.completed
          : DEFAULT_OPEN_SECTIONS.completed,
      paused:
        typeof parsed?.paused === "boolean"
          ? parsed.paused
          : DEFAULT_OPEN_SECTIONS.paused,
      dropped:
        typeof parsed?.dropped === "boolean"
          ? parsed.dropped
          : DEFAULT_OPEN_SECTIONS.dropped,
    };
  } catch {
    return DEFAULT_OPEN_SECTIONS;
  }
}

function readStoredSortMode(): SortMode {
  if (typeof window === "undefined") {
    return "alphabetical";
  }

  try {
    const storedSortMode = getMigratedLocalStorageItem(
      MY_LIST_SORT_MODE_KEY,
      MY_LIST_SORT_MODE_LEGACY_KEY
    );

    return storedSortMode === "personalScore" || storedSortMode === "alphabetical"
      ? storedSortMode
      : "alphabetical";
  } catch {
    return "alphabetical";
  }
}

function readStoredSectionOrder() {
  if (typeof window === "undefined") {
    return [...DEFAULT_STATUS_ORDER];
  }

  try {
    const rawValue = getMigratedLocalStorageItem(
      MY_LIST_SECTION_ORDER_KEY,
      MY_LIST_SECTION_ORDER_LEGACY_KEY
    );

    if (!rawValue) {
      return [...DEFAULT_STATUS_ORDER];
    }

    return normalizeSectionOrder(JSON.parse(rawValue));
  } catch {
    return [...DEFAULT_STATUS_ORDER];
  }
}

function persistSectionOrder(order: ListStatus[]) {
  try {
    window.localStorage.setItem(MY_LIST_SECTION_ORDER_KEY, JSON.stringify(order));
    window.localStorage.removeItem(MY_LIST_SECTION_ORDER_LEGACY_KEY);
  } catch {
    // Ignore local persistence failures and keep the UI usable.
  }
}

function normalizeSectionOrder(value: unknown): ListStatus[] {
  const allowedStatuses = new Set<ListStatus>(DEFAULT_STATUS_ORDER);
  const savedStatuses = Array.isArray(value)
    ? value.filter((status): status is ListStatus =>
        allowedStatuses.has(status as ListStatus)
      )
    : [];
  const missingStatuses = DEFAULT_STATUS_ORDER.filter(
    (status) => !savedStatuses.includes(status)
  );

  return [...savedStatuses, ...missingStatuses];
}

function isListStatus(value: string): value is ListStatus {
  return DEFAULT_STATUS_ORDER.includes(value as ListStatus);
}

function moveSectionOrder(
  order: ListStatus[],
  activeStatus: ListStatus,
  targetStatus: ListStatus
) {
  const currentOrder = normalizeSectionOrder(order);
  const activeIndex = currentOrder.indexOf(activeStatus);
  const targetIndex = currentOrder.indexOf(targetStatus);

  if (activeIndex === -1 || targetIndex === -1 || activeIndex === targetIndex) {
    return currentOrder;
  }

  const nextOrder = [...currentOrder];
  const [activeSection] = nextOrder.splice(activeIndex, 1);
  nextOrder.splice(targetIndex, 0, activeSection);

  return nextOrder;
}

function getCollapsedSections(): Record<ListStatus, boolean> {
  return {
    watching: false,
    planned: false,
    completed: false,
    paused: false,
    dropped: false,
  };
}

export function MyListPage({
  userId,
  entries,
  onSelectAnime,
  onRefreshList,
  onListChanged,
  onNotify,
  titleLanguage,
  density,
}: MyListPageProps) {
  const [editingEntry, setEditingEntry] = useState<MyListEntry | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [openSections, setOpenSections] = useState(readStoredOpenSections);
  const [sortMode, setSortMode] = useState<SortMode>(readStoredSortMode);
  const [sectionOrder, setSectionOrder] = useState<ListStatus[]>(readStoredSectionOrder);
  const sectionOrderRef = useRef(sectionOrder);
  const [isEditingSectionOrder, setIsEditingSectionOrder] = useState(false);
  const [draggedSectionStatus, setDraggedSectionStatus] = useState<ListStatus | null>(null);
  const [view, setView] = useState<MyListView>(readStoredView);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ListStatus>("all");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const openSectionsBeforeEdit = useRef<Record<ListStatus, boolean> | null>(null);

  useEffect(() => {
    onRefreshList();
  }, [onRefreshList]);

  useEffect(() => {
    if (!window.desktopConfig) return;
    const desktopConfig = window.desktopConfig;

    let cancelled = false;

    async function loadDesktopSectionOrder() {
      try {
        const result = await desktopConfig.getLayoutOrders(userId);
        if (cancelled || !result.ok) return;

        if (result.myListSectionOrder) {
          const order = normalizeSectionOrder(result.myListSectionOrder);
          sectionOrderRef.current = order;
          persistSectionOrder(order);
          setSectionOrder(order);
        } else {
          desktopConfig.setLayoutOrders(userId, {
            myListSectionOrder: sectionOrderRef.current,
          });
        }
      } catch (error) {
        console.warn("Failed to load desktop My List configuration:", error);
      }
    }

    void loadDesktopSectionOrder();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isEditingSectionOrder) {
      return;
    }

    try {
      window.localStorage.setItem(
        MY_LIST_OPEN_SECTIONS_KEY,
        JSON.stringify(openSections)
      );
    } catch {
      // Ignore local persistence failures and keep the UI usable.
    }
  }, [isEditingSectionOrder, openSections]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MY_LIST_SORT_MODE_KEY, sortMode);
    } catch {
      // Ignore local persistence failures and keep the UI usable.
    }
  }, [sortMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MY_LIST_VIEW_KEY, view);
    } catch {
      // Ignore local persistence failures and keep the UI usable.
    }
  }, [view]);

  function saveSectionOrder(order: ListStatus[]) {
    sectionOrderRef.current = order;
    persistSectionOrder(order);
    setSectionOrder(order);
    const result = window.desktopConfig?.setLayoutOrders(userId, {
      myListSectionOrder: order,
    });
    if (result && !result.ok) {
      console.warn(result.message || "Failed to save My List layout.");
    }
  }

  function handleToggleSectionOrderEdit() {
    if (isEditingSectionOrder) {
      persistSectionOrder(sectionOrderRef.current);
      setIsEditingSectionOrder(false);

      if (openSectionsBeforeEdit.current) {
        setOpenSections(openSectionsBeforeEdit.current);
        openSectionsBeforeEdit.current = null;
      }

      setDraggedSectionStatus(null);
      return;
    }

    openSectionsBeforeEdit.current = openSections;
    setIsEditingSectionOrder(true);
    setDraggedSectionStatus(null);
    setOpenSections(getCollapsedSections());
  }

  function handleResetSectionOrder() {
    const defaultOrder = [...DEFAULT_STATUS_ORDER];
    saveSectionOrder(defaultOrder);
    setDraggedSectionStatus(null);
  }

  function handleSectionDragStart(status: string, event: DragEvent<HTMLDivElement>) {
    if (!isListStatus(status)) {
      return;
    }

    setDraggedSectionStatus(status);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", status);
  }

  function handleSectionDragOver(status: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const activeStatus = draggedSectionStatus;
    if (!activeStatus || activeStatus === status || !isListStatus(status)) {
      return;
    }

    saveSectionOrder(moveSectionOrder(sectionOrderRef.current, activeStatus, status));
  }

  function handleSectionDragEnd() {
    setDraggedSectionStatus(null);
  }

  const normalizedSearch = listSearch.trim().toLowerCase();

  const availableFormats = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.format).filter(Boolean) as string[])).sort(),
    [entries]
  );

  const activeFilterCount = [statusFilter !== "all", progressFilter !== "all", ratingFilter !== "all", formatFilter !== "all"].filter(Boolean).length;

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (formatFilter !== "all" && entry.format !== formatFilter) return false;
      if (ratingFilter === "rated" && entry.score === null) return false;
      if (ratingFilter === "unrated" && entry.score !== null) return false;
      if (ratingFilter === "favorites" && !entry.is_favorite) return false;

      const isFinished = Boolean(entry.episodes && entry.progress >= entry.episodes);
      if (progressFilter === "notStarted" && entry.progress !== 0) return false;
      if (progressFilter === "inProgress" && (entry.progress === 0 || isFinished)) return false;
      if (progressFilter === "finished" && !isFinished) return false;
      if (!normalizedSearch) return true;

      if (entry.hidden_by_adult_filter) {
        return "hidden by 18+ filter".includes(normalizedSearch);
      }

      const preferredTitle = getPreferredTitle(
        {
          userPreferred: entry.title_preferred,
          english: entry.title_english,
          romaji: entry.title_romaji,
          native: entry.title_native,
        },
        titleLanguage
      );

      return [
        preferredTitle,
        entry.title_english,
        entry.title_romaji,
        entry.title_native,
        entry.title_preferred,
        entry.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [entries, formatFilter, normalizedSearch, progressFilter, ratingFilter, statusFilter, titleLanguage]);

  const groupedEntries = useMemo(() => {
    return sectionOrder.map((status) => {
      const items = filteredEntries
        .filter((entry) => entry.status === status)
        .sort((a, b) => compareEntries(a, b, titleLanguage, sortMode));

      return {
        status,
        label: STATUS_META[status].label,
        icon: STATUS_META[status].icon,
        description: STATUS_META[status].description,
        items,
      };
    });
  }, [filteredEntries, sectionOrder, sortMode, titleLanguage]);

  const visibleSections = groupedEntries.filter(({ items }) => items.length > 0);
  const displayedSections = view === "board" && !isEditingSectionOrder
    ? visibleSections.filter(({ status }) => openSections[status])
    : visibleSections;

  if (!entries.length) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div className="max-w-xl">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-white/35">
            My List
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-white">
            Your list is still empty.
          </h1>

          <p className="mt-4 text-base leading-7 text-white/60">
            Open an anime page, add it to your list, and it will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="scroll-container h-full overflow-y-auto px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <p className="text-sm uppercase tracking-[0.3em] text-white/35">
              Personal list
            </p>

            <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  My List
                </h1>
                <p className="mt-2 text-white/55">
                  Your saved anime, grouped by where they currently stand.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right shadow-lg">
                <p className="text-xs uppercase tracking-[0.22em] text-white/35">
                  Total entries
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {entries.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-4 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="no-drag flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-3 py-3 shadow-lg">
                <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-white/45" />
                <input
                  type="text"
                  value={listSearch}
                  placeholder="Search in your list..."
                  onChange={(event) => setListSearch(event.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                />
                {listSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => setListSearch("")}
                    className="rounded-full p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
                    title="Clear list search"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 self-start lg:ml-3">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((current) => !current)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                    filtersOpen || activeFilterCount
                      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <FunnelIcon className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px]">{activeFilterCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("alphabetical")}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                    sortMode === "alphabetical"
                      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  A-Z
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("personalScore")}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                    sortMode === "personalScore"
                      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <StarIcon className="h-4 w-4" />
                  My rating
                </button>
              </div>
            </div>

            <div className="grid items-center gap-3 lg:grid-cols-[2fr_1fr]">
              <div className="order-2 inline-flex w-fit items-center rounded-2xl border border-white/10 bg-black/20 p-1 lg:justify-self-end">
                {([
                  ["list", Bars3BottomLeftIcon, "List"],
                  ["grid", Squares2X2Icon, "Grid"],
                  ["board", ViewColumnsIcon, "Board"],
                ] as const).map(([value, ViewIcon, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setView(value)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                      view === value ? "bg-[var(--app-accent)] text-black" : "text-white/50 hover:bg-white/7 hover:text-white"
                    }`}
                    title={`${label} view`}
                  >
                    <ViewIcon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="order-1 flex flex-wrap gap-2">
                {sectionOrder.map((status) => {
                  const count = groupedEntries.find((group) => group.status === status)?.items.length ?? 0;
                  const meta = STATUS_META[status];
                  const PillIcon = meta.icon;
                  const selected = view === "board"
                    ? openSections[status]
                    : normalizedSearch
                    ? count > 0
                    : openSections[status];

                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={isEditingSectionOrder}
                      onClick={() =>
                        setOpenSections((current) => ({
                          ...current,
                          [status]: !current[status],
                        }))
                      }
                      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                        selected
                          ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
                          : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/8 hover:text-white"
                      } disabled:cursor-default disabled:opacity-65`}
                    >
                      <PillIcon className="h-4 w-4" />
                      {meta.label}
                      <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px] text-white/80">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ${filtersOpen ? "" : "!mt-0"}`}
              style={{ gridTemplateRows: filtersOpen ? "1fr" : "0fr", opacity: filtersOpen ? 1 : 0 }}
            >
              <div className="overflow-hidden">
                <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 md:grid-cols-2 xl:grid-cols-4">
                  <FilterSelect
                    label="List status"
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value as "all" | ListStatus)}
                    options={[["all", "Every status"], ...sectionOrder.map((status) => [status, STATUS_META[status].label] as [string, string])]}
                  />
                  <FilterSelect
                    label="Watch progress"
                    value={progressFilter}
                    onChange={(value) => setProgressFilter(value as ProgressFilter)}
                    options={[
                      ["all", "Any progress"],
                      ["notStarted", "Not started"],
                      ["inProgress", "In progress"],
                      ["finished", "Finished"],
                    ]}
                  />
                  <FilterSelect
                    label="Personal details"
                    value={ratingFilter}
                    onChange={(value) => setRatingFilter(value as RatingFilter)}
                    options={[
                      ["all", "Everything"],
                      ["rated", "Rated"],
                      ["unrated", "Not rated"],
                      ["favorites", "Favorites"],
                    ]}
                  />
                  <FilterSelect
                    label="Format"
                    value={formatFilter}
                    onChange={setFormatFilter}
                    options={[["all", "Any format"], ...availableFormats.map((format) => [format, format] as [string, string])]}
                  />
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setProgressFilter("all");
                        setRatingFilter("all");
                        setFormatFilter("all");
                        setStatusFilter("all");
                      }}
                      className="inline-flex w-fit items-center gap-2 text-sm text-white/45 transition hover:text-white md:col-span-2 xl:col-span-4"
                    >
                      <XMarkIcon className="h-4 w-4" /> Clear all filters
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>

          <MyListLayoutToolbar
            isEditing={isEditingSectionOrder}
            onToggleEdit={handleToggleSectionOrderEdit}
            onReset={handleResetSectionOrder}
          />

          {normalizedSearch && (
            <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
              Found <span className="font-semibold text-white">{filteredEntries.length}</span> matching entr
              {filteredEntries.length === 1 ? "y" : "ies"} for{" "}
              <span className="rounded-full bg-white/8 px-2 py-1 text-white">
                {listSearch.trim()}
              </span>
            </div>
          )}

          <div className={view === "board" ? `grid items-start gap-4 ${getBoardGridClass(displayedSections.length)}` : "space-y-5"}>
            {displayedSections.length ? (
              displayedSections.map(({ status, label, icon: Icon, description, items }) => {
                const isOpen = view === "board"
                  ? true
                  : isEditingSectionOrder
                  ? false
                  : normalizedSearch
                  ? true
                  : openSections[status];

                return (
                  <MyListSectionEditBlock
                    key={status}
                    status={status}
                    label={label}
                    isEditing={isEditingSectionOrder}
                    isDragging={draggedSectionStatus === status}
                    onDragStart={handleSectionDragStart}
                    onDragOver={handleSectionDragOver}
                    onDragEnd={handleSectionDragEnd}
                  >
                    <section className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-xl">
                      <button
                        type="button"
                        disabled={isEditingSectionOrder || view === "board"}
                        onClick={() =>
                          setOpenSections((current) => ({
                            ...current,
                            [status]: !current[status],
                          }))
                        }
                        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55 disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={`rounded-2xl border p-2.5 transition ${
                            isOpen
                              ? "border-[var(--app-accent)]/25 bg-[var(--app-accent-soft)] text-white/80"
                              : "border-white/10 bg-white/5 text-white/75"
                          }`}>
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                              <h2 className="text-lg font-semibold text-white">{label}</h2>
                              <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/45">
                                {items.length}
                              </span>
                            </div>

                            {view !== "board" && <p className="mt-1 text-sm text-white/40">{description}</p>}
                          </div>
                        </div>

                        {view !== "board" && <span
                          className={`rounded-2xl border border-white/10 bg-white/5 p-2 text-white/55 transition-transform duration-300 ${
                            isOpen ? "rotate-180 border-[var(--app-accent)]/25 bg-[var(--app-accent-soft)] text-white/80" : ""
                          }`}
                        >
                          <ChevronDownIcon className="h-5 w-5" />
                        </span>}
                      </button>

                      <div
                        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
                        style={{
                          gridTemplateRows: isOpen ? "1fr" : "0fr",
                          opacity: isOpen ? 1 : 0.7,
                        }}
                      >
                        <div className="overflow-hidden">
                          <div
                            className={`border-t border-white/10 px-5 pb-5 pt-4 transition duration-300 ${
                              isOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
                            }`}
                          >
                            <div className={`grid gap-4 ${
                              view === "grid"
                                ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
                                : "grid-cols-1"
                            }`}>
                              {items.map((entry) => (
                                <MyListCard
                                  key={`${entry.anime_id}-${entry.status}`}
                                  entry={entry}
                                  statusLabel={label}
                                  onOpen={onSelectAnime}
                                  onEdit={setEditingEntry}
                                  titleLanguage={titleLanguage}
                                  searchQuery={listSearch}
                                  density={density}
                                  variant={view}
                                  nowMs={nowMs}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </MyListSectionEditBlock>
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
                {view === "board" && visibleSections.length
                  ? "Choose one or more statuses above to add them to the board."
                  : "No entries matched your search and filters."}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingEntry && (
        <ListEntryModal
          animeId={editingEntry.anime_id}
          isOpen={true}
          entry={editingEntry}
          title={getPreferredTitle(
            {
              userPreferred: editingEntry.title_preferred,
              english: editingEntry.title_english,
              romaji: editingEntry.title_romaji,
              native: editingEntry.title_native,
            },
            titleLanguage
          )}
          totalEpisodes={editingEntry.episodes ?? null}
          onClose={() => setEditingEntry(null)}
          onSaved={async () => {
            setEditingEntry(null);
            await onListChanged?.();
            const title = getPreferredTitle(
              {
                userPreferred: editingEntry.title_preferred,
                english: editingEntry.title_english,
                romaji: editingEntry.title_romaji,
                native: editingEntry.title_native,
              },
              titleLanguage
            );
            onNotify?.("success", "List entry updated", `${title} was updated.`);
          }}
          onRemoved={async () => {
            setEditingEntry(null);
            await onListChanged?.();
            const title = getPreferredTitle(
              {
                userPreferred: editingEntry.title_preferred,
                english: editingEntry.title_english,
                romaji: editingEntry.title_romaji,
                native: editingEntry.title_native,
              },
              titleLanguage
            );
            onNotify?.("success", "List entry removed", `${title} was removed from your list.`);
          }}
        />
      )}
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-white/35">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="no-drag w-full rounded-2xl border border-white/10 bg-[#1b1b1b] px-3 py-2.5 text-sm text-white/75 outline-none transition focus:border-[var(--app-accent)]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function getBoardGridClass(columnCount: number) {
  if (columnCount >= 5) return "sm:grid-cols-2 xl:grid-cols-5";
  if (columnCount === 4) return "sm:grid-cols-2 xl:grid-cols-4";
  if (columnCount === 3) return "sm:grid-cols-2 xl:grid-cols-3";
  if (columnCount === 2) return "md:grid-cols-2";
  return "grid-cols-1";
}

function MyListLayoutToolbar({
  isEditing,
  onToggleEdit,
  onReset,
}: {
  isEditing: boolean;
  onToggleEdit: () => void;
  onReset: () => void;
}) {
  return (
    <section
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 px-4 py-3 ${
        isEditing
          ? "sticky top-3 z-30 border-white/15 bg-[#1b1b1b]/96 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          : "bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-[var(--app-accent)]/20 bg-[var(--app-accent-soft)] p-2 text-white/80">
          <RectangleGroupIcon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">"My List" layout</p>
          <p className="text-xs text-white/40">
            {isEditing ? "Drag shelves into your preferred order." : "Customize shelf order."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {isEditing && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={onToggleEdit}
          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55 ${
            isEditing
              ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
              : "border-[var(--app-accent)]/25 bg-[var(--app-accent)] text-black shadow-lg shadow-[var(--app-accent)]/15 hover:opacity-90"
          }`}
        >
          <RectangleGroupIcon className="h-4 w-4" />
          {isEditing ? "Save" : "Edit"}
        </button>
      </div>
    </section>
  );
}

function MyListSectionEditBlock({
  status,
  label,
  isEditing,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  children,
}: {
  status: ListStatus;
  label: string;
  isEditing: boolean;
  isDragging: boolean;
  onDragStart: (status: string, event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (status: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  children: ReactNode;
}) {
  return (
    <div
      draggable={isEditing}
      onDragStart={(event) => onDragStart(status, event)}
      onDragOver={(event) => onDragOver(status, event)}
      onDragEnd={onDragEnd}
      className={`relative rounded-[1.75rem] transition ${
        isEditing
          ? "border border-dashed border-white/15 bg-white/[0.025] p-2"
          : "border border-transparent"
      } ${isDragging ? "opacity-45" : "opacity-100"}`}
    >
      {isEditing && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
            <span className="flex cursor-grab items-center text-white/45 active:cursor-grabbing">
              <EllipsisVerticalIcon className="h-5 w-3" />
              <EllipsisVerticalIcon className="-ml-1 h-5 w-3" />
            </span>
            {label}
          </div>
          <span className="text-xs uppercase tracking-[0.2em] text-white/30">Drag</span>
        </div>
      )}

      {children}
    </div>
  );
}

function compareEntries(
  a: MyListEntry,
  b: MyListEntry,
  titleLanguage: TitleLanguage,
  sortMode: SortMode
) {
  const aFavorite = Boolean(a.is_favorite);
  const bFavorite = Boolean(b.is_favorite);

  if (aFavorite !== bFavorite) {
    return aFavorite ? -1 : 1;
  }

  if (sortMode === "personalScore") {
    const aScore = typeof a.score === "number" ? a.score : null;
    const bScore = typeof b.score === "number" ? b.score : null;

    if (aScore !== null && bScore !== null && bScore !== aScore) {
      return bScore - aScore;
    }

    if (aScore !== null && bScore === null) {
      return -1;
    }

    if (aScore === null && bScore !== null) {
      return 1;
    }
  }

  const aTitle = getPreferredTitle(
    {
      userPreferred: a.title_preferred,
      english: a.title_english,
      romaji: a.title_romaji,
      native: a.title_native,
    },
    titleLanguage
  );
  const bTitle = getPreferredTitle(
    {
      userPreferred: b.title_preferred,
      english: b.title_english,
      romaji: b.title_romaji,
      native: b.title_native,
    },
    titleLanguage
  );

  return aTitle.localeCompare(bTitle, undefined, { sensitivity: "base" });
}
