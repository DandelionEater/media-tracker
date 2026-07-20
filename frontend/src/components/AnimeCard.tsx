import {
  BookmarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";
import type { SearchMedia, TrackedMediaEntry } from "../types/domain";

type MediaCardProps = {
  media: SearchMedia;
  onSelect?: (id: number) => void;
  trackedEntry?: TrackedMediaEntry;
  onQuickAdd?: (media: SearchMedia) => void;
  onEditEntry: (entry: TrackedMediaEntry) => void;
  titleLanguage: TitleLanguage;
};

const STATUS_LABELS: Record<TrackedMediaEntry["status"], string> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};

export function MediaCard({
  media,
  onSelect,
  trackedEntry,
  onQuickAdd,
  onEditEntry,
  titleLanguage,
}: MediaCardProps) {
  const title = getPreferredTitle(media.title, titleLanguage);
  const isManga = media.type === "MANGA";

  const subtitleParts = [
    media.format,
    isManga && media.chapters ? `${media.chapters} ch` : null,
    isManga && media.volumes ? `${media.volumes} vols` : null,
    !isManga && media.episodes ? `${media.episodes} eps` : null,
    media.averageScore ? `${media.averageScore}%` : null,
  ].filter(Boolean);

  const seasonText =
    media.season && media.seasonYear
      ? `${capitalize(media.season)} ${media.seasonYear}`
      : media.seasonYear
      ? String(media.seasonYear)
      : null;

  const trackedStatusLabel = trackedEntry
    ? trackedEntry.status === "watching" && isManga
      ? "Reading"
      : STATUS_LABELS[trackedEntry.status]
    : null;

  const trackedProgressLabel = trackedEntry
    ? buildTrackedProgressLabel(trackedEntry, isManga ? media.chapters : media.episodes)
    : null;

  return (
    <div
      className={`browse-search-card group relative focus:outline-none focus:ring-2 focus:ring-white/60 ${
        onSelect ? "cursor-pointer" : "cursor-default"
      }`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(media.id)}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(media.id);
        }
      }}
    >
      <div className="browse-search-poster relative aspect-2/3 overflow-hidden rounded-2xl">
      <img
        src={media.coverImage.large}
        alt={title}
        className="
          w-full h-full object-cover
          transition-all duration-300
          group-hover:brightness-50
          group-hover:blur-[2px]
        "
      />

      {onQuickAdd ? <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();

          if (trackedEntry) {
            onEditEntry(trackedEntry);
            return;
          }

          onQuickAdd(media);
        }}
        className="
          absolute right-2 top-2 z-20
          inline-flex h-8 w-8 items-center justify-center
          rounded-xl border border-[var(--app-accent)]/35 bg-black/55 text-white/90
          backdrop-blur-sm
          transition-all duration-300
          hover:bg-[var(--app-accent-soft)] hover:text-white
          opacity-100 scale-100
        "
        title={trackedEntry ? "Edit list entry" : "Add to list"}
      >
        {trackedEntry ? (
          <BookmarkIcon className="h-4 w-4" />
        ) : (
          <PlusIcon className="h-4 w-4" />
        )}
      </button> : (
        <div className="absolute right-2 top-2 z-20 rounded-xl border border-cyan-300/20 bg-cyan-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100 backdrop-blur-sm">
          Manga
        </div>
      )}

      {media.isAdult && (
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
          browse-search-overlay
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

      <div className="browse-search-gallery-info hidden pt-3">
        <p className="line-clamp-2 text-sm font-semibold text-white">{title}</p>
        {subtitleParts.length > 0 && (
          <p className="mt-1 truncate text-xs text-white/45">
            {subtitleParts.join(" • ")}
          </p>
        )}
      </div>
    </div>
  );
}

function buildTrackedProgressLabel(
  entry: TrackedMediaEntry,
  totalFromSearch?: number | null
) {
  const total = entry.media_type === "MANGA"
    ? entry.chapters ?? entry.episodes ?? totalFromSearch ?? null
    : entry.episodes ?? totalFromSearch ?? null;

  if (
    entry.status === "watching" ||
    entry.status === "paused" ||
    entry.status === "completed"
  ) {
    if (total) {
      return `${entry.progress}/${total}`;
    }

    return `${entry.progress}`;
  }

  return null;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

// Compatibility export for callers that still use the original Anime-only name.
export const AnimeCard = MediaCard;
