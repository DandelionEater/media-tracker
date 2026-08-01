const assert = require('node:assert/strict');
const fixture = require('../test/fixtures/animethemes-song-search.json');
const {
  mapArtistSearchResponse,
  mapSongSearchResponse,
  normalizeMusicSearchTerm,
} = require('../animethemes');

const exactResults = mapSongSearchResponse(fixture, 'Unravel');
assert.equal(exactResults.length, 1);
assert.equal(exactResults[0].song.id, 5695);
assert.equal(exactResults[0].anilistId, 20605);
assert.equal(exactResults[0].theme.type, 'OP');
assert.equal(exactResults[0].theme.sequence, null);
assert.equal(
  exactResults[0].previewUrl,
  'https://a.animethemes.moe/TokyoGhoul-OP1.ogg'
);
assert.deepEqual(exactResults[0].song.artists, [
  {
    id: 243,
    name: 'TK from Ling tosite sigure',
  },
]);

const partialResults = mapSongSearchResponse(fixture, 'UNRAV');
assert.equal(partialResults.length, 1);
assert.equal(partialResults[0].song.id, 5695);

const travelResults = mapSongSearchResponse(fixture, 'travel');
assert.equal(travelResults.length, 1);
assert.equal(travelResults[0].song.id, 12567);

const unsafeFixture = structuredClone(fixture);
unsafeFixture.data.search.songs[0].animethemes[0].animethemeentries[0].videos.nodes[0].audio.link =
  'https://example.com/untrusted-preview.ogg';
assert.equal(mapSongSearchResponse(unsafeFixture, 'Unravel')[0].previewUrl, null);

const artistFixture = structuredClone(fixture);
artistFixture.data.search.artists = [
  {
    id: 122,
    slug: 'lisa',
    name: { main: 'LiSA', native: null },
    synonyms: [{ text: 'Risa Oribe' }],
    performances: [
      {
        alias: null,
        as: null,
        memberAlias: 'Yui',
        memberAs: null,
        song: artistFixture.data.search.songs[0],
      },
    ],
    memberPerformances: [],
  },
  {
    id: 999,
    slug: 'elisabeth',
    name: { main: 'Elisabeth', native: null },
    synonyms: [],
    performances: [],
    memberPerformances: [],
  },
];
const artistResults = mapArtistSearchResponse(artistFixture, 'LiSA');
assert.ok(artistResults.length > 0);
assert.equal(artistResults[0].artist.name, 'LiSA');
assert.equal(artistResults[0].artist.slug, 'lisa');
assert.equal(artistResults[0].creditedAs, 'Yui');
assert.ok(artistResults.every((result) => result.artist.id !== 999));

assert.equal(normalizeMusicSearchTerm('  My Soul, Your Beats!  '), 'my soul your beats');

console.log('AnimeThemes mapper smoke passed.');
