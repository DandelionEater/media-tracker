const anilist = require('./anilist');
const { mapAnimeForDb } = require('./animeMapper');
const { saveAnimeSummary } = require('./db');
const { saveMyAnimeEntry } = require('./lists');
const zlib = require('zlib');

const MAX_TEXT_IMPORT_LINES = 100;
const MAX_PDF_IMPORT_BYTES = 25 * 1024 * 1024;
const TEXT_IMPORT_SEARCH_CONCURRENCY = 4;
const TEXT_IMPORT_SEARCH_BATCH_DELAY_MS = 250;
const TEXT_IMPORT_RATE_LIMIT_RETRY_MS = 3500;
const TEXT_IMPORT_RATE_LIMIT_RETRIES = 2;
const PDF_IMPORT_BLOCKED_LINE_PATTERNS = [
  /\bsearch anime\b/i,
  /\bbookmark\b/i,
  /\bwatch now\b/i,
  /\bdetails\b/i,
  /\byour watchlist\b/i,
  /\bwatch history\b/i,
  /\bnever lose\b/i,
  /\bepisode\b/i,
  /\btrailer\b/i,
  /\blog in\b/i,
  /\bsign up\b/i,
  /\bprivacy\b/i,
  /\bterms\b/i,
];
const PDF_IMPORT_GENRE_WORDS = new Set([
  'action',
  'adventure',
  'comedy',
  'drama',
  'ecchi',
  'fantasy',
  'horror',
  'mahou',
  'mecha',
  'music',
  'mystery',
  'psychological',
  'romance',
  'sci-fi',
  'slice',
  'sports',
  'supernatural',
  'thriller',
]);
let pdfJsPromise = null;

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
  const searchCache = new Map();

  for (let index = 0; index < parsedEntries.length; index += TEXT_IMPORT_SEARCH_CONCURRENCY) {
    const batch = parsedEntries.slice(index, index + TEXT_IMPORT_SEARCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (parsedEntry) => {
        const cacheKey = normalizeSearchCacheKey(parsedEntry.title, options.hideAdultContent);

        if (!searchCache.has(cacheKey)) {
          searchCache.set(
            cacheKey,
            await searchAnimeForTextImport(parsedEntry.title, {
              hideAdultContent: options.hideAdultContent,
            })
          );
        }

        return {
          parsedEntry,
          searchResult: searchCache.get(cacheKey),
        };
      })
    );

    const rateLimitedResultIndex = batchResults.findIndex(({ searchResult }) => searchResult.rateLimited);

    if (rateLimitedResultIndex !== -1) {
      const remainingEntries = parsedEntries.slice(index + rateLimitedResultIndex);
      rateLimitedCount += remainingEntries.length;
      unmatched.push(...remainingEntries.map((entry) => entry.rawLine));
      break;
    }

    for (const { parsedEntry, searchResult } of batchResults) {
      if (searchResult.error) {
        unmatched.push(parsedEntry.rawLine);
        continue;
      }

      const results = searchResult.results;
      const match = Array.isArray(results) ? results[0] : null;

      if (!match?.id) {
        unmatched.push(parsedEntry.rawLine);
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
    }

    await delayBetweenTextImportSearchBatches(index, parsedEntries.length);
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

async function previewPdfImport(pdfBase64, options = {}) {
  const text = filterPdfImportText(await extractTextFromPdfBase64(pdfBase64));

  if (!text.trim()) {
    return {
      ok: false,
      message:
        'No readable text was found in this PDF. Try exporting a text-based page, not a scanned image.',
    };
  }

  return await previewTextImport(text, options);
}

function filterPdfImportText(text) {
  const seen = new Set();
  const lines = [];

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = cleanPdfCandidateLine(rawLine);
    const key = line.toLowerCase();

    if (!line || seen.has(key) || !isLikelyPdfAnimeTitleLine(line)) {
      continue;
    }

    seen.add(key);
    lines.push(line);
  }

  return lines.join('\n');
}

function cleanPdfCandidateLine(line) {
  return String(line || '')
    .replace(/\s*\+\d+\s+more\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isLikelyPdfAnimeTitleLine(line) {
  if (line.length < 2 || line.length > 90) {
    return false;
  }

  if (PDF_IMPORT_BLOCKED_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
    return false;
  }

  const lowerLine = line.toLowerCase();
  const words = lowerLine.match(/[\p{L}\p{N}-]+/gu) || [];

  if (!words.length || words.length > 12) {
    return false;
  }

  const genreWordCount = words.filter((word) => PDF_IMPORT_GENRE_WORDS.has(word)).length;

  if (genreWordCount >= 3) {
    return false;
  }

  if (/[.!?]$/.test(line) && words.length > 4) {
    return false;
  }

  if (line.split(/[·•|]/).length > 3) {
    return false;
  }

  if (/\b(?:TV|OVA|ONA|MOVIE)\b/i.test(line) && /\b\d{1,3}\b/.test(line)) {
    return false;
  }

  if (/\b(?:is|are|was|were|with|from|into|that|this|who|when|where)\b/i.test(line) && words.length > 7) {
    return false;
  }

  return true;
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

function normalizeSearchCacheKey(title, hideAdultContent) {
  return `${hideAdultContent ? 'safe' : 'all'}:${String(title || '')
    .trim()
    .toLowerCase()}`;
}

async function delayBetweenTextImportSearchBatches(index, total) {
  if (index + TEXT_IMPORT_SEARCH_CONCURRENCY < total) {
    await delay(TEXT_IMPORT_SEARCH_BATCH_DELAY_MS);
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

async function extractTextFromPdfBase64(pdfBase64) {
  const buffer = Buffer.from(String(pdfBase64 || ''), 'base64');

  if (!buffer.length) {
    return '';
  }

  if (buffer.length > MAX_PDF_IMPORT_BYTES) {
    throw new Error(`PDF import supports files up to ${MAX_PDF_IMPORT_BYTES / 1024 / 1024} MB for now.`);
  }

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdfDocument = await loadingTask.promise;
  const lines = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent({
        disableNormalization: false,
        includeMarkedContent: false,
      });

      lines.push(...pdfTextItemsToLines(textContent.items || []));
      page.cleanup?.();
    }
  } finally {
    await pdfDocument.destroy?.();
  }

  const pdfJsText = normalizeExtractedPdfText(lines.join('\n'));

  if (pdfJsText.trim()) {
    return pdfJsText;
  }

  const source = buffer.toString('latin1');
  const objects = parsePdfObjects(source);
  const unicodeMaps = buildPdfUnicodeMaps(objects);
  const fontMaps = buildPdfFontMaps(objects, unicodeMaps);
  const streams = objects
    .filter((object) => object.stream)
    .map((object) => decodePdfStream(object.dictionary, object.stream))
    .filter(Boolean);

  const streamText = streams
    .map((stream) => extractTextFromPdfContentStream(stream.toString('latin1'), fontMaps))
    .filter(Boolean)
    .join('\n');
  const normalizedStreamText = normalizeExtractedPdfText(streamText);

  if (normalizedStreamText.trim()) {
    return normalizedStreamText;
  }

  const looseText = streams
    .map((stream) => extractLooseTextFromPdfStream(stream.toString('latin1')))
    .filter(Boolean)
    .join('\n');

  return normalizeExtractedPdfText(looseText);
}

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }

  return pdfJsPromise;
}

function pdfTextItemsToLines(items) {
  const positionedItems = items
    .map((item) => ({
      text: String(item.str || '').trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }))
    .filter((item) => item.text);
  const rows = [];

  for (const item of positionedItems) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 3);

    if (row) {
      row.items.push(item);
      row.y = (row.y + item.y) / 2;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

function parsePdfObjects(source) {
  const objects = [];
  const objectRegex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let match;

  while ((match = objectRegex.exec(source))) {
    const body = match[3];
    const streamMatch = body.match(/<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/);

    objects.push({
      id: Number(match[1]),
      body,
      dictionary: streamMatch?.[1] || body.match(/<<(.*?)>>/)?.[1] || '',
      stream: streamMatch ? Buffer.from(streamMatch[2], 'latin1') : null,
    });
  }

  const embeddedObjects = [];

  for (const object of objects) {
    if (!/\/Type\s*\/ObjStm\b/.test(object.dictionary) || !object.stream) {
      continue;
    }

    embeddedObjects.push(...parsePdfObjectStream(object));
  }

  objects.push(...embeddedObjects);

  return objects;
}

function parsePdfObjectStream(object) {
  const decoded = decodePdfStream(object.dictionary, object.stream);

  if (!decoded) {
    return [];
  }

  const count = Number(object.dictionary.match(/\/N\s+(\d+)/)?.[1] || 0);
  const first = Number(object.dictionary.match(/\/First\s+(\d+)/)?.[1] || 0);
  const text = decoded.toString('latin1');

  if (!count || !first || first >= text.length) {
    return [];
  }

  const header = text.slice(0, first).trim();
  const body = text.slice(first);
  const pairs = [...header.matchAll(/(\d+)\s+(\d+)/g)].slice(0, count);
  const embeddedObjects = [];

  for (let index = 0; index < pairs.length; index += 1) {
    const id = Number(pairs[index][1]);
    const start = Number(pairs[index][2]);
    const end = index + 1 < pairs.length ? Number(pairs[index + 1][2]) : body.length;
    const embeddedBody = body.slice(start, end).trim();

    if (!id || !embeddedBody) {
      continue;
    }

    embeddedObjects.push({
      id,
      body: embeddedBody,
      dictionary: embeddedBody.match(/<<(.*?)>>/)?.[1] || embeddedBody,
      stream: null,
    });
  }

  return embeddedObjects;
}

function decodePdfStream(dictionary, streamContent) {
  const hasFlate = /\/Filter\s*(?:\/FlateDecode|\[[^\]]*\/FlateDecode[^\]]*\])/.test(dictionary);

  if (!hasFlate) {
    return streamContent;
  }

  try {
    return zlib.inflateSync(streamContent);
  } catch {
    return null;
  }
}

function buildPdfUnicodeMaps(objects) {
  const maps = new Map();

  for (const object of objects) {
    if (!object.stream) {
      continue;
    }

    const decoded = decodePdfStream(object.dictionary, object.stream);
    const text = decoded?.toString('latin1') || '';

    if (text.includes('beginbfchar') || text.includes('beginbfrange')) {
      maps.set(object.id, parsePdfUnicodeMap(text));
    }
  }

  return maps;
}

function buildPdfFontMaps(objects, unicodeMaps) {
  const fontObjectMaps = new Map();

  for (const object of objects) {
    const toUnicodeMatch = object.body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);

    if (toUnicodeMatch) {
      const map = unicodeMaps.get(Number(toUnicodeMatch[1]));

      if (map?.size) {
        fontObjectMaps.set(object.id, map);
      }
    }
  }

  const fontMaps = new Map();

  for (const object of objects) {
    const fontRefRegex = /\/([A-Za-z0-9._-]+)\s+(\d+)\s+\d+\s+R/g;
    let match;

    while ((match = fontRefRegex.exec(object.body))) {
      const fontMap = fontObjectMaps.get(Number(match[2]));

      if (fontMap) {
        fontMaps.set(match[1], fontMap);
      }
    }
  }

  return fontMaps;
}

function parsePdfUnicodeMap(content) {
  const map = new Map();
  const charRegex = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g;
  let charMatch;

  while ((charMatch = charRegex.exec(content))) {
    map.set(normalizeHexCode(charMatch[1]), decodePdfUnicodeHex(charMatch[2]));
  }

  const rangeRegex = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+(?:<([0-9a-fA-F]+)>|\[([^\]]+)\])/g;
  let rangeMatch;

  while ((rangeMatch = rangeRegex.exec(content))) {
    const start = parseInt(rangeMatch[1], 16);
    const end = parseInt(rangeMatch[2], 16);
    const codeLength = normalizeHexCode(rangeMatch[1]).length;

    if (rangeMatch[4]) {
      const values = [...rangeMatch[4].matchAll(/<([0-9a-fA-F]+)>/g)].map((match) =>
        decodePdfUnicodeHex(match[1])
      );

      values.forEach((value, index) => {
        map.set((start + index).toString(16).toUpperCase().padStart(codeLength, '0'), value);
      });
      continue;
    }

    const destinationStart = parseInt(rangeMatch[3], 16);

    for (let code = start; code <= end && code - start < 512; code += 1) {
      map.set(
        code.toString(16).toUpperCase().padStart(codeLength, '0'),
        decodePdfUnicodeHex((destinationStart + code - start).toString(16))
      );
    }
  }

  return map;
}

function extractTextFromPdfContentStream(content, fontMaps) {
  const blocks = content.match(/BT[\s\S]*?ET/g) || [];

  return blocks
    .map((block) => extractTextFromPdfTextBlock(block, fontMaps))
    .join('\n');
}

function extractLooseTextFromPdfStream(content) {
  const parts = [];
  const tokenRegex =
    /\/(?:ActualText|Alt)\s*(\((?:\\.|[^\\)])*\)|<([0-9a-fA-F\s]+)>)|\((?:\\.|[^\\)])*\)/g;
  let tokenMatch;

  while ((tokenMatch = tokenRegex.exec(content))) {
    const token = tokenMatch[1] || tokenMatch[0];

    if (token.startsWith('(')) {
      parts.push(decodePdfLiteralString(token.slice(1, -1)));
      continue;
    }

    if (tokenMatch[2]) {
      parts.push(decodePdfHexString(tokenMatch[2]));
    }
  }

  return parts.join('\n');
}

function extractTextFromPdfTextBlock(block, fontMaps) {
  const parts = [];
  let currentFontMap = null;
  const tokenRegex = /\/([A-Za-z0-9._-]+)\s+[-\d.]+\s+Tf|\((?:\\.|[^\\)])*\)|<([0-9a-fA-F\s]+)>/g;
  let tokenMatch;

  while ((tokenMatch = tokenRegex.exec(block))) {
    if (tokenMatch[1]) {
      currentFontMap = fontMaps.get(tokenMatch[1]) || null;
      continue;
    }

    const token = tokenMatch[0];

    if (token.startsWith('(')) {
      parts.push(decodePdfLiteralString(token.slice(1, -1)));
      continue;
    }

    if (tokenMatch[2]) {
      parts.push(decodePdfHexString(tokenMatch[2], currentFontMap));
    }
  }

  return parts.join(' ');
}

function decodePdfLiteralString(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => {
      switch (char) {
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case 'b':
        case 'f':
          return ' ';
        default:
          return char;
      }
    })
    .replace(/\\\r?\n/g, '')
    .replace(/\\([0-7]{1,3})/g, (_match, octal) =>
      String.fromCharCode(parseInt(octal, 8))
    );
}

function decodePdfHexString(value, unicodeMap = null) {
  const hex = value.replace(/\s+/g, '');

  if (!hex) {
    return '';
  }

  if (unicodeMap?.size) {
    const decoded = decodePdfHexWithUnicodeMap(hex, unicodeMap);

    if (decoded) {
      return decoded;
    }
  }

  try {
    const paddedHex = hex.length % 2 === 0 ? hex : `${hex}0`;
    const bytes = Buffer.from(paddedHex, 'hex');

    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      const chars = [];

      for (let index = 2; index + 1 < bytes.length; index += 2) {
        chars.push(String.fromCharCode(bytes.readUInt16BE(index)));
      }

      return chars.join('');
    }

    return bytes.toString('utf8');
  } catch {
    return '';
  }
}

function decodePdfHexWithUnicodeMap(hex, unicodeMap) {
  const codeLengths = Array.from(
    new Set([...unicodeMap.keys()].map((key) => key.length))
  ).sort((a, b) => b - a);
  let output = '';
  let index = 0;

  while (index < hex.length) {
    const matchLength = codeLengths.find((length) =>
      unicodeMap.has(normalizeHexCode(hex.slice(index, index + length)))
    );

    if (!matchLength) {
      index += 2;
      continue;
    }

    output += unicodeMap.get(normalizeHexCode(hex.slice(index, index + matchLength))) || '';
    index += matchLength;
  }

  return output;
}

function decodePdfUnicodeHex(value) {
  const hex = normalizeHexCode(value);
  const paddedHex = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = Buffer.from(paddedHex, 'hex');

  if (!bytes.length) {
    return '';
  }

  const shouldDecodeUtf16 = bytes.length >= 2 && bytes.length % 2 === 0;

  if (shouldDecodeUtf16) {
    const chars = [];

    for (let index = 0; index + 1 < bytes.length; index += 2) {
      chars.push(String.fromCharCode(bytes.readUInt16BE(index)));
    }

    return chars.join('');
  }

  return bytes.toString('utf8');
}

function normalizeHexCode(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function normalizeExtractedPdfText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isReadablePdfTextLine)
    .filter(Boolean)
    .join('\n');
}

function isReadablePdfTextLine(line) {
  if (line.length < 2 || line.length > 180) {
    return false;
  }

  const lettersAndNumbers = (line.match(/[\p{L}\p{N}]/gu) || []).length;
  const commonText = (line.match(/[A-Za-z0-9\s:'’.,!?&+/-]/g) || []).length;
  const replacementOrControl = (line.match(/[\u0000-\u001f\u007f-\u009f�]/g) || []).length;
  const readable = (line.match(/[\p{L}\p{N}\p{P}\p{Zs}]/gu) || []).length;
  const readableRatio = readable / Math.max(line.length, 1);
  const commonTextRatio = commonText / Math.max(line.length, 1);

  return (
    lettersAndNumbers >= 2 &&
    replacementOrControl === 0 &&
    readableRatio > 0.85 &&
    commonTextRatio > 0.65
  );
}

module.exports = {
  previewTextImport,
  previewPdfImport,
  importTextEntries,
};
