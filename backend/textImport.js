const anilist = require('./anilist');
const { mapAnimeForDb } = require('./animeMapper');
const { saveAnimeSummary } = require('./db');
const { saveMyAnimeEntry } = require('./lists');

const MAX_TEXT_IMPORT_LINES = 100;
const TEXT_IMPORT_SEARCH_DELAY_MS = 850;
const TEXT_IMPORT_RATE_LIMIT_RETRY_MS = 3500;
const TEXT_IMPORT_RATE_LIMIT_RETRIES = 2;

function parseTextList(text) {
  const seen = new Set();
  const entries = [];

  String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parsed = parseTextLine(line);
      const key = parsed.title.toLowerCase();

      if (!parsed.title || seen.has(key)) {
        return;
      }

      seen.add(key);
      entries.push(parsed);
    });

  return entries.slice(0, MAX_TEXT_IMPORT_LINES);
}

function parseTextLine(line) {
  const progressMatch = line.match(/(?:^|[\s([{-])(\d{1,4})\s*\/\s*(\d{1,4}|\?)(?:[\s)\]}-]|$)/);
  const progress = progressMatch ? Number(progressMatch[1]) : null;
  const total =
    progressMatch && /^\d+$/.test(progressMatch[2])
      ? Number(progressMatch[2])
      : null;
  const title = line
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')
    .replace(progressMatch?.[0] || '', ' ')
    .replace(/\s+\[(?:completed|complete|watching|planned|paused|dropped)\]\s*$/i, '')
    .replace(/\s+-\s+(?:completed|complete|watching|planned|paused|dropped)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    rawLine: line,
    title,
    progress: Number.isFinite(progress) ? progress : null,
    total: Number.isFinite(total) ? total : null,
  };
}

async function previewTextImport(text, options = {}) {
  const parsedEntries = parseTextList(text);

  if (!parsedEntries.length) {
    return { ok: false, message: 'Add at least one anime title to the text file.' };
  }

  const groupsByStatus = {
    watching: [],
    completed: [],
  };
  const unmatched = [];
  let rateLimitedCount = 0;

  for (let index = 0; index < parsedEntries.length; index += 1) {
    const parsedEntry = parsedEntries[index];
    const searchResult = await searchAnimeForTextImport(parsedEntry.title, {
      hideAdultContent: options.hideAdultContent,
    });

    if (searchResult.rateLimited) {
      const remainingEntries = parsedEntries.slice(index);
      rateLimitedCount += remainingEntries.length;
      unmatched.push(...remainingEntries.map((entry) => entry.rawLine));
      break;
    }

    if (searchResult.error) {
      unmatched.push(parsedEntry.rawLine);
      await delayBetweenTextImportSearches(index, parsedEntries.length);
      continue;
    }

    const results = searchResult.results;
    const match = Array.isArray(results) ? results[0] : null;

    if (!match?.id) {
      unmatched.push(parsedEntry.rawLine);
      await delayBetweenTextImportSearches(index, parsedEntries.length);
      continue;
    }

    const episodes = Number.isInteger(match.episodes) && match.episodes > 0 ? match.episodes : null;
    const hasProgress = typeof parsedEntry.progress === 'number';
    const progress = hasProgress ? parsedEntry.progress : episodes ?? 0;
    const total = parsedEntry.total ?? episodes;
    const status =
      hasProgress && total && parsedEntry.progress < total ? 'watching' : 'completed';

    groupsByStatus[status].push({
      animeId: match.id,
      status,
      progress,
      score: null,
      notes: null,
      title: match.title || {},
      coverImage: match.coverImage || null,
      episodes,
      format: match.format ?? null,
      season: match.season ?? null,
      seasonYear: match.seasonYear ?? null,
      sourceTitle: parsedEntry.title,
      media: match,
    });

    await delayBetweenTextImportSearches(index, parsedEntries.length);
  }

  const groups = ['watching', 'completed']
    .map((status) => ({ status, items: groupsByStatus[status] }))
    .filter((group) => group.items.length > 0);
  const matchedCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  if (!matchedCount) {
    return {
      ok: false,
      message:
        rateLimitedCount > 0
          ? 'AniList is rate limiting title matching. Wait a minute, then try the text import again.'
          : 'No titles from the text file could be matched to AniList anime.',
      unmatched,
    };
  }

  return {
    ok: true,
    message:
      rateLimitedCount > 0
        ? `Matched ${matchedCount} title${matchedCount === 1 ? '' : 's'}. AniList rate limited ${rateLimitedCount}, so try again later for the skipped lines.`
        : unmatched.length > 0
        ? `Matched ${matchedCount} title${matchedCount === 1 ? '' : 's'} and skipped ${unmatched.length}.`
        : `Matched ${matchedCount} title${matchedCount === 1 ? '' : 's'}.`,
    preview: {
      totalFound: parsedEntries.length,
      groups,
      unmatched,
    },
  };
}

async function searchAnimeForTextImport(title, options) {
  for (let attempt = 0; attempt <= TEXT_IMPORT_RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      const results = await anilist.searchAnime(title, options);
      return { results };
    } catch (error) {
      if (!isRateLimitError(error)) {
        return { error };
      }

      if (attempt === TEXT_IMPORT_RATE_LIMIT_RETRIES) {
        return { rateLimited: true, error };
      }

      const retryAfterMs =
        typeof error.retryAfter === 'number' && error.retryAfter > 0
          ? error.retryAfter * 1000
          : TEXT_IMPORT_RATE_LIMIT_RETRY_MS * (attempt + 1);
      await delay(retryAfterMs);
    }
  }

  return { results: [] };
}

function isRateLimitError(error) {
  return error?.status === 429 || /too many requests/i.test(error?.message || '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function delayBetweenTextImportSearches(index, total) {
  if (index < total - 1) {
    await delay(TEXT_IMPORT_SEARCH_DELAY_MS);
  }
}

function importTextEntries(currentSession, entries = [], selectedAnimeIds = []) {
  const selectedIds = new Set(
    (Array.isArray(selectedAnimeIds) ? selectedAnimeIds : [])
      .map((animeId) => Number(animeId))
      .filter((animeId) => Number.isInteger(animeId) && animeId > 0)
  );
  const hasSelection = selectedIds.size > 0;
  const flatEntries = Array.isArray(entries) ? entries : [];

  let imported = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of flatEntries) {
    const animeId = Number(entry?.animeId);

    if (!Number.isInteger(animeId) || animeId <= 0 || (hasSelection && !selectedIds.has(animeId))) {
      skipped += 1;
      continue;
    }

    if (!entry.media) {
      skipped += 1;
      continue;
    }

    saveAnimeSummary(mapAnimeForDb(entry.media));
    const result = saveMyAnimeEntry(currentSession, animeId, {
      status: entry.status || 'completed',
      progress: entry.progress ?? 0,
      score: entry.score ?? null,
      notes: entry.notes ?? null,
    });

    if (!result.ok) {
      skipped += 1;
      continue;
    }

    imported += 1;
    if (result.message === 'Anime added to your list.') {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return {
    ok: true,
    message: `Imported ${imported} text entr${imported === 1 ? 'y' : 'ies'}.`,
    summary: {
      sourceUsername: 'Text file',
      totalFound: flatEntries.length,
      selectedStatuses: [],
      selectedAnimeIds: Array.from(selectedIds),
      imported,
      created,
      updated,
      skipped,
    },
  };
}

module.exports = {
  previewTextImport,
  importTextEntries,
};
