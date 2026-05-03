export type TitleLanguage = "userPreferred" | "english" | "romaji" | "native";

type AnimeTitle = {
  userPreferred?: string | null;
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
};

export function getPreferredTitle(
  title: AnimeTitle | null | undefined,
  titleLanguage: TitleLanguage
) {
  if (!title) return "Unknown title";

  const orderedTitles = [
    title[titleLanguage],
    title.userPreferred,
    title.english,
    title.romaji,
    title.native,
  ];

  return orderedTitles.find((value) => value?.trim()) || "Unknown title";
}
