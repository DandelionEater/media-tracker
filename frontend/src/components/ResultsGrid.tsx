import { AnimeCard } from "./AnimeCard";
import type { TitleLanguage } from "../utils/titlePreference";
import type { SearchMedia, TrackedAnimeEntry } from "../types/domain";

type ResultsGridProps = {
  results: SearchMedia[];
  onSelectAnime?: (id: number) => void;
  trackedEntries: TrackedAnimeEntry[];
  onQuickAdd?: (anime: SearchMedia) => void;
  onEditEntry: (entry: TrackedAnimeEntry) => void;
  titleLanguage: TitleLanguage;
};

export function ResultsGrid({
  results,
  onSelectAnime,
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
      {results.map((anime) => {
        const trackedEntry = anime.type === "ANIME" ? trackedEntries.find(
          (entry) => entry.anime_id === anime.id
        ) : undefined;

        return (
          <AnimeCard
            key={`${anime.type}:${anime.id}`}
            anime={anime}
            onSelect={onSelectAnime}
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
