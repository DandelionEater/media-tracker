const anilist = require('./anilist');
const animethemes = require('./animethemes');

async function searchMedia(search, options = {}) {
  const query = String(search || '').trim();
  const musicSearchPromise =
    query.normalize('NFKC').length >= 2
      ? animethemes
          .searchMusic(query)
          .then((items) => ({ ...items, error: null }))
          .catch((error) => ({ songs: [], artists: [], error }))
      : Promise.resolve({ songs: [], artists: [], error: null });

  const [baseResults, musicSearch] = await Promise.all([
    anilist.searchMedia(query, options),
    musicSearchPromise,
  ]);
  const warnings = [];

  if (musicSearch.error) {
    console.warn('AnimeThemes song search failed:', musicSearch.error);
    warnings.push({
      provider: 'animethemes',
      message: 'Music matches are temporarily unavailable.',
    });
  }

  const musicAssociations = [...musicSearch.songs, ...musicSearch.artists];
  if (!musicAssociations.length) {
    return {
      ...baseResults,
      songs: [],
      artists: [],
      warnings,
    };
  }

  try {
    const mediaItems = await anilist.getAnimeSearchMediaByIds(
      musicAssociations.map((item) => item.anilistId),
      options
    );
    const mediaById = new Map(mediaItems.map((media) => [Number(media.id), media]));
    const songs = new Map();

    for (const association of musicSearch.songs) {
      const media = mediaById.get(Number(association.anilistId));
      if (!media) continue;

      const key = `${association.song.id}:${association.theme.id}:${media.id}`;
      songs.set(key, {
        song: association.song,
        theme: association.theme,
        media,
        previewUrl: association.previewUrl,
      });
    }

    const artists = new Map();
    for (const association of musicSearch.artists) {
      const media = mediaById.get(Number(association.anilistId));
      if (!media) continue;

      const key = `${association.artist.id}:${association.song.id}:${association.theme.id}:${media.id}`;
      artists.set(key, {
        artist: association.artist,
        creditedAs: association.creditedAs,
        song: association.song,
        theme: association.theme,
        media,
        previewUrl: association.previewUrl,
      });
    }

    return {
      ...baseResults,
      songs: Array.from(songs.values()),
      artists: Array.from(artists.values()),
      warnings,
    };
  } catch (error) {
    console.warn('AnimeThemes media resolution failed:', error);
    warnings.push({
      provider: 'animethemes',
      message: 'Music matches could not be connected to AniList right now.',
    });

    return {
      ...baseResults,
      songs: [],
      artists: [],
      warnings,
    };
  }
}

async function getArtistMedia(slug, page = 1, options = {}) {
  const catalog = await animethemes.getArtistThemeAssociations(slug, page);
  const mediaItems = await anilist.getAnimeSearchMediaByIds(
    catalog.items.map((item) => item.anilistId),
    options
  );
  const mediaById = new Map(mediaItems.map((media) => [Number(media.id), media]));

  return {
    artist: catalog.artist,
    items: catalog.items.flatMap((association) => {
      const media = mediaById.get(Number(association.anilistId));
      return media
        ? [
            {
              artist: association.artist,
              creditedAs: association.creditedAs,
              song: association.song,
              theme: association.theme,
              media,
              previewUrl: association.previewUrl,
            },
          ]
        : [];
    }),
    pageInfo: catalog.pageInfo,
  };
}

module.exports = {
  getArtistMedia,
  searchMedia,
};
