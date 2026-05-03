const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'media.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS anime (
    id INTEGER PRIMARY KEY,

    title_romaji TEXT,
    title_english TEXT,
    title_native TEXT,
    title_preferred TEXT,

    cover_image_large TEXT,
    banner_image TEXT,

    episodes INTEGER,
    format TEXT,
    status TEXT,

    season TEXT,
    season_year INTEGER,

    average_score INTEGER,
    mean_score INTEGER,
    popularity INTEGER,
    favourites INTEGER,
    duration INTEGER,
    source TEXT,
    country_of_origin TEXT,
    start_date TEXT,
    end_date TEXT,
    trailer_id TEXT,
    trailer_site TEXT,
    trailer_thumbnail TEXT,
    site_url TEXT,

    description TEXT,
    genres TEXT,
    synonyms TEXT,

    next_airing_episode INTEGER,
    next_airing_at INTEGER,

    studios TEXT,
    relations TEXT,
    recommendations TEXT,
    external_links TEXT,
    streaming_episodes TEXT,

    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    cached_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`
).run();

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

const animeColumnMigrations = [
  ['mean_score', 'INTEGER'],
  ['popularity', 'INTEGER'],
  ['favourites', 'INTEGER'],
  ['duration', 'INTEGER'],
  ['source', 'TEXT'],
  ['country_of_origin', 'TEXT'],
  ['start_date', 'TEXT'],
  ['end_date', 'TEXT'],
  ['trailer_id', 'TEXT'],
  ['trailer_site', 'TEXT'],
  ['trailer_thumbnail', 'TEXT'],
  ['site_url', 'TEXT'],
  ['relations', "TEXT NOT NULL DEFAULT '[]'"],
  ['recommendations', "TEXT NOT NULL DEFAULT '[]'"],
  ['external_links', "TEXT NOT NULL DEFAULT '[]'"],
  ['streaming_episodes', "TEXT NOT NULL DEFAULT '[]'"],
];

for (const [columnName, definition] of animeColumnMigrations) {
  addColumnIfMissing('anime', columnName, definition);
}

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    tutorial_dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
  )
`
).run();

const userColumns = db.prepare(`PRAGMA table_info(users)`).all();

const hasTutorialDismissedColumn = userColumns.some(
  (column) => column.name === 'tutorial_dismissed'
);

if (!hasTutorialDismissedColumn) {
  db.prepare(
    `
    ALTER TABLE users
    ADD COLUMN tutorial_dismissed INTEGER NOT NULL DEFAULT 0
  `
  ).run();
}

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS user_anime_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    anime_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    score REAL,
    notes TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
    UNIQUE(user_id, anime_id)
  )
`
).run();

addColumnIfMissing('user_anime_lists', 'is_favorite', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('user_anime_lists', 'repeat_count', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('user_anime_lists', 'is_rewatching', 'INTEGER NOT NULL DEFAULT 0');

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS anilist_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    anilist_user_id INTEGER NOT NULL UNIQUE,
    anilist_username TEXT NOT NULL,
    original_anilist_username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_import_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    anime_id INTEGER NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    changed_fields_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
    UNIQUE(user_id, anime_id, operation)
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    anime_id INTEGER,
    anime_title TEXT,
    operation TEXT NOT NULL,
    changed_fields_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE SET NULL
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS anime_tags (
    anime_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    name TEXT,
    description TEXT,
    rank INTEGER,
    is_media_spoiler INTEGER NOT NULL DEFAULT 0,
    is_general_spoiler INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (anime_id, tag_id),
    FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS anime_staff (
    anime_id INTEGER NOT NULL,
    staff_id INTEGER NOT NULL,
    name_full TEXT,
    name_native TEXT,
    image_large TEXT,
    role TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (anime_id, staff_id, role),
    FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS anime_characters (
    anime_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    name_full TEXT,
    name_native TEXT,
    image_large TEXT,
    role TEXT,
    voice_actors TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (anime_id, character_id, role),
    FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
  )
`
).run();

const upsertAnimeStmt = db.prepare(`
  INSERT INTO anime (
    id,
    title_romaji,
    title_english,
    title_native,
    title_preferred,
    cover_image_large,
    banner_image,
    episodes,
    format,
    status,
    season,
    season_year,
    average_score,
    mean_score,
    popularity,
    favourites,
    duration,
    source,
    country_of_origin,
    start_date,
    end_date,
    trailer_id,
    trailer_site,
    trailer_thumbnail,
    site_url,
    description,
    genres,
    synonyms,
    next_airing_episode,
    next_airing_at,
    studios,
    relations,
    recommendations,
    external_links,
    streaming_episodes,
    updated_at,
    cached_at
  ) VALUES (
    @id,
    @title_romaji,
    @title_english,
    @title_native,
    @title_preferred,
    @cover_image_large,
    @banner_image,
    @episodes,
    @format,
    @status,
    @season,
    @season_year,
    @average_score,
    @mean_score,
    @popularity,
    @favourites,
    @duration,
    @source,
    @country_of_origin,
    @start_date,
    @end_date,
    @trailer_id,
    @trailer_site,
    @trailer_thumbnail,
    @site_url,
    @description,
    @genres,
    @synonyms,
    @next_airing_episode,
    @next_airing_at,
    @studios,
    @relations,
    @recommendations,
    @external_links,
    @streaming_episodes,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    title_romaji = excluded.title_romaji,
    title_english = excluded.title_english,
    title_native = excluded.title_native,
    title_preferred = excluded.title_preferred,
    cover_image_large = excluded.cover_image_large,
    banner_image = excluded.banner_image,
    episodes = excluded.episodes,
    format = excluded.format,
    status = excluded.status,
    season = excluded.season,
    season_year = excluded.season_year,
    average_score = excluded.average_score,
    mean_score = excluded.mean_score,
    popularity = excluded.popularity,
    favourites = excluded.favourites,
    duration = excluded.duration,
    source = excluded.source,
    country_of_origin = excluded.country_of_origin,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    trailer_id = excluded.trailer_id,
    trailer_site = excluded.trailer_site,
    trailer_thumbnail = excluded.trailer_thumbnail,
    site_url = excluded.site_url,
    description = excluded.description,
    genres = excluded.genres,
    synonyms = excluded.synonyms,
    next_airing_episode = excluded.next_airing_episode,
    next_airing_at = excluded.next_airing_at,
    studios = excluded.studios,
    relations = excluded.relations,
    recommendations = excluded.recommendations,
    external_links = excluded.external_links,
    streaming_episodes = excluded.streaming_episodes,
    updated_at = CURRENT_TIMESTAMP,
    cached_at = CURRENT_TIMESTAMP
`);

const upsertAnimeSummaryStmt = db.prepare(`
  INSERT INTO anime (
    id,
    title_romaji,
    title_english,
    title_native,
    title_preferred,
    cover_image_large,
    banner_image,
    episodes,
    format,
    status,
    season,
    season_year,
    average_score,
    mean_score,
    popularity,
    favourites,
    duration,
    source,
    country_of_origin,
    start_date,
    end_date,
    trailer_id,
    trailer_site,
    trailer_thumbnail,
    site_url,
    description,
    genres,
    synonyms,
    next_airing_episode,
    next_airing_at,
    studios,
    relations,
    recommendations,
    external_links,
    streaming_episodes,
    updated_at,
    cached_at
  ) VALUES (
    @id,
    @title_romaji,
    @title_english,
    @title_native,
    @title_preferred,
    @cover_image_large,
    @banner_image,
    @episodes,
    @format,
    @status,
    @season,
    @season_year,
    @average_score,
    @mean_score,
    @popularity,
    @favourites,
    @duration,
    @source,
    @country_of_origin,
    @start_date,
    @end_date,
    @trailer_id,
    @trailer_site,
    @trailer_thumbnail,
    @site_url,
    @description,
    @genres,
    @synonyms,
    @next_airing_episode,
    @next_airing_at,
    @studios,
    @relations,
    @recommendations,
    @external_links,
    @streaming_episodes,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    title_romaji = COALESCE(excluded.title_romaji, anime.title_romaji),
    title_english = COALESCE(excluded.title_english, anime.title_english),
    title_native = COALESCE(excluded.title_native, anime.title_native),
    title_preferred = COALESCE(excluded.title_preferred, anime.title_preferred),
    cover_image_large = COALESCE(excluded.cover_image_large, anime.cover_image_large),
    banner_image = COALESCE(excluded.banner_image, anime.banner_image),
    episodes = COALESCE(excluded.episodes, anime.episodes),
    format = COALESCE(excluded.format, anime.format),
    status = COALESCE(excluded.status, anime.status),
    season = COALESCE(excluded.season, anime.season),
    season_year = COALESCE(excluded.season_year, anime.season_year),
    average_score = COALESCE(excluded.average_score, anime.average_score),
    mean_score = COALESCE(excluded.mean_score, anime.mean_score),
    popularity = COALESCE(excluded.popularity, anime.popularity),
    favourites = COALESCE(excluded.favourites, anime.favourites),
    duration = COALESCE(excluded.duration, anime.duration),
    source = COALESCE(excluded.source, anime.source),
    country_of_origin = COALESCE(excluded.country_of_origin, anime.country_of_origin),
    start_date = COALESCE(excluded.start_date, anime.start_date),
    end_date = COALESCE(excluded.end_date, anime.end_date),
    trailer_id = COALESCE(excluded.trailer_id, anime.trailer_id),
    trailer_site = COALESCE(excluded.trailer_site, anime.trailer_site),
    trailer_thumbnail = COALESCE(excluded.trailer_thumbnail, anime.trailer_thumbnail),
    site_url = COALESCE(excluded.site_url, anime.site_url),
    description = COALESCE(excluded.description, anime.description),
    genres = COALESCE(excluded.genres, anime.genres),
    synonyms = COALESCE(excluded.synonyms, anime.synonyms),
    next_airing_episode = COALESCE(excluded.next_airing_episode, anime.next_airing_episode),
    next_airing_at = COALESCE(excluded.next_airing_at, anime.next_airing_at),
    studios = COALESCE(excluded.studios, anime.studios),
    relations = COALESCE(excluded.relations, anime.relations),
    recommendations = COALESCE(excluded.recommendations, anime.recommendations),
    external_links = COALESCE(excluded.external_links, anime.external_links),
    streaming_episodes = COALESCE(excluded.streaming_episodes, anime.streaming_episodes),
    updated_at = CURRENT_TIMESTAMP,
    cached_at = CURRENT_TIMESTAMP
`);

const getAnimeByIdStmt = db.prepare(`
  SELECT * FROM anime
  WHERE id = ?
`);

const createUserStmt = db.prepare(`
  INSERT INTO users (
    username,
    username_normalized,
    password_hash
  ) VALUES (?, ?, ?)
`);

const updateUsernameStmt = db.prepare(`
  UPDATE users
  SET
    username = ?,
    username_normalized = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const getUserByNormalizedUsernameStmt = db.prepare(`
  SELECT * FROM users
  WHERE username_normalized = ?
`);

const getUserByIdStmt = db.prepare(`
  SELECT
    id,
    username,
    username_normalized,
    tutorial_dismissed,
    created_at,
    updated_at,
    last_login_at
  FROM users
  WHERE id = ?
`);

const updateLastLoginStmt = db.prepare(`
  UPDATE users
  SET
    last_login_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const updateTutorialDismissedStmt = db.prepare(`
  UPDATE users
  SET
    tutorial_dismissed = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const getAppSettingStmt = db.prepare(`
  SELECT value
  FROM app_settings
  WHERE key = ?
`);

const setAppSettingStmt = db.prepare(`
  INSERT INTO app_settings (
    key,
    value,
    updated_at
  ) VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = CURRENT_TIMESTAMP
`);

const deleteAppSettingStmt = db.prepare(`
  DELETE FROM app_settings
  WHERE key = ?
`);

const getAniListAccountByAniListUserIdStmt = db.prepare(`
  SELECT *
  FROM anilist_accounts
  WHERE anilist_user_id = ?
`);

const getAniListAccountByUserIdStmt = db.prepare(`
  SELECT *
  FROM anilist_accounts
  WHERE user_id = ?
`);

const deleteAniListAccountByUserIdStmt = db.prepare(`
  DELETE FROM anilist_accounts
  WHERE user_id = ?
`);

const deleteUserAnimeListByUserIdStmt = db.prepare(`
  DELETE FROM user_anime_lists
  WHERE user_id = ?
`);

const deleteUserStmt = db.prepare(`
  DELETE FROM users
  WHERE id = ?
`);

const mergeMissingUserAnimeEntriesStmt = db.prepare(`
  INSERT INTO user_anime_lists (
    user_id,
    anime_id,
    status,
    is_favorite,
    repeat_count,
    is_rewatching,
    progress,
    score,
    notes,
    started_at,
    completed_at,
    created_at,
    updated_at
  )
  SELECT
    ?,
    source.anime_id,
    source.status,
    source.is_favorite,
    source.repeat_count,
    source.is_rewatching,
    source.progress,
    source.score,
    source.notes,
    source.started_at,
    source.completed_at,
    source.created_at,
    CURRENT_TIMESTAMP
  FROM user_anime_lists source
  WHERE source.user_id = ?
    AND NOT EXISTS (
      SELECT 1
      FROM user_anime_lists target
      WHERE target.user_id = ?
        AND target.anime_id = source.anime_id
    )
`);

const upsertAniListAccountStmt = db.prepare(`
  INSERT INTO anilist_accounts (
    user_id,
    anilist_user_id,
    anilist_username,
    original_anilist_username,
    access_token,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(anilist_user_id) DO UPDATE SET
    user_id = excluded.user_id,
    anilist_username = excluded.anilist_username,
    access_token = excluded.access_token,
    updated_at = CURRENT_TIMESTAMP
`);

const updateAniListAccountImportTimeStmt = db.prepare(`
  UPDATE anilist_accounts
  SET
    last_import_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE anilist_user_id = ?
`);

const getSyncQueueJobStmt = db.prepare(`
  SELECT *
  FROM sync_queue
  WHERE user_id = ? AND anime_id = ? AND operation = ?
`);

const upsertSyncQueueJobStmt = db.prepare(`
  INSERT INTO sync_queue (
    user_id,
    anime_id,
    operation,
    payload_json,
    changed_fields_json,
    status,
    attempts,
    last_error,
    next_attempt_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id, anime_id, operation) DO UPDATE SET
    payload_json = excluded.payload_json,
    changed_fields_json = excluded.changed_fields_json,
    status = 'pending',
    last_error = NULL,
    next_attempt_at = NULL,
    updated_at = CURRENT_TIMESTAMP
`);

const getDueSyncQueueJobsStmt = db.prepare(`
  SELECT
    q.*,
    a.title_preferred,
    a.title_english,
    a.title_romaji
  FROM sync_queue q
  LEFT JOIN anime a ON a.id = q.anime_id
  WHERE q.user_id = ?
    AND (q.status = 'pending' OR q.status = 'failed')
    AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= CURRENT_TIMESTAMP)
  ORDER BY q.updated_at ASC
  LIMIT ?
`);

const getSyncQueueItemsStmt = db.prepare(`
  SELECT
    q.*,
    a.title_preferred,
    a.title_english,
    a.title_romaji
  FROM sync_queue q
  LEFT JOIN anime a ON a.id = q.anime_id
  WHERE q.user_id = ?
  ORDER BY q.updated_at DESC
  LIMIT ?
`);

const countSyncQueueItemsStmt = db.prepare(`
  SELECT COUNT(*) AS count
  FROM sync_queue
  WHERE user_id = ?
`);

const markSyncQueueJobFailedStmt = db.prepare(`
  UPDATE sync_queue
  SET
    status = 'failed',
    attempts = attempts + 1,
    last_error = ?,
    next_attempt_at = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteSyncQueueJobStmt = db.prepare(`
  DELETE FROM sync_queue
  WHERE id = ?
`);

const insertSyncHistoryStmt = db.prepare(`
  INSERT INTO sync_history (
    user_id,
    anime_id,
    anime_title,
    operation,
    changed_fields_json,
    status,
    message
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getSyncHistoryItemsStmt = db.prepare(`
  SELECT *
  FROM sync_history
  WHERE user_id = ? AND status = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const getUserAnimeEntryStmt = db.prepare(`
  SELECT *
  FROM user_anime_lists
  WHERE user_id = ? AND anime_id = ?
`);

const getUserAnimeListStmt = db.prepare(`
  SELECT
    l.*,
    a.title_romaji,
    a.title_english,
    a.title_native,
    a.title_preferred,
    a.cover_image_large,
    a.banner_image,
    a.episodes,
    a.format,
    a.status AS anime_status,
    a.season,
    a.season_year,
    a.average_score,
    a.mean_score,
    a.popularity,
    a.favourites,
    a.duration,
    a.source,
    a.country_of_origin,
    a.start_date,
    a.end_date,
    a.genres,
    a.recommendations
  FROM user_anime_lists l
  JOIN anime a ON a.id = l.anime_id
  WHERE l.user_id = ?
  ORDER BY l.updated_at DESC
`);

const addUserAnimeEntryStmt = db.prepare(`
  INSERT INTO user_anime_lists (
    user_id,
    anime_id,
    status,
    is_favorite,
    repeat_count,
    is_rewatching,
    progress,
    score,
    notes,
    started_at,
    completed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateUserAnimeEntryStmt = db.prepare(`
  UPDATE user_anime_lists
  SET
    status = ?,
    is_favorite = ?,
    repeat_count = ?,
    is_rewatching = ?,
    progress = ?,
    score = ?,
    notes = ?,
    started_at = ?,
    completed_at = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ? AND anime_id = ?
`);

const removeUserAnimeEntryStmt = db.prepare(`
  DELETE FROM user_anime_lists
  WHERE user_id = ? AND anime_id = ?
`);

const clearUserAnimeListStmt = db.prepare(`
  DELETE FROM user_anime_lists
  WHERE user_id = ?
`);

const deleteAnimeTagsStmt = db.prepare(`
  DELETE FROM anime_tags
  WHERE anime_id = ?
`);

const insertAnimeTagStmt = db.prepare(`
  INSERT INTO anime_tags (
    anime_id,
    tag_id,
    name,
    description,
    rank,
    is_media_spoiler,
    is_general_spoiler
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getAnimeTagsStmt = db.prepare(`
  SELECT
    tag_id AS id,
    name,
    description,
    rank,
    is_media_spoiler AS isMediaSpoiler,
    is_general_spoiler AS isGeneralSpoiler
  FROM anime_tags
  WHERE anime_id = ?
  ORDER BY rank DESC, name ASC
`);

const deleteAnimeStaffStmt = db.prepare(`
  DELETE FROM anime_staff
  WHERE anime_id = ?
`);

const insertAnimeStaffStmt = db.prepare(`
  INSERT INTO anime_staff (
    anime_id,
    staff_id,
    name_full,
    name_native,
    image_large,
    role,
    sort_order
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getAnimeStaffStmt = db.prepare(`
  SELECT
    staff_id,
    name_full,
    name_native,
    image_large,
    role,
    sort_order
  FROM anime_staff
  WHERE anime_id = ?
  ORDER BY sort_order ASC
`);

const deleteAnimeCharactersStmt = db.prepare(`
  DELETE FROM anime_characters
  WHERE anime_id = ?
`);

const insertAnimeCharacterStmt = db.prepare(`
  INSERT INTO anime_characters (
    anime_id,
    character_id,
    name_full,
    name_native,
    image_large,
    role,
    voice_actors,
    sort_order
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getAnimeCharactersStmt = db.prepare(`
  SELECT
    character_id,
    name_full,
    name_native,
    image_large,
    role,
    voice_actors,
    sort_order
  FROM anime_characters
  WHERE anime_id = ?
  ORDER BY sort_order ASC
`);

const saveAnimeTransaction = db.transaction((anime) => {
  upsertAnimeStmt.run(anime);

  deleteAnimeTagsStmt.run(anime.id);
  for (const tag of anime.tags ?? []) {
    if (!tag.tag_id) continue;

    insertAnimeTagStmt.run(
      anime.id,
      tag.tag_id,
      tag.name,
      tag.description,
      tag.rank,
      tag.is_media_spoiler,
      tag.is_general_spoiler
    );
  }

  deleteAnimeStaffStmt.run(anime.id);
  for (const staff of anime.staff ?? []) {
    if (!staff.staff_id || !staff.role) continue;

    insertAnimeStaffStmt.run(
      anime.id,
      staff.staff_id,
      staff.name_full,
      staff.name_native,
      staff.image_large,
      staff.role,
      staff.sort_order
    );
  }

  deleteAnimeCharactersStmt.run(anime.id);
  for (const character of anime.characters ?? []) {
    if (!character.character_id || !character.role) continue;

    insertAnimeCharacterStmt.run(
      anime.id,
      character.character_id,
      character.name_full,
      character.name_native,
      character.image_large,
      character.role,
      character.voice_actors,
      character.sort_order
    );
  }
});

function saveAnime(anime) {
  saveAnimeTransaction(anime);
}

function saveAnimeSummary(anime) {
  upsertAnimeSummaryStmt.run(anime);
}

function getAnimeById(id) {
  const anime = getAnimeByIdStmt.get(id);

  if (!anime) return null;

  anime.tags = getAnimeTagsStmt.all(id).map((tag) => ({
    ...tag,
    isMediaSpoiler: Boolean(tag.isMediaSpoiler),
    isGeneralSpoiler: Boolean(tag.isGeneralSpoiler),
  }));

  anime.staff = getAnimeStaffStmt.all(id).map((edge) => ({
    role: edge.role,
    node: {
      id: edge.staff_id,
      name: {
        full: edge.name_full,
        native: edge.name_native,
        userPreferred: edge.name_full,
      },
      image: {
        large: edge.image_large,
      },
    },
  }));

  anime.characters = getAnimeCharactersStmt.all(id).map((edge) => ({
    role: edge.role,
    voiceActors: JSON.parse(edge.voice_actors || '[]'),
    node: {
      id: edge.character_id,
      name: {
        full: edge.name_full,
        native: edge.name_native,
        userPreferred: edge.name_full,
      },
      image: {
        large: edge.image_large,
      },
    },
  }));

  return anime;
}

function createUser({ username, usernameNormalized, passwordHash }) {
  const result = createUserStmt.run(username, usernameNormalized, passwordHash);
  return result.lastInsertRowid;
}

function updateUsername(id, username, usernameNormalized) {
  updateUsernameStmt.run(username, usernameNormalized, id);
}

function getUserByNormalizedUsername(usernameNormalized) {
  return getUserByNormalizedUsernameStmt.get(usernameNormalized);
}

function getSafeUserById(id) {
  return getUserByIdStmt.get(id);
}

function updateLastLogin(id) {
  updateLastLoginStmt.run(id);
}

function getUserAnimeEntry(userId, animeId) {
  return getUserAnimeEntryStmt.get(userId, animeId);
}

function getUserAnimeList(userId) {
  return getUserAnimeListStmt.all(userId);
}

function addUserAnimeEntry({
  userId,
  animeId,
  status,
  isFavorite,
  repeatCount,
  isRewatching,
  progress,
  score,
  notes,
  startedAt,
  completedAt,
}) {
  const result = addUserAnimeEntryStmt.run(
    userId,
    animeId,
    status,
    isFavorite ? 1 : 0,
    repeatCount,
    isRewatching ? 1 : 0,
    progress,
    score,
    notes,
    startedAt,
    completedAt
  );

  return result.lastInsertRowid;
}

function updateUserAnimeEntry({
  userId,
  animeId,
  status,
  isFavorite,
  repeatCount,
  isRewatching,
  progress,
  score,
  notes,
  startedAt,
  completedAt,
}) {
  updateUserAnimeEntryStmt.run(
    status,
    isFavorite ? 1 : 0,
    repeatCount,
    isRewatching ? 1 : 0,
    progress,
    score,
    notes,
    startedAt,
    completedAt,
    userId,
    animeId
  );
}

function removeUserAnimeEntry(userId, animeId) {
  removeUserAnimeEntryStmt.run(userId, animeId);
}

function clearUserAnimeList(userId) {
  const result = clearUserAnimeListStmt.run(userId);
  return result.changes;
}

function updateTutorialDismissed(id, dismissed) {
  updateTutorialDismissedStmt.run(dismissed ? 1 : 0, id);
}

function getAppSetting(key) {
  return getAppSettingStmt.get(key)?.value ?? null;
}

function setAppSetting(key, value) {
  setAppSettingStmt.run(key, value == null ? null : String(value));
}

function deleteAppSetting(key) {
  deleteAppSettingStmt.run(key);
}

function getAniListAccountByAniListUserId(anilistUserId) {
  return getAniListAccountByAniListUserIdStmt.get(anilistUserId);
}

function getAniListAccountByUserId(userId) {
  return getAniListAccountByUserIdStmt.get(userId);
}

function deleteAniListAccountByUserId(userId) {
  deleteAniListAccountByUserIdStmt.run(userId);
}

function deleteUser(userId) {
  deleteAniListAccountByUserIdStmt.run(userId);
  deleteUserAnimeListByUserIdStmt.run(userId);
  deleteUserStmt.run(userId);
}

function mergeUserIntoUser(sourceUserId, targetUserId) {
  const merge = db.transaction(() => {
    const result = mergeMissingUserAnimeEntriesStmt.run(targetUserId, sourceUserId, targetUserId);
    deleteUser(sourceUserId);

    return {
      movedEntries: result.changes,
    };
  });

  return merge();
}

function upsertAniListAccount({
  userId,
  anilistUserId,
  anilistUsername,
  originalAniListUsername,
  accessToken,
}) {
  upsertAniListAccountStmt.run(
    userId,
    anilistUserId,
    anilistUsername,
    originalAniListUsername,
    accessToken
  );
}

function updateAniListAccountImportTime(anilistUserId) {
  updateAniListAccountImportTimeStmt.run(anilistUserId);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function mergeChangedFields(existingFields, nextFields) {
  const byField = new Map();

  for (const change of Array.isArray(existingFields) ? existingFields : []) {
    if (change?.field) {
      byField.set(change.field, change);
    }
  }

  for (const change of Array.isArray(nextFields) ? nextFields : []) {
    if (!change?.field) continue;

    const existing = byField.get(change.field);
    byField.set(change.field, {
      field: change.field,
      from: existing ? existing.from : change.from,
      to: change.to,
    });
  }

  return Array.from(byField.values()).filter((change) => change.from !== change.to);
}

function enqueueSyncJob({ userId, animeId, operation, payload, changedFields }) {
  const existing = getSyncQueueJobStmt.get(userId, animeId, operation);
  const existingFields = existing
    ? safeJsonParse(existing.changed_fields_json, [])
    : [];
  const mergedFields = mergeChangedFields(existingFields, changedFields);

  if (!mergedFields.length) {
    return null;
  }

  upsertSyncQueueJobStmt.run(
    userId,
    animeId,
    operation,
    JSON.stringify(payload),
    JSON.stringify(mergedFields)
  );

  return getSyncQueueJobStmt.get(userId, animeId, operation);
}

function getDueSyncQueueJobs(userId, limit = 10) {
  return getDueSyncQueueJobsStmt.all(userId, limit).map(mapSyncQueueRow);
}

function getSyncQueueItems(userId, limit = 50) {
  return getSyncQueueItemsStmt.all(userId, limit).map(mapSyncQueueRow);
}

function getSyncQueueCount(userId) {
  return Number(countSyncQueueItemsStmt.get(userId)?.count ?? 0);
}

function markSyncQueueJobFailed(id, error, nextAttemptAt) {
  markSyncQueueJobFailedStmt.run(error, nextAttemptAt, id);
}

function deleteSyncQueueJob(id) {
  deleteSyncQueueJobStmt.run(id);
}

function insertSyncHistory({ userId, animeId, animeTitle, operation, changedFields, status, message }) {
  insertSyncHistoryStmt.run(
    userId,
    animeId,
    animeTitle,
    operation,
    JSON.stringify(changedFields || []),
    status,
    message
  );
}

function getSyncHistoryItems(userId, status, limit = 50) {
  return getSyncHistoryItemsStmt.all(userId, status, limit).map((row) => ({
    ...row,
    changedFields: safeJsonParse(row.changed_fields_json, []),
  }));
}

function mapSyncQueueRow(row) {
  return {
    ...row,
    payload: safeJsonParse(row.payload_json, {}),
    changedFields: safeJsonParse(row.changed_fields_json, []),
    animeTitle: row.title_preferred || row.title_english || row.title_romaji || `Anime #${row.anime_id}`,
  };
}

module.exports = {
  db,
  saveAnime,
  saveAnimeSummary,
  getAnimeById,
  createUser,
  updateUsername,
  getUserByNormalizedUsername,
  getSafeUserById,
  updateLastLogin,
  getUserAnimeEntry,
  getUserAnimeList,
  addUserAnimeEntry,
  updateUserAnimeEntry,
  removeUserAnimeEntry,
  clearUserAnimeList,
  updateTutorialDismissed,
  getAppSetting,
  setAppSetting,
  deleteAppSetting,
  getAniListAccountByAniListUserId,
  getAniListAccountByUserId,
  deleteAniListAccountByUserId,
  deleteUser,
  mergeUserIntoUser,
  upsertAniListAccount,
  updateAniListAccountImportTime,
  enqueueSyncJob,
  getDueSyncQueueJobs,
  getSyncQueueItems,
  getSyncQueueCount,
  markSyncQueueJobFailed,
  deleteSyncQueueJob,
  insertSyncHistory,
  getSyncHistoryItems,
};
