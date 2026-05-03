import { AnimeCard } from "./AnimeCard";
import type { TitleLanguage } from "../utils/titlePreference";

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

type ResultsGridProps = {
  results: Anime[];
  onSelectAnime: (id: number) => void;
  trackedEntries: TrackedAnimeEntry[];
  onQuickAdd: (anime: Anime) => void;
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
        px-10 mt-10
      "
    >
      {results.map((anime) => {
        const trackedEntry = trackedEntries.find(
          (entry) => entry.anime_id === anime.id
        );

        return (
          <AnimeCard
            key={anime.id}
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
