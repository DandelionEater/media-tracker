import {
  BookmarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";

type Anime = {
  id: number;
  isAdult?: boolean;
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

type TrackedAnimeEntry = {
  anime_id: number;
  status: "planned" | "watching" | "completed" | "paused" | "dropped";
  progress: number;
  score: number | null;
  notes: string | null;
  episodes?: number | null;
};

type AnimeCardProps = {
  anime: Anime;
  onSelect: (id: number) => void;
  trackedEntry?: TrackedAnimeEntry;
  onQuickAdd: (anime: Anime) => void;
  onEditEntry: (entry: TrackedAnimeEntry) => void;
  titleLanguage: TitleLanguage;
};

const STATUS_LABELS: Record<TrackedAnimeEntry["status"], string> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};

export function AnimeCard({
  anime,
  onSelect,
  trackedEntry,
  onQuickAdd,
  onEditEntry,
  titleLanguage,
}: AnimeCardProps) {
  const title = getPreferredTitle(anime.title, titleLanguage);

  const subtitleParts = [
    anime.format,
    anime.episodes ? `${anime.episodes} eps` : null,
    anime.averageScore ? `${anime.averageScore}%` : null,
  ].filter(Boolean);

  const seasonText =
    anime.season && anime.seasonYear
      ? `${capitalize(anime.season)} ${anime.seasonYear}`
      : anime.seasonYear
      ? String(anime.seasonYear)
      : null;

  const trackedStatusLabel = trackedEntry
    ? STATUS_LABELS[trackedEntry.status]
    : null;

  const trackedProgressLabel = trackedEntry
    ? buildTrackedProgressLabel(trackedEntry, anime.episodes)
    : null;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/60"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(anime.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(anime.id);
        }
      }}
    >
      <img
        src={anime.coverImage.large}
        alt={title}
        className="
          w-full h-full object-cover
          transition-all duration-300
          group-hover:brightness-50
          group-hover:blur-[2px]
        "
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();

          if (trackedEntry) {
            onEditEntry(trackedEntry);
            return;
          }

          onQuickAdd(anime);
        }}
        className="
          absolute right-2 top-2 z-20
          inline-flex h-8 w-8 items-center justify-center
          rounded-xl border border-[var(--app-accent)]/35 bg-black/55 text-[var(--app-accent)]
          backdrop-blur-sm
          transition-all duration-300
          hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent)]
          opacity-100 scale-100
        "
        title={trackedEntry ? "Edit list entry" : "Add to list"}
      >
        {trackedEntry ? (
          <BookmarkIcon className="h-4 w-4" />
        ) : (
          <PlusIcon className="h-4 w-4" />
        )}
      </button>

      {anime.isAdult && (
        <div className="absolute left-2 top-2 z-20 rounded-xl border border-rose-300/20 bg-rose-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-100 backdrop-blur-sm">
          18+
        </div>
      )}

      {trackedStatusLabel && (
        <div
          className="
            absolute left-1/2 bottom-3 z-10
            flex max-w-[85%] -translate-x-1/2 flex-col items-center gap-1.5
            opacity-0 translate-y-2
            transition-all duration-300
            group-hover:opacity-100 group-hover:translate-y-0
            pointer-events-none
          "
        >
          <div
            className="
              rounded-full border border-white/10 bg-black/55
              px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/85
              backdrop-blur-sm whitespace-nowrap
            "
            title={trackedStatusLabel}
          >
            {trackedStatusLabel}
          </div>

          {trackedProgressLabel && (
            <div
              className="
                rounded-full border border-white/10 bg-black/55
                px-3 py-1 text-[10px] font-medium text-white/85
                backdrop-blur-sm whitespace-nowrap
              "
              title={trackedProgressLabel}
            >
              {trackedProgressLabel}
            </div>
          )}
        </div>
      )}

      <div
        className="
          absolute inset-0
          flex flex-col items-center justify-center
          px-3 text-center
          opacity-0 group-hover:opacity-100
          transition-all duration-300
        "
      >
        <p
          className="
            text-white text-sm font-semibold
            translate-y-2 group-hover:translate-y-0
            transition-all duration-300
            line-clamp-2
          "
        >
          {title}
        </p>

        {subtitleParts.length > 0 && (
          <p
            className="
              mt-2 text-white/85 text-xs
              translate-y-2 group-hover:translate-y-0
              transition-all duration-300 delay-75
            "
          >
            {subtitleParts.join(" • ")}
          </p>
        )}

        {seasonText && (
          <p
            className="
              mt-1 text-white/70 text-[11px]
              translate-y-2 group-hover:translate-y-0
              transition-all duration-300 delay-100
            "
          >
            {seasonText}
          </p>
        )}
      </div>
    </div>
  );
}

function buildTrackedProgressLabel(
  entry: TrackedAnimeEntry,
  animeEpisodes?: number | null
) {
  const totalEpisodes = entry.episodes ?? animeEpisodes ?? null;

  if (
    entry.status === "watching" ||
    entry.status === "paused" ||
    entry.status === "completed"
  ) {
    if (totalEpisodes) {
      return `${entry.progress}/${totalEpisodes}`;
    }

    return `${entry.progress}`;
  }

  return null;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
