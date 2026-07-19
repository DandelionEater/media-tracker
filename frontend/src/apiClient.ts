import { DEFAULT_LOCAL_SETTINGS, localStore } from "./localStore";
import type { AuthImportResult } from "./types/domain";

type ApiClient = typeof window.api;

type ImportOptions = {
  signal?: AbortSignal;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://api.seenary.app");

let pendingAniListLoginFlowId: string | null = null;
let pendingMalLoginFlowId: string | null = null;
let activeUserId: number | null = null;
let localAutoSyncTimer: number | null = null;
const localAutoSyncListeners = new Set<(result: AutoSyncCompleteEvent) => void>();
const LOCAL_AUTO_SYNC_DELAY_MS = 15_000;

async function rpc(method: string, args: unknown[] = [], options: { signal?: AbortSignal } = {}) {
  const response = await fetch(`${API_BASE_URL}/rpc`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method, args }),
    signal: options.signal,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || `API request failed with status ${response.status}`);
  }

  return payload;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  throw new DOMException("Import cancelled.", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildCancelledImportResult() {
  return {
    ok: false,
    cancelled: true,
    message: "Import cancelled.",
  };
}

function isThirdPartyImport(source: string) {
  return source === "AniList" || source === "MyAnimeList";
}

async function runLocalAutoSync(userId: number) {
  if (!(await localStore.getAutoSyncEnabled(userId))) {
    return;
  }

  if ((await localStore.getPendingSyncCount(userId)) <= 0) {
    return;
  }

  const result = await rpc("runSyncNow", [await localStore.getSyncPayload(userId)]);
  await localStore.markSynced(userId, result);

  if ((result.synced ?? 0) > 0 || (result.failed ?? 0) > 0 || (!result.ok && result.pending > 0)) {
    localAutoSyncListeners.forEach((listener) => listener(result));
  }
}

function scheduleLocalAutoSync(userId: number) {
  if (localAutoSyncTimer !== null) {
    window.clearTimeout(localAutoSyncTimer);
  }

  localAutoSyncTimer = window.setTimeout(() => {
    localAutoSyncTimer = null;
    runLocalAutoSync(userId).catch((error) => {
      console.error("Auto sync failed:", error);
    });
  }, LOCAL_AUTO_SYNC_DELAY_MS);
}

function openPopup(url: string, name = "seenary-oauth") {
  const popup = window.open(url, name, "width=560,height=720,popup=yes");

  if (!popup) {
    if (window.desktopUpdater) {
      return null;
    }

    throw new Error("Allow popups so Seenary can open the authorization page.");
  }

  popup.focus();
  return popup;
}

async function waitForAniListFlow(method: string, flowId: string, popup: Window | null) {
  const startedAt = Date.now();
  const timeoutMs = 10 * 60 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    const result = await rpc(method, [flowId]);

    if (result.done) {
      return result;
    }

    if (popup?.closed) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
  }

  throw new Error("AniList authorization timed out.");
}

async function startAniListLogin() {
  const start = await rpc("startAniListLogin");

  if (!start.pendingOAuth) {
    return start;
  }

  const popup = openPopup(start.authUrl);
  const result = await waitForAniListFlow("pollAniListLogin", start.flowId, popup);

  if (result.needsProfile) {
    pendingAniListLoginFlowId = start.flowId;
  }

  if (result.user?.id) {
    activeUserId = result.user.id;
  }

  await saveAuthImportLocally(result);

  return result;
}

async function completeAniListLogin(username: string) {
  const result = await rpc("completeAniListLogin", [username, pendingAniListLoginFlowId]);

  if (result.ok) {
    pendingAniListLoginFlowId = null;
  }

  if (result.user?.id) {
    activeUserId = result.user.id;
  }

  await saveAuthImportLocally(result);

  return result;
}

async function linkAniListAccount() {
  const start = await rpc("linkAniListAccount");

  if (!start.pendingOAuth) {
    await saveAuthImportLocally(start);
    return start;
  }

  const popup = openPopup(start.authUrl);
  const result = await waitForAniListFlow("pollAniListLink", start.flowId, popup);
  await saveAuthImportLocally(result);
  return result;
}

async function waitForMalFlow(method: string, flowId: string, popup: Window | null) {
  const startedAt = Date.now();
  const timeoutMs = 10 * 60 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    const result = await rpc(method, [flowId]);

    if (result.done) {
      return result;
    }

    if (popup?.closed) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
  }

  throw new Error("MyAnimeList authorization timed out.");
}

async function startMalLogin() {
  const start = await rpc("startMalLogin");

  if (!start.pendingOAuth) {
    return start;
  }

  const popup = openPopup(start.authUrl, "seenary-mal-oauth");
  const result = await waitForMalFlow("pollMalLogin", start.flowId, popup);

  if (result.needsProfile) {
    pendingMalLoginFlowId = start.flowId;
  }

  if (result.user?.id) {
    activeUserId = result.user.id;
  }

  return result;
}

async function completeMalLogin(username: string) {
  const result = await rpc("completeMalLogin", [username, pendingMalLoginFlowId]);

  if (result.ok) {
    pendingMalLoginFlowId = null;
  }

  if (result.user?.id) {
    activeUserId = result.user.id;
  }

  return result;
}

async function linkMalAccount() {
  const start = await rpc("linkMalAccount");

  if (!start.pendingOAuth) {
    return start;
  }

  const popup = openPopup(start.authUrl, "seenary-mal-oauth");
  return await waitForMalFlow("pollMalLink", start.flowId, popup);
}

async function saveAuthImportLocally(result: AuthImportResult) {
  const userId = result?.user?.id ?? activeUserId;

  if (
    !userId ||
    (!result?.import?.localEntries?.length && !result?.import?.localMangaEntries?.length)
  ) {
    return;
  }

  activeUserId = userId;

  try {
    await localStore.replaceEntriesFromImport(userId, result.import);
  } catch (error) {
    console.error("Failed to save imported AniList entries locally:", error);
  }
}

async function getActiveUserId() {
  if (activeUserId) {
    return activeUserId;
  }

  const session = await rpc("getSession");
  activeUserId = session?.user?.id ?? null;
  return activeUserId;
}

async function requireActiveUserId() {
  const userId = await getActiveUserId();

  if (!userId) {
    throw new Error("You must be logged in.");
  }

  return userId;
}

async function getSession() {
  const session = await rpc("getSession");
  activeUserId = session?.user?.id ?? null;
  return session;
}

async function login(username: string, password: string) {
  const result = await rpc("login", [username, password]);

  if (result.user?.id) {
    activeUserId = result.user.id;
  }

  return result;
}

async function register(username: string, password: string) {
  const result = await rpc("register", [username, password]);

  if (result.user?.id) {
    activeUserId = result.user.id;
  }

  return result;
}

async function logout() {
  const result = await rpc("logout");
  activeUserId = null;
  return result;
}

function flattenPreviewEntries(result: AuthImportResult, selectedAnimeIds: number[] = []) {
  const selected = new Set(
    selectedAnimeIds.map((animeId) => Number(animeId)).filter((animeId) => animeId > 0)
  );
  const hasSelection = selected.size > 0;

  return (result.localEntries ?? result.preview?.groups?.flatMap((group) => group.items) ?? [])
    .filter((item) => !hasSelection || selected.has(Number(item.animeId)))
    .filter((item) => Number(item.animeId) > 0);
}

async function importLocalEntries(
  userId: number,
  result: AuthImportResult,
  selectedAnimeIds: number[] = [],
  fallbackSource = "Import",
  signal?: AbortSignal
) {
  throwIfAborted(signal);

  const items = flattenPreviewEntries(result, selectedAnimeIds);
  let imported = 0;
  let created = 0;
  let updated = 0;

  for (const item of items) {
    throwIfAborted(signal);
    await localStore.cachePreviewAnime(userId, item);
    throwIfAborted(signal);
    const existing = await localStore.getEntry(userId, Number(item.animeId));
    throwIfAborted(signal);
    const saved = await localStore.saveEntry(
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
        isFavorite: Boolean(existing?.is_favorite),
      },
      { markDirty: !isThirdPartyImport(fallbackSource) }
    );
    throwIfAborted(signal);

    if (saved.ok) {
      imported += 1;
      if (saved.unchanged) {
        // Already current locally.
      } else if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }
  }

  return {
    ok: true,
    message:
      result?.message ??
      `Imported ${imported} ${fallbackSource} entr${imported === 1 ? "y" : "ies"}.`,
    summary: {
      ...(result?.summary ?? {}),
      sourceUsername: result.summary?.sourceUsername ?? fallbackSource,
      totalFound: result?.summary?.totalFound ?? items.length,
      selectedStatuses: result.summary?.selectedStatuses ?? [],
      selectedAnimeIds,
      imported,
      created,
      updated,
      skipped: Math.max(0, (result?.summary?.totalFound ?? items.length) - imported),
    },
  };
}

export function installApiClient() {
  if (window.api) {
    return;
  }

  const api: ApiClient = {
    searchMedia: (query, hideAdultContent = true) =>
      rpc("searchMedia", [query, hideAdultContent]),
    searchAnime: (query, hideAdultContent = true) =>
      rpc("searchAnime", [query, hideAdultContent]),
    getTrendingAnime: (hideAdultContent = true) => rpc("getTrendingAnime", [hideAdultContent]),
    getDiscoverAnime: (hideAdultContent = true) => rpc("getDiscoverAnime", [hideAdultContent]),
    getDiscoverShelfAnime: (shelfId, page = 1, hideAdultContent = true) =>
      rpc("getDiscoverShelfAnime", [shelfId, page, hideAdultContent]),
    previewAniListImport: (username) => rpc("previewAniListImport", [username]),
    importAniList: async (username, selectedStatuses, selectedMediaKeys, options?: ImportOptions) => {
      try {
        throwIfAborted(options?.signal);
        const userId = await requireActiveUserId();
        throwIfAborted(options?.signal);
        const result = await rpc("importAniList", [username, selectedStatuses, selectedMediaKeys], {
          signal: options?.signal,
        });
        throwIfAborted(options?.signal);
        if (result?.localEntries || result?.localMangaEntries) {
          const summary = await localStore.replaceEntriesFromImport(userId, result);
          return {
            ...result,
            summary: {
              ...(result.summary ?? {}),
              ...summary,
              selectedMediaKeys,
            },
          };
        }
        return result;
      } catch (error) {
        if (isAbortError(error)) {
          return buildCancelledImportResult();
        }

        throw error;
      }
    },
    previewMalImport: (username) => rpc("previewMalImport", [username]),
    importMal: async (username, selectedStatuses, selectedMediaKeys, options?: ImportOptions) => {
      try {
        throwIfAborted(options?.signal);
        const userId = await requireActiveUserId();
        throwIfAborted(options?.signal);
        const result = await rpc("importMal", [username, selectedStatuses, selectedMediaKeys], {
          signal: options?.signal,
        });
        throwIfAborted(options?.signal);
        if (result?.localEntries || result?.localMangaEntries) {
          const summary = await localStore.replaceEntriesFromImport(userId, result);
          return {
            ...result,
            summary: {
              ...(result.summary ?? {}),
              ...summary,
              selectedMediaKeys,
            },
          };
        }
        return result;
      } catch (error) {
        if (isAbortError(error)) {
          return buildCancelledImportResult();
        }

        throw error;
      }
    },
    previewTextImport: (text, hideAdultContent = true, options?: ImportOptions) =>
      rpc("previewTextImport", [text, hideAdultContent], { signal: options?.signal }),
    previewPdfImport: (pdfBase64, hideAdultContent = true, options?: ImportOptions) =>
      rpc("previewPdfImport", [pdfBase64, hideAdultContent], { signal: options?.signal }),
    importTextList: async (entries, selectedAnimeIds, options?: ImportOptions) => {
      try {
        throwIfAborted(options?.signal);
        const userId = await requireActiveUserId();
        return importLocalEntries(
          userId,
          {
            message: `Imported ${entries.length} text entr${entries.length === 1 ? "y" : "ies"}.`,
            localEntries: entries,
            summary: { sourceUsername: "Text file", totalFound: entries.length },
          },
          selectedAnimeIds,
          "text",
          options?.signal
        );
      } catch (error) {
        if (isAbortError(error)) {
          return buildCancelledImportResult();
        }

        throw error;
      }
    },
    getSettings: async () => {
      const userId = await getActiveUserId();
      return userId ? await localStore.getSettings(userId) : DEFAULT_LOCAL_SETTINGS;
    },
    updateSettings: async (settings) => {
      const userId = await requireActiveUserId();
      return await localStore.updateSettings(userId, settings);
    },
    getSyncStatus: async () => {
      const userId = await requireActiveUserId();
      return rpc("getSyncStatus", [
        await localStore.getPendingSyncCount(userId),
        await localStore.getAutoSyncEnabled(userId),
      ]);
    },
    setAutoSync: async (enabled) => {
      const userId = await requireActiveUserId();
      await localStore.setAutoSyncEnabled(userId, Boolean(enabled));
      if (enabled && (await localStore.getPendingSyncCount(userId)) > 0) {
        scheduleLocalAutoSync(userId);
      }
      return rpc("setAutoSync", [Boolean(enabled), await localStore.getPendingSyncCount(userId)]);
    },
    runSyncNow: async () => {
      const userId = await requireActiveUserId();
      const result = await rpc("runSyncNow", [await localStore.getSyncPayload(userId)]);
      await localStore.markSynced(userId, result);
      return result;
    },
    pullFromAniList: async () => {
      const userId = await requireActiveUserId();
      const result = await rpc("pullFromAniList");
      if (result.ok) {
        const summary = await localStore.replaceEntriesFromImport(userId, result);
        const message = `Updated local Anime and Manga from AniList. ${summary.created} created, ${summary.updated} updated.${
          result.partial ? " Some remote entries could not be matched and were skipped." : ""
        }`;
        await localStore.recordPullActivity(userId, "anilist", message, summary, {
          partial: Boolean(result.partial),
          mappingFailures: result.summary?.mappingFailures,
        });
        return {
          ...result,
          message,
          summary: {
            ...(result.summary ?? {}),
            ...summary,
            totalFound: result.summary?.totalFound ?? result.localEntries?.length ?? 0,
          },
        };
      }
      return result;
    },
    pullFromMal: async () => {
      const userId = await requireActiveUserId();
      const result = await rpc("pullFromMal");
      if (result.ok) {
        const summary = await localStore.replaceEntriesFromImport(userId, result);
        const message = `Updated local Anime and Manga from MyAnimeList. ${summary.created} created, ${summary.updated} updated.${
          result.partial ? " Some remote entries could not be matched and were skipped." : ""
        }`;
        await localStore.recordPullActivity(userId, "mal", message, summary, {
          partial: Boolean(result.partial),
          mappingFailures: result.summary?.mappingFailures,
        });
        return {
          ...result,
          message,
          summary: {
            ...(result.summary ?? {}),
            ...summary,
            totalFound: result.summary?.totalFound ?? result.localEntries?.length ?? 0,
          },
        };
      }
      return result;
    },
    getSyncActivity: async () => {
      const userId = await requireActiveUserId();
      return { ok: true, ...(await localStore.getSyncActivity(userId)) };
    },
    getAnimeDetails: async (id) => {
      const userId = await getActiveUserId();
      const media = await rpc("getAnimeDetails", [id]);
      if (userId && media?.id) {
        await localStore.cacheAnime(userId, media);
      }
      return media;
    },
    getMediaDetails: async (mediaType, id) => {
      if (mediaType === "ANIME") {
        const userId = await getActiveUserId();
        const media = await rpc("getMediaDetails", [mediaType, id]);
        if (userId && media?.id) {
          await localStore.cacheAnime(userId, media);
        }
        return media;
      }

      const userId = await getActiveUserId();
      const media = await rpc("getMediaDetails", [mediaType, id]);
      if (userId && media?.id) {
        await localStore.cacheManga(userId, media);
      }
      return media;
    },
    getCharacterDetails: (id) => rpc("getCharacterDetails", [id]),
    getStaffDetails: (id) => rpc("getStaffDetails", [id]),
    cacheMinimalAnime: async (media) => {
      const userId = await requireActiveUserId();
      return await localStore.cacheAnime(userId, media);
    },
    register,
    login,
    startAniListLogin,
    completeAniListLogin,
    startMalLogin,
    completeMalLogin,
    getAniListLinkStatus: () => rpc("getAniListLinkStatus"),
    linkAniListAccount,
    resolveAniListLinkConflict: async (action) => {
      const result = await rpc("resolveAniListLinkConflict", [action]);
      await saveAuthImportLocally(result);
      return result;
    },
    getMalLinkStatus: () => rpc("getMalLinkStatus"),
    linkMalAccount,
    resolveMalLinkConflict: (action) => rpc("resolveMalLinkConflict", [action]),
    logout,
    getSession,
    setTutorialDismissed: (dismissed) => rpc("setTutorialDismissed", [dismissed]),
    getMyList: async () => {
      const userId = await requireActiveUserId();
      let entries = await localStore.getList(userId);

      if (!entries.length) {
        const legacy = await rpc("exportLegacyMyList").catch(() => null);
        if (legacy?.ok && legacy.entries?.length) {
          await localStore.importLegacyEntries(userId, legacy.entries);
          entries = await localStore.getList(userId);
        }
      }

      const missingAdultFlags = entries
        .filter(
          (entry) =>
            (entry.is_adult === null || entry.is_adult === undefined) &&
            (entry.details?.isAdult === null || entry.details?.isAdult === undefined)
        )
        .map((entry) => entry.anime_id);

      if (missingAdultFlags.length) {
        const flags = await rpc("getAnimeAdultFlags", [missingAdultFlags]).catch(() => []);
        if (Array.isArray(flags) && flags.length) {
          await localStore.cacheAnimeAdultFlags(userId, flags);
          entries = await localStore.getList(userId);
        }
      }

      return { ok: true, entries };
    },
    getMyListEntry: async (animeId) => {
      const userId = await requireActiveUserId();
      return { ok: true, entry: await localStore.getEntry(userId, Number(animeId)) };
    },
    saveMyListEntry: async (animeId, data) => {
      const userId = await requireActiveUserId();
      const result = await localStore.saveEntry(userId, Number(animeId), data);
      if (result.ok && !result.unchanged && (await localStore.getAutoSyncEnabled(userId))) {
        scheduleLocalAutoSync(userId);
      }
      return result;
    },
    removeMyListEntry: async (animeId) => {
      const userId = await requireActiveUserId();
      const result = await localStore.removeEntry(userId, Number(animeId));
      if (result.ok && (await localStore.getAutoSyncEnabled(userId))) {
        scheduleLocalAutoSync(userId);
      }
      return result;
    },
    getMyMangaList: async () => {
      const userId = await requireActiveUserId();
      return { ok: true, entries: await localStore.getMangaList(userId) };
    },
    getMyMangaListEntry: async (mangaId) => {
      const userId = await requireActiveUserId();
      return { ok: true, entry: await localStore.getMangaEntry(userId, Number(mangaId)) };
    },
    saveMyMangaListEntry: async (mangaId, data) => {
      const userId = await requireActiveUserId();
      const result = await localStore.saveMangaEntry(userId, Number(mangaId), data);
      if (result.ok && (await localStore.getAutoSyncEnabled(userId))) {
        scheduleLocalAutoSync(userId);
      }
      return result;
    },
    removeMyMangaListEntry: async (mangaId) => {
      const userId = await requireActiveUserId();
      const result = await localStore.removeMangaEntry(userId, Number(mangaId));
      if (result.ok && (await localStore.getAutoSyncEnabled(userId))) {
        scheduleLocalAutoSync(userId);
      }
      return result;
    },
    clearMyList: async () => {
      const userId = await requireActiveUserId();
      const result = await localStore.clearList(userId);
      if (result.ok && result.removedCount > 0 && (await localStore.getAutoSyncEnabled(userId))) {
        scheduleLocalAutoSync(userId);
      }
      return result;
    },
    exportLocalBackup: async () => {
      const userId = await requireActiveUserId();
      const session = await getSession();
      return await localStore.exportBackup(userId, session?.user?.username ?? "Seenary user");
    },
    importLocalBackup: async (backup) => {
      const userId = await requireActiveUserId();
      const result = await localStore.importBackup(userId, backup);
      if (
        result.ok &&
        (result.imported ?? 0) > 0 &&
        (await localStore.getAutoSyncEnabled(userId))
      ) {
        scheduleLocalAutoSync(userId);
      }
      return result;
    },
    onFocusSearch: () => undefined,
    onSyncProgress: () => () => undefined,
    onAutoSyncComplete: (callback) => {
      localAutoSyncListeners.add(callback);
      return () => localAutoSyncListeners.delete(callback);
    },
  };

  window.api = api as typeof window.api;
}
