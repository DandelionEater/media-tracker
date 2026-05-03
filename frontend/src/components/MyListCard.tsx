import {
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

type MyListCardProps = {
  entry: MyListEntry;
  statusLabel: string;
  onOpen: (animeId: number) => void;
  onEdit: (entry: MyListEntry) => void;
  titleLanguage: TitleLanguage;
  searchQuery?: string;
};

export function MyListCard({
  entry,
  statusLabel,
  onOpen,
  onEdit,
  titleLanguage,
  searchQuery = "",
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
  const hasSearchMatch = matchesEntry(entry, normalizedQuery, title);
  const isFavorite = Boolean(entry.is_favorite);

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-xl transition-all duration-200 ease-out hover:scale-[1.01] hover:bg-white/[0.07]">
      <div className="absolute inset-0 bg-linear-to-r from-white/2 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <span className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/60">
        {statusLabel}
      </span>

      <button
        onClick={() => onEdit(entry)}
        className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/70 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white active:scale-95"
      >
        <PencilSquareIcon className="h-4 w-4" />
        Edit
      </button>

      <div className="relative flex items-start gap-4 p-4 pr-28">
        <button
          onClick={() => onOpen(entry.anime_id)}
          className="flex min-w-0 flex-1 items-start gap-4 text-left"
        >
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/5">
            {entry.cover_image_large ? (
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
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-base font-semibold text-white">
                  <HighlightedText text={title} query={normalizedQuery} />
                </h3>
                {isFavorite && (
                  <HeartIcon className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
                )}
              </div>

              {subtitleParts.length > 0 && (
                <p className="mt-1 truncate text-sm text-white/45">
                  {subtitleParts.join(" - ")}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/65">
                Progress: {progressLabel}
              </span>

              {entry.score !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-3 py-1 text-xs text-white/65">
                  <StarIcon className="h-3.5 w-3.5" />
                  {entry.score}
                </span>
              )}

              {entry.average_score !== null && (
                <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/45">
                  Avg: {entry.average_score}%
                </span>
              )}
            </div>

            {entry.notes?.trim() && (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/42">
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
