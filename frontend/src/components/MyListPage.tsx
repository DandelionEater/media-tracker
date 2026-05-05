import { useEffect, useMemo, useState } from "react";
import {
  BookmarkIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PauseCircleIcon,
  StarIcon,
  XCircleIcon,
  EyeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ListEntryModal } from "./ListEntryModal";
import { MyListCard } from "./MyListCard";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";

type MyListEntry = {
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
  episodes?: number | null;
  format?: string | null;
  average_score?: number | null;
  season?: string | null;
  season_year?: number | null;
};

type MyListPageProps = {
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
};

type SortMode = "alphabetical" | "personalScore";

const STATUS_ORDER: Array<MyListEntry["status"]> = [
  "watching",
  "planned",
  "completed",
  "paused",
  "dropped",
];

const STATUS_META: Record<
  MyListEntry["status"],
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

const MY_LIST_OPEN_SECTIONS_KEY = "media-tracker.my-list.open-sections";
const MY_LIST_SORT_MODE_KEY = "media-tracker.my-list.sort-mode";

function readStoredOpenSections() {
  if (typeof window === "undefined") {
    return DEFAULT_OPEN_SECTIONS;
  }

  try {
    const rawValue = window.localStorage.getItem(MY_LIST_OPEN_SECTIONS_KEY);

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
    const storedSortMode = window.localStorage.getItem(MY_LIST_SORT_MODE_KEY);

    return storedSortMode === "personalScore" || storedSortMode === "alphabetical"
      ? storedSortMode
      : "alphabetical";
  } catch {
    return "alphabetical";
  }
}

export function MyListPage({
  entries,
  onSelectAnime,
  onRefreshList,
  onListChanged,
  onNotify,
  titleLanguage,
}: MyListPageProps) {
  const [editingEntry, setEditingEntry] = useState<MyListEntry | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [openSections, setOpenSections] = useState(readStoredOpenSections);
  const [sortMode, setSortMode] = useState<SortMode>(readStoredSortMode);

  useEffect(() => {
    onRefreshList();
  }, [onRefreshList]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MY_LIST_OPEN_SECTIONS_KEY,
        JSON.stringify(openSections)
      );
    } catch {
      // Ignore local persistence failures and keep the UI usable.
    }
  }, [openSections]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MY_LIST_SORT_MODE_KEY, sortMode);
    } catch {
      // Ignore local persistence failures and keep the UI usable.
    }
  }, [sortMode]);

  const normalizedSearch = listSearch.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    if (!normalizedSearch) {
      return entries;
    }

    return entries.filter((entry) => {
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
  }, [entries, normalizedSearch, titleLanguage]);

  const groupedEntries = useMemo(() => {
    return STATUS_ORDER.map((status) => {
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
  }, [filteredEntries, sortMode, titleLanguage]);

  const visibleSections = groupedEntries.filter(({ items }) => items.length > 0);

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
              Personal tracker
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

          <div className="mb-8 space-y-4">
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

            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((status) => {
                const count = groupedEntries.find((group) => group.status === status)?.items.length ?? 0;
                const meta = STATUS_META[status];
                const PillIcon = meta.icon;
                const selected = normalizedSearch
                  ? count > 0
                  : openSections[status];

                return (
                  <button
                    key={status}
                    type="button"
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
                    }`}
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

          {normalizedSearch && (
            <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
              Found <span className="font-semibold text-white">{filteredEntries.length}</span> matching entr
              {filteredEntries.length === 1 ? "y" : "ies"} for{" "}
              <span className="rounded-full bg-white/8 px-2 py-1 text-white">
                {listSearch.trim()}
              </span>
            </div>
          )}

          <div className="space-y-5">
            {visibleSections.length ? (
              visibleSections.map(({ status, label, icon: Icon, description, items }) => {
                const isOpen = normalizedSearch ? true : openSections[status];

                return (
                  <section
                    key={status}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-xl"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSections((current) => ({
                          ...current,
                          [status]: !current[status],
                        }))
                      }
                      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-white/55"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/75">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-lg font-semibold text-white">{label}</h2>
                            <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/45">
                              {items.length}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-white/40">{description}</p>
                        </div>
                      </div>

                      <span
                        className={`rounded-2xl border border-white/10 bg-white/5 p-2 text-white/55 transition-transform duration-300 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      >
                        <ChevronDownIcon className="h-5 w-5" />
                      </span>
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
                          <div className="grid grid-cols-1 gap-4">
                            {items.map((entry) => (
                              <MyListCard
                                key={`${entry.anime_id}-${entry.status}`}
                                entry={entry}
                                statusLabel={label}
                                onOpen={onSelectAnime}
                                onEdit={setEditingEntry}
                                titleLanguage={titleLanguage}
                                searchQuery={listSearch}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
                No entries matched your list search.
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
          onSaved={async (_entry, message) => {
            setEditingEntry(null);
            await onListChanged?.();
            onNotify?.("success", "List updated", message || "List entry updated.");
          }}
          onRemoved={async (message) => {
            setEditingEntry(null);
            await onListChanged?.();
            onNotify?.("success", "List updated", message || "Anime removed from your list.");
          }}
        />
      )}
    </>
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
