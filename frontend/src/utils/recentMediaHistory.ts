import type { AnimeMedia, AnimeTitle, MediaType } from "../types/domain";

const RECENT_MEDIA_HISTORY_KEY = "seenary.recent-media-history";
const MAX_RECENT_ENTRIES_PER_TYPE = 15;

export type RecentMediaHistoryEntry = {
  mediaId: number;
  mediaType: MediaType;
  title: AnimeTitle;
  coverImage: string | null;
  format: string | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  isAdult: boolean;
  openedAt: number;
};

function getStorageKey(userId: number) {
  return `${RECENT_MEDIA_HISTORY_KEY}.${userId}`;
}

function isMediaType(value: unknown): value is MediaType {
  return value === "ANIME" || value === "MANGA";
}

function normalizeEntry(value: unknown): RecentMediaHistoryEntry | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<RecentMediaHistoryEntry>;
  const mediaId = Number(candidate.mediaId);
  if (!Number.isInteger(mediaId) || mediaId <= 0 || !isMediaType(candidate.mediaType)) {
    return null;
  }

  const title =
    candidate.title && typeof candidate.title === "object"
      ? candidate.title
      : {};

  return {
    mediaId,
    mediaType: candidate.mediaType,
    title,
    coverImage: typeof candidate.coverImage === "string" ? candidate.coverImage : null,
    format: typeof candidate.format === "string" ? candidate.format : null,
    episodes: Number.isFinite(candidate.episodes) ? Number(candidate.episodes) : null,
    chapters: Number.isFinite(candidate.chapters) ? Number(candidate.chapters) : null,
    volumes: Number.isFinite(candidate.volumes) ? Number(candidate.volumes) : null,
    isAdult: candidate.isAdult === true,
    openedAt: Number.isFinite(candidate.openedAt) ? Number(candidate.openedAt) : 0,
  };
}

function limitEntries(entries: RecentMediaHistoryEntry[]) {
  const counts: Record<MediaType, number> = { ANIME: 0, MANGA: 0 };

  return entries.filter((entry) => {
    if (counts[entry.mediaType] >= MAX_RECENT_ENTRIES_PER_TYPE) return false;
    counts[entry.mediaType] += 1;
    return true;
  });
}

export function readRecentMediaHistory(userId: number) {
  try {
    const saved = window.localStorage.getItem(getStorageKey(userId));
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return limitEntries(
      parsed
        .map(normalizeEntry)
        .filter((entry): entry is RecentMediaHistoryEntry => entry !== null)
        .sort((left, right) => right.openedAt - left.openedAt)
    );
  } catch {
    return [];
  }
}

export function persistRecentMediaHistory(
  userId: number,
  entries: RecentMediaHistoryEntry[]
) {
  const limitedEntries = limitEntries(entries);
  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(limitedEntries));
  return limitedEntries;
}

export function recordRecentMedia(
  userId: number,
  mediaType: MediaType,
  media: AnimeMedia
) {
  const nextEntry: RecentMediaHistoryEntry = {
    mediaId: media.id,
    mediaType,
    title: media.title ?? {},
    coverImage: media.coverImage?.large ?? media.coverImage?.extraLarge ?? null,
    format: media.format ?? null,
    episodes: media.episodes ?? null,
    chapters: media.chapters ?? null,
    volumes: media.volumes ?? null,
    isAdult: media.isAdult === true,
    openedAt: Date.now(),
  };
  const remainingEntries = readRecentMediaHistory(userId).filter(
    (entry) =>
      entry.mediaId !== nextEntry.mediaId || entry.mediaType !== nextEntry.mediaType
  );

  return persistRecentMediaHistory(userId, [nextEntry, ...remainingEntries]);
}

export function dismissRecentMedia(
  userId: number,
  mediaType: MediaType,
  mediaId: number
) {
  return persistRecentMediaHistory(
    userId,
    readRecentMediaHistory(userId).filter(
      (entry) => entry.mediaId !== mediaId || entry.mediaType !== mediaType
    )
  );
}
