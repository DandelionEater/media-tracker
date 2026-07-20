import { MediaCard } from "./AnimeCard";
import type { TitleLanguage } from "../utils/titlePreference";
import type { SearchMedia, TrackedMediaEntry } from "../types/domain";

type ResultsGridProps = {
  results: SearchMedia[];
  onSelectMedia?: (id: number) => void;
  trackedEntries: TrackedMediaEntry[];
  onQuickAdd?: (media: SearchMedia) => void;
  onEditEntry: (entry: TrackedMediaEntry) => void;
  titleLanguage: TitleLanguage;
};

export function ResultsGrid({
  results,
  onSelectMedia,
  trackedEntries,
  onQuickAdd,
  onEditEntry,
  titleLanguage,
}: ResultsGridProps) {
  return (
    <div
      className="
        grid
        grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6
        gap-4
      "
    >
      {results.map((media) => {
        const trackedEntry = trackedEntries.find((entry) => {
          const entryType = entry.media_type === "MANGA" ? "MANGA" : "ANIME";
          const entryId = "manga_id" in entry ? entry.manga_id : entry.anime_id;
          return entryType === media.type && entryId === media.id;
        });

        return (
          <MediaCard
            key={`${media.type}:${media.id}`}
            media={media}
            onSelect={onSelectMedia}
            trackedEntry={trackedEntry}
            onQuickAdd={onQuickAdd}
            onEditEntry={onEditEntry}
            titleLanguage={titleLanguage}
          />
        );
      })}
    </div>
  );
}
