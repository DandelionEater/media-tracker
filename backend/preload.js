const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  searchAnime: (query, hideAdultContent = true) =>
    ipcRenderer.invoke('anilist:search', { query, hideAdultContent }),
  getTrendingAnime: (hideAdultContent = true) =>
    ipcRenderer.invoke('anilist:trending', { hideAdultContent }),
  getDiscoverAnime: (hideAdultContent = true) =>
    ipcRenderer.invoke('anilist:discover', { hideAdultContent }),
  getDiscoverShelfAnime: (shelfId, page = 1, hideAdultContent = true) =>
    ipcRenderer.invoke('anilist:discover-shelf', { shelfId, page, hideAdultContent }),
  previewAniListImport: (username) => ipcRenderer.invoke('anilist:preview-import', { username }),
  importAniList: (username, selectedStatuses, selectedAnimeIds) =>
    ipcRenderer.invoke('anilist:import-list', {
      username,
      selectedStatuses,
      selectedAnimeIds,
    }),
  previewMalImport: () => ipcRenderer.invoke('mal:preview-import'),
  importMal: (selectedStatuses, selectedAnimeIds) =>
    ipcRenderer.invoke('mal:import-list', {
      selectedStatuses,
      selectedAnimeIds,
    }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  getSyncStatus: () => ipcRenderer.invoke('sync:get-status'),
  setAutoSync: (enabled) => ipcRenderer.invoke('sync:set-auto', enabled),
  runSyncNow: () => ipcRenderer.invoke('sync:run-now'),
  pullFromAniList: () => ipcRenderer.invoke('sync:pull-from-anilist'),
  pullFromMal: () => ipcRenderer.invoke('sync:pull-from-mal'),
  getSyncActivity: () => ipcRenderer.invoke('sync:get-activity'),
  getAnimeDetails: (id) => ipcRenderer.invoke('anime:get-details', id),
  cacheMinimalAnime: (media) => ipcRenderer.invoke('anime:cache-minimal', media),

  register: (username, password) => ipcRenderer.invoke('auth:register', { username, password }),

  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),

  startAniListLogin: () => ipcRenderer.invoke('auth:anilist-start'),

  completeAniListLogin: (username) =>
    ipcRenderer.invoke('auth:anilist-complete', { username }),

  startMalLogin: () => ipcRenderer.invoke('auth:mal-start'),

  completeMalLogin: (username) => ipcRenderer.invoke('auth:mal-complete', { username }),

  getAniListLinkStatus: () => ipcRenderer.invoke('auth:anilist-link-status'),

  linkAniListAccount: () => ipcRenderer.invoke('auth:anilist-link'),

  resolveAniListLinkConflict: (action) =>
    ipcRenderer.invoke('auth:anilist-resolve-link-conflict', { action }),

  getMalLinkStatus: () => ipcRenderer.invoke('auth:mal-link-status'),

  linkMalAccount: () => ipcRenderer.invoke('auth:mal-link'),

  resolveMalLinkConflict: (action) =>
    ipcRenderer.invoke('auth:mal-resolve-link-conflict', { action }),

  logout: () => ipcRenderer.invoke('auth:logout'),

  getSession: () => ipcRenderer.invoke('auth:get-session'),

  setTutorialDismissed: (dismissed) => ipcRenderer.invoke('auth:set-tutorial-dismissed', dismissed),

  onFocusSearch: (callback) => {
    ipcRenderer.on('focus-search', callback);
  },

  getMyList: () => ipcRenderer.invoke('list:get'),

  getMyListEntry: (animeId) => ipcRenderer.invoke('list:get-entry', animeId),

  saveMyListEntry: (animeId, data) => ipcRenderer.invoke('list:save-entry', { animeId, data }),

  removeMyListEntry: (animeId) => ipcRenderer.invoke('list:remove-entry', animeId),

  clearMyList: () => ipcRenderer.invoke('list:clear'),
});
