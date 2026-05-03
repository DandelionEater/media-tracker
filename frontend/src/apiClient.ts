type ApiClient = {
  [key: string]: (...args: any[]) => Promise<any> | void;
  onFocusSearch: (callback: () => void) => void;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://api.seenary.app");

async function rpc(method: string, args: unknown[] = []) {
  const response = await fetch(`${API_BASE_URL}/rpc`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method, args }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || `API request failed with status ${response.status}`);
  }

  return payload;
}

export function installApiClient() {
  if (window.api) {
    return;
  }

  const api: ApiClient = {
    searchAnime: (query, hideAdultContent = true) =>
      rpc("searchAnime", [query, hideAdultContent]),
    getTrendingAnime: (hideAdultContent = true) => rpc("getTrendingAnime", [hideAdultContent]),
    getDiscoverAnime: (hideAdultContent = true) => rpc("getDiscoverAnime", [hideAdultContent]),
    getDiscoverShelfAnime: (shelfId, page = 1, hideAdultContent = true) =>
      rpc("getDiscoverShelfAnime", [shelfId, page, hideAdultContent]),
    previewAniListImport: (username) => rpc("previewAniListImport", [username]),
    importAniList: (username, selectedStatuses, selectedAnimeIds) =>
      rpc("importAniList", [username, selectedStatuses, selectedAnimeIds]),
    getSettings: () => rpc("getSettings"),
    updateSettings: (settings) => rpc("updateSettings", [settings]),
    getSyncStatus: () => rpc("getSyncStatus"),
    setAutoSync: (enabled) => rpc("setAutoSync", [enabled]),
    runSyncNow: () => rpc("runSyncNow"),
    pullFromAniList: () => rpc("pullFromAniList"),
    getSyncActivity: () => rpc("getSyncActivity"),
    getAnimeDetails: (id) => rpc("getAnimeDetails", [id]),
    cacheMinimalAnime: (media) => rpc("cacheMinimalAnime", [media]),
    register: (username, password) => rpc("register", [username, password]),
    login: (username, password) => rpc("login", [username, password]),
    startAniListLogin: () => rpc("startAniListLogin"),
    completeAniListLogin: (username) => rpc("completeAniListLogin", [username]),
    getAniListLinkStatus: () => rpc("getAniListLinkStatus"),
    linkAniListAccount: () => rpc("linkAniListAccount"),
    resolveAniListLinkConflict: (action) => rpc("resolveAniListLinkConflict", [action]),
    logout: () => rpc("logout"),
    getSession: () => rpc("getSession"),
    setTutorialDismissed: (dismissed) => rpc("setTutorialDismissed", [dismissed]),
    getMyList: () => rpc("getMyList"),
    getMyListEntry: (animeId) => rpc("getMyListEntry", [animeId]),
    saveMyListEntry: (animeId, data) => rpc("saveMyListEntry", [animeId, data]),
    removeMyListEntry: (animeId) => rpc("removeMyListEntry", [animeId]),
    clearMyList: () => rpc("clearMyList"),
    onFocusSearch: () => undefined,
  };

  window.api = api;
}
