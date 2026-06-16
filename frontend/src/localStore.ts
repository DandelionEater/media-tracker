type LocalSettings = {
  themeAccent: string;
  titleLanguage: string;
  showTrendingCarousel: boolean;
  autoRotateTrending: boolean;
  autoScrollHomeShelves: boolean;
  hideAdultContent: boolean;
};

type LocalState = {
  version: 2;
  userId: number;
  settings: LocalSettings | null;
  anime: Record<string, any>;
  entries: Record<string, any>;
  dirtyEntries: Record<string, boolean>;
  deletedEntries: Record<string, any>;
  syncHistory: any[];
  autoSyncEnabled: boolean;
};

const DB_NAME = "seenary-local";
const DB_VERSION = 1;
const STATE_STORE = "userStates";
const LEGACY_STATE_PREFIX = "seenary.local-user.";
const LEGACY_MIGRATED_PREFIX = "seenary.indexeddb-migrated.";
const BACKUP_FORMAT = "seenary.local-backup";
const BACKUP_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  themeAccent: "cyan",
  titleLanguage: "userPreferred",
  showTrendingCarousel: true,
  autoRotateTrending: true,
  autoScrollHomeShelves: true,
  hideAdultContent: true,
};

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: "userId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function runStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | T
) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STATE_STORE, mode);
        const store = transaction.objectStore(STATE_STORE);
        let directResult: T | undefined;

        try {
          const result = operation(store);

          if (result instanceof IDBRequest) {
            result.onsuccess = () => resolve(result.result);
            result.onerror = () => reject(result.error);
            return;
          }

          directResult = result;
        } catch (error) {
          reject(error);
          return;
        }

        transaction.oncomplete = () => resolve(directResult as T);
        transaction.onerror = () => reject(transaction.error);
      })
  );
}

function createEmptyState(userId: number): LocalState {
  return {
    version: 2,
    userId,
    settings: null,
    anime: {},
    entries: {},
    dirtyEntries: {},
    deletedEntries: {},
    syncHistory: [],
    autoSyncEnabled: true,
  };
}

function normalizeState(userId: number, value: any): LocalState {
  return {
    version: 2,
    userId,
    settings: value?.settings ?? null,
    anime: value?.anime && typeof value.anime === "object" ? value.anime : {},
    entries: value?.entries && typeof value.entries === "object" ? value.entries : {},
    dirtyEntries:
      value?.dirtyEntries && typeof value.dirtyEntries === "object" ? value.dirtyEntries : {},
    deletedEntries:
      value?.deletedEntries && typeof value.deletedEntries === "object" ? value.deletedEntries : {},
    syncHistory: Array.isArray(value?.syncHistory) ? value.syncHistory : [],
    autoSyncEnabled:
      typeof value?.autoSyncEnabled === "boolean" ? value.autoSyncEnabled : true,
  };
}

function getLegacyStateKey(userId: number) {
  return `${LEGACY_STATE_PREFIX}${userId}`;
}

function getLegacyMigratedKey(userId: number) {
  return `${LEGACY_MIGRATED_PREFIX}${userId}`;
}

async function readLegacyState(userId: number) {
  try {
    if (window.localStorage.getItem(getLegacyMigratedKey(userId)) === "true") {
      return null;
    }

    const raw = window.localStorage.getItem(getLegacyStateKey(userId));
    return raw ? normalizeState(userId, JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function markLegacyMigrated(userId: number) {
  try {
    window.localStorage.setItem(getLegacyMigratedKey(userId), "true");
  } catch {
    // Keep IndexedDB usable even if localStorage is blocked.
  }
}

async function readState(userId: number): Promise<LocalState> {
  const stored = await runStore<LocalState | undefined>("readonly", (store) => store.get(userId));

  if (stored) {
    return normalizeState(userId, stored);
  }

  const legacyState = await readLegacyState(userId);
  const state = legacyState ?? createEmptyState(userId);
  await writeState(userId, state);

  if (legacyState) {
    markLegacyMigrated(userId);
  }

  return state;
}

async function writeState(userId: number, state: LocalState) {
  await runStore("readwrite", (store) => store.put(normalizeState(userId, state)));
}

function toDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeAnime(media: any) {
  if (!media?.id) return null;

  return {
    anime_id: Number(media.id),
    title_romaji: media.title?.romaji ?? null,
    title_english: media.title?.english ?? null,
    title_native: media.title?.native ?? null,
    title_preferred: media.title?.userPreferred ?? null,
    cover_image_large: media.coverImage?.large ?? null,
    banner_image: media.bannerImage ?? null,
    episodes: media.episodes ?? null,
    format: media.format ?? null,
    anime_status: media.status ?? null,
    season: media.season ?? null,
    season_year: media.seasonYear ?? null,
    average_score: media.averageScore ?? null,
    mean_score: media.meanScore ?? null,
    popularity: media.popularity ?? null,
    favourites: media.favourites ?? null,
    duration: media.duration ?? null,
    source: media.source ?? null,
    country_of_origin: media.countryOfOrigin ?? null,
    start_date: media.startDate ?? null,
    end_date: media.endDate ?? null,
    genres: media.genres ?? [],
    recommendations: media.recommendations?.nodes ?? media.recommendations ?? [],
    external_ids: {
      anilist: String(media.id),
      mal: media.source?.provider === "mal" ? String(media.source.animeId) : null,
    },
    details: media,
  };
}

function normalizePreviewAnime(item: any) {
  if (!item?.animeId) return null;

  return {
    anime_id: Number(item.animeId),
    title_romaji: item.title?.romaji ?? null,
    title_english: item.title?.english ?? null,
    title_native: item.title?.native ?? null,
    title_preferred: item.title?.userPreferred ?? null,
    cover_image_large: item.coverImage?.large ?? null,
    episodes: item.episodes ?? null,
    format: item.format ?? null,
    season: item.season ?? null,
    season_year: item.seasonYear ?? null,
    average_score: item.averageScore ?? null,
    genres: [],
    recommendations: [],
    external_ids: {
      anilist: String(item.animeId),
      mal: item.source?.provider === "mal" ? String(item.source.animeId) : null,
    },
    details: item.media ?? null,
  };
}

function sanitizeStatus(status: unknown) {
  const value = String(status || "").trim().toLowerCase();
  return ["planned", "watching", "completed", "paused", "dropped"].includes(value)
    ? value
    : "planned";
}

function buildEntry(animeId: number, payload: any, existing: any | null) {
  const now = new Date().toISOString();
  const status = sanitizeStatus(payload?.status ?? existing?.status);
  let startedAt =
    payload?.startedAt !== undefined ? toDateValue(payload.startedAt) : existing?.started_at ?? null;
  let completedAt =
    payload?.completedAt !== undefined
      ? toDateValue(payload.completedAt)
      : existing?.completed_at ?? null;

  if (status === "watching" && !startedAt) {
    startedAt = todayDate();
  }

  if (status === "completed") {
    startedAt = startedAt || todayDate();
    completedAt = completedAt || todayDate();
  }

  if (!["completed", "dropped"].includes(status) && payload?.completedAt === undefined) {
    completedAt = null;
  }

  return {
    ...(existing ?? {}),
    anime_id: animeId,
    status,
    is_favorite:
      payload?.isFavorite === undefined ? existing?.is_favorite ?? 0 : payload.isFavorite ? 1 : 0,
    repeat_count: Math.max(
      0,
      Math.floor(Number(payload?.repeatCount ?? existing?.repeat_count ?? 0))
    ),
    is_rewatching:
      payload?.isRewatching === undefined
        ? existing?.is_rewatching ?? 0
        : payload.isRewatching
          ? 1
          : 0,
    progress: Math.max(0, Math.floor(Number(payload?.progress ?? existing?.progress ?? 0))),
    score:
      payload?.score === null || payload?.score === undefined || payload?.score === ""
        ? null
        : Number(payload.score),
    notes: payload?.notes ? String(payload.notes).trim() : null,
    started_at: startedAt,
    completed_at: completedAt,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

function mergeEntryWithAnime(entry: any, anime: any) {
  return {
    ...anime,
    ...entry,
    anime_id: entry.anime_id,
  };
}

export const localStore = {
  async getSettings(userId: number) {
    const state = await readState(userId);
    return state.settings ?? DEFAULT_LOCAL_SETTINGS;
  },

  async updateSettings(userId: number, settings: Partial<LocalSettings>) {
    const state = await readState(userId);
    state.settings = {
      ...DEFAULT_LOCAL_SETTINGS,
      ...(state.settings ?? {}),
      ...settings,
    };
    await writeState(userId, state);
    return state.settings;
  },

  async getAutoSyncEnabled(userId: number) {
    return (await readState(userId)).autoSyncEnabled;
  },

  async setAutoSyncEnabled(userId: number, enabled: boolean) {
    const state = await readState(userId);
    state.autoSyncEnabled = enabled;
    await writeState(userId, state);
    return enabled;
  },

  async cacheAnime(userId: number, media: any) {
    const anime = normalizeAnime(media);
    if (!anime) return { ok: false, message: "Invalid anime data." };

    const state = await readState(userId);
    state.anime[String(anime.anime_id)] = {
      ...(state.anime[String(anime.anime_id)] ?? {}),
      ...anime,
    };
    await writeState(userId, state);
    return { ok: true };
  },

  async cachePreviewAnime(userId: number, item: any) {
    const anime = normalizePreviewAnime(item);
    if (!anime) return;

    const state = await readState(userId);
    state.anime[String(anime.anime_id)] = {
      ...(state.anime[String(anime.anime_id)] ?? {}),
      ...anime,
    };
    await writeState(userId, state);
  },

  async getList(userId: number) {
    const state = await readState(userId);
    return Object.values(state.entries)
      .map((entry) => mergeEntryWithAnime(entry, state.anime[String(entry.anime_id)] ?? {}))
      .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  },

  async importLegacyEntries(userId: number, entries: any[]) {
    const state = await readState(userId);
    let imported = 0;

    for (const entry of entries) {
      const animeId = Number(entry?.anime_id);
      if (!Number.isInteger(animeId) || animeId <= 0 || state.entries[String(animeId)]) {
        continue;
      }

      state.anime[String(animeId)] = {
        anime_id: animeId,
        title_romaji: entry.title_romaji ?? null,
        title_english: entry.title_english ?? null,
        title_native: entry.title_native ?? null,
        title_preferred: entry.title_preferred ?? null,
        cover_image_large: entry.cover_image_large ?? null,
        banner_image: entry.banner_image ?? null,
        episodes: entry.episodes ?? null,
        format: entry.format ?? null,
        anime_status: entry.anime_status ?? null,
        season: entry.season ?? null,
        season_year: entry.season_year ?? null,
        average_score: entry.average_score ?? null,
        genres: entry.genres ?? [],
        recommendations: entry.recommendations ?? [],
      };
      state.entries[String(animeId)] = {
        anime_id: animeId,
        status: entry.status,
        is_favorite: entry.is_favorite ?? 0,
        repeat_count: entry.repeat_count ?? 0,
        is_rewatching: entry.is_rewatching ?? 0,
        progress: entry.progress ?? 0,
        score: entry.score ?? null,
        notes: entry.notes ?? null,
        started_at: entry.started_at ?? null,
        completed_at: entry.completed_at ?? null,
        created_at: entry.created_at ?? new Date().toISOString(),
        updated_at: entry.updated_at ?? new Date().toISOString(),
      };
      imported += 1;
    }

    if (imported > 0) {
      await writeState(userId, state);
    }

    return imported;
  },

  async getEntry(userId: number, animeId: number) {
    const state = await readState(userId);
    const entry = state.entries[String(animeId)];
    if (!entry) return null;
    return mergeEntryWithAnime(entry, state.anime[String(animeId)] ?? {});
  },

  async saveEntry(
    userId: number,
    animeId: number,
    payload: any,
    options: { markDirty?: boolean } = {}
  ) {
    const state = await readState(userId);
    const key = String(animeId);
    const existing = state.entries[key] ?? null;
    state.entries[key] = buildEntry(animeId, payload, existing);
    if (options.markDirty !== false) {
      state.dirtyEntries[key] = true;
    }
    delete state.deletedEntries[key];
    await writeState(userId, state);

    return {
      ok: true,
      message: existing ? "List entry updated." : "Anime added to your list.",
      entry: mergeEntryWithAnime(state.entries[key], state.anime[key] ?? {}),
    };
  },

  async removeEntry(userId: number, animeId: number) {
    const state = await readState(userId);
    const key = String(animeId);
    if (!state.entries[key]) {
      return { ok: false, message: "Entry not found." };
    }

    state.deletedEntries[key] = {
      anime_id: animeId,
      external_ids: state.anime[key]?.external_ids ?? { anilist: key, mal: null },
      title:
        state.anime[key]?.title_preferred ??
        state.anime[key]?.title_english ??
        state.anime[key]?.title_romaji ??
        `Anime #${animeId}`,
      deleted_at: new Date().toISOString(),
    };
    delete state.entries[key];
    delete state.dirtyEntries[key];
    await writeState(userId, state);
    return { ok: true, message: "Anime removed from your list." };
  },

  async clearList(userId: number) {
    const state = await readState(userId);
    const removedCount = Object.keys(state.entries).length;
    state.deletedEntries = {
      ...state.deletedEntries,
      ...Object.fromEntries(
        Object.keys(state.entries).map((key) => [
          key,
          {
            anime_id: Number(key),
            external_ids: state.anime[key]?.external_ids ?? { anilist: key, mal: null },
            title:
              state.anime[key]?.title_preferred ??
              state.anime[key]?.title_english ??
              state.anime[key]?.title_romaji ??
              `Anime #${key}`,
            deleted_at: new Date().toISOString(),
          },
        ])
      ),
    };
    state.entries = {};
    state.dirtyEntries = {};
    await writeState(userId, state);
    return {
      ok: true,
      message:
        removedCount > 0
          ? `Cleared ${removedCount} entr${removedCount === 1 ? "y" : "ies"} from your list.`
          : "Your list was already empty.",
      removedCount,
    };
  },

  async getSyncPayload(userId: number) {
    const state = await readState(userId);
    const entries = Object.keys(state.dirtyEntries).flatMap((key) => {
      const entry = state.entries[key];
      if (!entry) return [];
      const anime = state.anime[String(entry.anime_id)] ?? {};

      return [
        {
          ...entry,
          title_romaji: anime.title_romaji ?? null,
          title_english: anime.title_english ?? null,
          title_native: anime.title_native ?? null,
          title_preferred: anime.title_preferred ?? null,
          episodes: anime.episodes ?? null,
          season_year: anime.season_year ?? null,
          external_ids: anime.external_ids ?? { anilist: String(entry.anime_id), mal: null },
        },
      ];
    });

    return {
      entries,
      deletedEntries: Object.values(state.deletedEntries),
    };
  },

  async getPendingSyncCount(userId: number) {
    const state = await readState(userId);
    return Object.keys(state.dirtyEntries).length + Object.keys(state.deletedEntries).length;
  },

  async markSynced(userId: number, result: any) {
    const state = await readState(userId);
    for (const item of result?.activity ?? []) {
      if (item?.status === "completed" && item?.anime_id) {
        delete state.dirtyEntries[String(item.anime_id)];
        if (String(item.operation || "").startsWith("delete_")) {
          delete state.deletedEntries[String(item.anime_id)];
        }
      }
    }
    state.syncHistory = [
      ...(result?.activity ?? []).map((item: any) => ({
        ...item,
        created_at: item.created_at ?? new Date().toISOString(),
      })),
      ...state.syncHistory,
    ].slice(0, 100);
    await writeState(userId, state);
  },

  async replaceEntriesFromImport(userId: number, importResult: any) {
    const items = importResult?.localEntries ?? [];

    for (const item of items) {
      await this.cachePreviewAnime(userId, item);
      await this.saveEntry(
        userId,
        Number(item.animeId),
        {
          status: item.status,
          progress: item.progress ?? 0,
          score: item.score ?? null,
          notes: item.notes ?? null,
          startedAt: item.startedAt ?? null,
          completedAt: item.completedAt ?? null,
          repeatCount: item.repeatCount ?? 0,
        },
        { markDirty: false }
      );
    }
  },

  async getSyncActivity(userId: number) {
    const state = await readState(userId);
    return {
      pending: [
        ...Object.keys(state.dirtyEntries).flatMap((key) => {
          const entry: any = state.entries[key];
          if (!entry) return [];
          return [
            {
              anime_id: entry.anime_id,
              animeTitle:
                state.anime[String(entry.anime_id)]?.title_preferred ??
                state.anime[String(entry.anime_id)]?.title_english ??
                state.anime[String(entry.anime_id)]?.title_romaji ??
                `Anime #${entry.anime_id}`,
              operation: "upsert_local_entry",
              status: "pending",
              created_at: entry.updated_at,
            },
          ];
        }),
        ...Object.values(state.deletedEntries).map((entry: any) => ({
          anime_id: entry.anime_id,
          animeTitle: entry.title,
          operation: "delete_local_entry",
          status: "pending",
          created_at: entry.deleted_at,
        })),
      ],
      completed: state.syncHistory.filter((item) => item.status === "completed"),
      failed: state.syncHistory.filter((item) => item.status === "failed"),
    };
  },

  async exportBackup(userId: number, username: string) {
    const state = await readState(userId);

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      username,
      data: {
        settings: state.settings,
        anime: state.anime,
        entries: state.entries,
      },
    };
  },

  async importBackup(userId: number, backup: any) {
    if (backup?.format !== BACKUP_FORMAT || !backup?.data) {
      return {
        ok: false,
        message: "This does not look like a Seenary backup file.",
      };
    }

    const state = await readState(userId);
    const incomingEntries =
      backup.data.entries && typeof backup.data.entries === "object" ? backup.data.entries : {};
    const incomingAnime =
      backup.data.anime && typeof backup.data.anime === "object" ? backup.data.anime : {};
    let imported = 0;

    state.settings = backup.data.settings ?? state.settings;
    state.anime = {
      ...state.anime,
      ...incomingAnime,
    };

    for (const [key, entry] of Object.entries(incomingEntries)) {
      const animeId = Number((entry as any)?.anime_id ?? key);
      if (!Number.isInteger(animeId) || animeId <= 0) {
        continue;
      }

      state.entries[String(animeId)] = entry;
      state.dirtyEntries[String(animeId)] = true;
      delete state.deletedEntries[String(animeId)];
      imported += 1;
    }

    await writeState(userId, state);

    return {
      ok: true,
      message: `Imported ${imported} backup entr${imported === 1 ? "y" : "ies"}.`,
      imported,
    };
  },
};
