import {
  ClockIcon,
  EyeSlashIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";

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

type MyListCardProps = {
  entry: MyListEntry;
  statusLabel: string;
  onOpen: (animeId: number) => void;
  onEdit: (entry: MyListEntry) => void;
  titleLanguage: TitleLanguage;
  searchQuery?: string;
  density?: MyListDensity;
  variant?: MyListView;
  nowMs: number;
};

type MyListDensity = "comfortable" | "balanced" | "compact";
type MyListView = "list" | "grid" | "board";

const DENSITY_STYLES: Record<
  MyListDensity,
  {
    cardClass: string;
    contentClass: string;
    posterClass: string;
    titleClass: string;
    subtitleClass: string;
    metaClass: string;
    noteClass: string;
    statusWrapClass: string;
    statusClass: string;
    editClass: string;
    showNotes: boolean;
  }
> = {
  comfortable: {
    cardClass: "rounded-3xl",
    contentClass: "gap-4 p-4 pr-28",
    posterClass: "min-h-24 w-20 self-stretch rounded-2xl",
    titleClass: "truncate text-base font-semibold text-white",
    subtitleClass: "mt-1 truncate text-sm text-white/45",
    metaClass: "mt-4 flex flex-wrap items-center gap-2",
    noteClass: "mt-3 line-clamp-2 text-sm leading-6 text-white/42",
    statusWrapClass: "right-4 top-4",
    statusClass: "px-3 py-1 text-[11px]",
    editClass: "bottom-4 right-4 px-3 py-2 text-sm",
    showNotes: true,
  },
  balanced: {
    cardClass: "rounded-3xl",
    contentClass: "gap-4 p-3.5 pr-28",
    posterClass: "min-h-20 w-16 self-stretch rounded-2xl",
    titleClass: "truncate text-sm font-semibold text-white",
    subtitleClass: "mt-1 truncate text-xs text-white/45",
    metaClass: "mt-3 flex flex-wrap items-center gap-1.5",
    noteClass: "mt-2 line-clamp-1 text-xs leading-5 text-white/42",
    statusWrapClass: "right-3.5 top-3.5",
    statusClass: "px-2.5 py-1 text-[10px]",
    editClass: "bottom-3.5 right-3.5 px-3 py-2 text-sm",
    showNotes: true,
  },
  compact: {
    cardClass: "rounded-2xl",
    contentClass: "gap-3 p-2.5 pr-24",
    posterClass: "min-h-16 w-14 self-stretch rounded-xl",
    titleClass: "truncate text-sm font-semibold text-white",
    subtitleClass: "mt-0.5 truncate text-xs text-white/42",
    metaClass: "mt-2 flex flex-wrap items-center gap-1",
    noteClass: "hidden",
    statusWrapClass: "right-2.5 top-2.5",
    statusClass: "px-2 py-0.5 text-[9px]",
    editClass: "bottom-2.5 right-2.5 px-2.5 py-1.5 text-xs",
    showNotes: false,
  },
};

export function MyListCard({
  entry,
  statusLabel,
  onOpen,
  onEdit,
  titleLanguage,
  searchQuery = "",
  density = "balanced",
  variant = "list",
  nowMs,
}: MyListCardProps) {
  const title = getPreferredTitle(
    {
      userPreferred: entry.title_preferred,
      english: entry.title_english,
      romaji: entry.title_romaji,
      native: entry.title_native,
    },
    titleLanguage
  );

  const progressLabel = entry.episodes
    ? `${entry.progress} / ${entry.episodes}`
    : `${entry.progress}`;

  const subtitleParts = [
    entry.format,
    entry.season && entry.season_year
      ? `${capitalize(entry.season)} ${entry.season_year}`
      : entry.season_year
      ? `${entry.season_year}`
      : null,
  ].filter(Boolean);

  const normalizedQuery = searchQuery.trim();
  const isHidden = Boolean(entry.hidden_by_adult_filter);
  const hasSearchMatch = matchesEntry(entry, normalizedQuery, title);
  const isFavorite = Boolean(entry.is_favorite);
  const densityStyles = DENSITY_STYLES[density];
  const progressPercent = entry.episodes
    ? Math.min(100, Math.round((entry.progress / entry.episodes) * 100))
    : 0;
  const remainingEpisodes = entry.episodes !== null && entry.episodes !== undefined
    ? Math.max(0, entry.episodes - entry.progress)
    : null;
  const airingStatus = getAiringStatusLabel(entry.anime_status);
  const updatedLabel = formatUpdatedLabel(entry.updated_at, nowMs);
  const nextEpisodeLabel = String(entry.anime_status || "").toUpperCase() === "RELEASING"
    ? formatNextEpisodeLabel(entry.next_airing_episode, entry.next_airing_at, nowMs)
    : null;

  if (variant !== "list") {
    const isGrid = variant === "grid";

    return (
      <article
        className={`group relative isolate overflow-hidden border border-white/10 bg-white/[0.045] shadow-xl [backface-visibility:hidden] transform-gpu transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.065] ${
          isGrid ? "rounded-3xl" : "rounded-2xl"
        }`}
      >
        <button
          type="button"
          onClick={() => onOpen(entry.anime_id)}
          className={isGrid ? "flex h-full w-full flex-col text-left" : "block w-full p-3 text-left"}
        >
          <div className={isGrid ? "relative aspect-[3/4] overflow-hidden bg-white/5" : "flex gap-3"}>
            <div
              className={`shrink-0 overflow-hidden bg-white/5 ${
                isGrid ? "h-full w-full" : "h-20 w-14 rounded-xl"
              }`}
            >
              {isHidden ? (
                <div className="flex h-full w-full items-center justify-center bg-white/4 text-white/30">
                  <EyeSlashIcon className="h-7 w-7" />
                </div>
              ) : entry.cover_image_large ? (
                <img
                  src={entry.cover_image_large}
                  alt={title}
                  className={`h-full w-full object-cover [backface-visibility:hidden] transform-gpu will-change-transform transition duration-300 group-hover:scale-[1.03] ${
                    isGrid ? "object-[center_24%]" : ""
                  }`}
                />
              ) : (
                <div className="h-full w-full bg-white/5" />
              )}
            </div>

            {isGrid && (
              <div className="pointer-events-none absolute inset-x-[-1px] -bottom-px top-[-1px] bg-linear-to-t from-[#111] via-[#111]/25 to-transparent [backface-visibility:hidden] transform-gpu" />
            )}

            <div className={isGrid ? "absolute inset-x-0 bottom-0 p-4" : "min-w-0 flex-1"}>
              <div className="flex items-start gap-2">
                <h3 className={`${isGrid ? "line-clamp-2 text-base" : "line-clamp-2 text-sm"} flex-1 font-semibold text-white`}>
                  <HighlightedText text={title} query={normalizedQuery} />
                </h3>
                {isFavorite && <HeartIcon className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />}
              </div>
              <p className="mt-1 truncate text-xs text-white/48">
                {isHidden ? "Adult title hidden" : subtitleParts.join(" · ") || "Saved anime"}
              </p>
              {!isGrid && (
                <div className="mt-3 pr-10">
                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[var(--app-accent)] transition-[width]"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/45">{progressLabel} episodes</p>
                </div>
              )}
            </div>
          </div>

          {isGrid && (
            <div className="relative z-10 -mt-0.5 flex flex-1 flex-col space-y-3 bg-[#202020] p-4">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-white/55">{progressLabel} episodes</span>
                <span className="font-medium text-white/75">{progressPercent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--app-accent)] transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-white/55">
                <span className="rounded-full bg-white/7 px-2.5 py-1">{statusLabel}</span>
                <span className="rounded-full bg-white/7 px-2.5 py-1">
                  My score: {entry.score ?? "Not rated"}
                </span>
              </div>
              {!isHidden && entry.notes?.trim() && (
                <p className="line-clamp-2 text-xs leading-5 text-white/42">
                  <HighlightedText text={entry.notes.trim()} query={normalizedQuery} />
                </p>
              )}
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => onEdit(entry)}
          className={`absolute z-10 inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/55 text-white/70 backdrop-blur-md transition hover:bg-black/75 hover:text-white ${
            isGrid ? "right-3 top-3 h-9 w-9" : "bottom-3 right-3 h-8 w-8"
          }`}
          title={`Edit ${title}`}
        >
          <PencilSquareIcon className="h-4 w-4" />
        </button>
      </article>
    );
  }

  return (
    <div className={`group relative overflow-hidden border border-white/10 bg-white/5 shadow-xl transition-all duration-200 ease-out hover:scale-[1.01] hover:bg-white/[0.07] ${densityStyles.cardClass}`}>
      <div className="absolute inset-0 bg-linear-to-r from-white/2 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className={`absolute z-10 flex items-center gap-2 ${densityStyles.statusWrapClass}`}>
        {airingStatus && (
          <span className={`rounded-full border border-white/10 bg-white/7 font-medium text-white/55 ${densityStyles.statusClass}`}>
            {airingStatus}
          </span>
        )}
        <span className={`rounded-full border border-[var(--app-accent)]/25 bg-[var(--app-accent-soft)] font-medium uppercase tracking-[0.18em] text-white/70 ${densityStyles.statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <button
        onClick={() => onEdit(entry)}
        className={`absolute z-10 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 text-white/70 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white active:scale-95 ${densityStyles.editClass}`}
      >
        <PencilSquareIcon className="h-4 w-4" />
        Edit
      </button>

      <div className={`relative flex items-start ${densityStyles.contentClass}`}>
        <button
          onClick={() => onOpen(entry.anime_id)}
          className="flex min-w-0 flex-1 items-stretch gap-4 text-left"
        >
          <div className={`shrink-0 overflow-hidden bg-white/5 ${densityStyles.posterClass}`}>
            {isHidden ? (
              <div className="flex h-full w-full items-center justify-center bg-white/4 text-white/30">
                <EyeSlashIcon className="h-6 w-6" />
              </div>
            ) : entry.cover_image_large ? (
              <img
                src={entry.cover_image_large}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-white/5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="min-w-0 lg:pr-56">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className={densityStyles.titleClass}>
                  <HighlightedText text={title} query={normalizedQuery} />
                </h3>
                {isFavorite && (
                  <HeartIcon className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
                )}
              </div>

              {isHidden ? (
                <p className={densityStyles.subtitleClass}>Adult title hidden</p>
              ) : subtitleParts.length > 0 && (
                <p className={densityStyles.subtitleClass}>
                  {subtitleParts.join(" - ")}
                </p>
              )}
            </div>

            <div className={densityStyles.metaClass}>
              <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/65">
                Progress: {progressLabel}
                {remainingEpisodes !== null
                  ? remainingEpisodes === 0
                    ? " (finished)"
                    : ` (${remainingEpisodes} left)`
                  : ""}
              </span>

              <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-3 py-1 text-xs text-white/65">
                <StarIcon className="h-3.5 w-3.5" />
                My score: {entry.score ?? "Not rated"}
              </span>

              {nextEpisodeLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--app-accent-soft)] px-3 py-1 text-xs text-white/75">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {nextEpisodeLabel}
                </span>
              )}

              {updatedLabel && (
                <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/45">
                  {updatedLabel}
                </span>
              )}

            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-medium text-white/45">
                {progressPercent}%
              </span>
            </div>

            {!isHidden && densityStyles.showNotes && entry.notes?.trim() && (
              <p className={densityStyles.noteClass}>
                <HighlightedText text={entry.notes.trim()} query={normalizedQuery} />
              </p>
            )}

            {normalizedQuery && !hasSearchMatch && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/30">
                <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                No visible text match
              </p>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return <>{text}</>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark className="rounded bg-[var(--app-accent-soft)] px-1 text-white">
        {match}
      </mark>
      {after}
    </>
  );
}

function matchesEntry(entry: MyListEntry, query: string, title: string) {
  if (!query) {
    return true;
  }

  const searchValue = query.toLowerCase();

  return [
    title,
    entry.title_english,
    entry.title_romaji,
    entry.title_native,
    entry.title_preferred,
    entry.notes,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(searchValue));
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getAiringStatusLabel(status?: string | null) {
  switch (String(status || "").toUpperCase()) {
    case "RELEASING":
      return "Releasing";
    case "NOT_YET_RELEASED":
      return "About to release";
    case "HIATUS":
      return "On hiatus";
    case "CANCELLED":
      return "Cancelled";
    case "FINISHED":
      return "Finished airing";
    default:
      return null;
  }
}

function formatUpdatedLabel(value: string | null | undefined, nowMs: number) {
  if (!value) return null;

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const timestamp = new Date(normalized).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - timestamp) / 60_000));
  if (elapsedMinutes < 1) return "Updated just now";
  if (elapsedMinutes < 60) return `Updated ${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Updated ${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `Updated ${elapsedDays}d ago`;

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(timestamp).getFullYear() === new Date(nowMs).getFullYear() ? undefined : "numeric",
  }).format(new Date(timestamp))}`;
}

function formatNextEpisodeLabel(
  episode: number | null | undefined,
  airingAt: number | null | undefined,
  nowMs: number
) {
  const timestamp = Number(airingAt) * 1000;
  if (!Number.isFinite(timestamp) || timestamp <= nowMs) return null;

  const remainingMinutes = Math.max(1, Math.ceil((timestamp - nowMs) / 60_000));
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  const minutes = remainingMinutes % 60;
  const countdown = days > 0
    ? `${days}d ${hours}h`
    : hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m`;

  return `${episode ? `Episode ${episode}` : "Next episode"} in ${countdown}`;
}
