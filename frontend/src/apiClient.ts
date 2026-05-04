type ApiClient = {
  [key: string]: (...args: any[]) => Promise<any> | void;
  onFocusSearch: (callback: () => void) => void;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://api.seenary.app");

let pendingAniListLoginFlowId: string | null = null;

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

function openPopup(url: string) {
  const popup = window.open(url, "seenary-anilist-oauth", "width=560,height=720,popup=yes");

  if (!popup) {
    throw new Error("Allow popups so Seenary can open AniList authorization.");
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

  return result;
}

async function completeAniListLogin(username: string) {
  const result = await rpc("completeAniListLogin", [username, pendingAniListLoginFlowId]);

  if (result.ok) {
    pendingAniListLoginFlowId = null;
  }

  return result;
}

async function linkAniListAccount() {
  const start = await rpc("linkAniListAccount");

  if (!start.pendingOAuth) {
    return start;
  }

  const popup = openPopup(start.authUrl);
  return await waitForAniListFlow("pollAniListLink", start.flowId, popup);
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
    startAniListLogin,
    completeAniListLogin,
    getAniListLinkStatus: () => rpc("getAniListLinkStatus"),
    linkAniListAccount,
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
