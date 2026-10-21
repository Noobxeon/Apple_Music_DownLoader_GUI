const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCatalogPage, searchCatalog } = require('../backend/search');

const song = { title: 'だから僕は音楽を辞めた', subtitleLinks: [{ title: 'Yorushika' }],
  contentDescriptor: { kind: 'song', identifiers: { storeAdamID: '1648877323' },
    url: 'https://music.apple.com/cn/album/test/1648876058?i=1648877323' },
  artwork: { dictionary: { url: 'https://is1-ssl.mzstatic.com/image/{w}x{h}bb.{f}' } } };
const album = { titleLinks: [{ title: 'だから僕は音楽を辞めた' }], subtitleLinks: [{ title: 'Yorushika' }],
  contentDescriptor: { kind: 'album', identifiers: { storeAdamID: '1648876058' },
    url: 'https://music.apple.com/cn/album/test/1648876058' } };
const page = items => `<script type="application/json" id="serialized-server-data">${JSON.stringify({ data: [{ intent: { $kind: 'SearchResultsPageIntent', storefront: 'cn' }, data: { sections: [{ items }] } }] })}</script>`;

test('Apple Music catalog retains CN songs absent from iTunes and deduplicates sections', () => {
  const results = parseCatalogPage(page([song, album, song]), 'cn');
  assert.equal(results.length, 2);
  assert.equal(results[0].id, '1648877323');
  assert.equal(results[0].title, 'だから僕は音楽を辞めた');
  assert.equal(results[0].artist, 'Yorushika');
  assert.match(results[0].url, /\/cn\/.*i=1648877323/);
  assert.match(results[0].cover, /600x600bb.jpg$/);
  assert.equal(results[1].type, '专辑');
});

test('catalog filters other regions, non-music content and untrusted URLs', () => {
  const bad = ['https://evil.example/cn/album/a/1', 'https://music.apple.com/us/album/a/1',
    'javascript:alert(1)', 'https://user@music.apple.com/cn/album/a/1'];
  const items = bad.map(url => ({ ...song, contentDescriptor: { ...song.contentDescriptor, url } }));
  items.push({ ...song, contentDescriptor: { ...song.contentDescriptor, kind: 'artist' } });
  assert.deepEqual(parseCatalogPage(page(items), 'cn'), []);
  assert.deepEqual(parseCatalogPage(page([]), 'cn'), []);
  assert.throws(() => parseCatalogPage('<html>Blocked</html>', 'cn'), /格式/);
});

test('search uses selected Apple Music catalog with encoded keywords and timeout', async () => {
  const result = await searchCatalog(async (url, options) => {
    assert.equal(url, 'https://music.apple.com/cn/search?term=yorushika%20%26%20%E9%9F%B3%E6%A5%BD');
    assert.ok(options.signal);
    return { ok: true, text: async () => page([song]) };
  }, 'yorushika & 音楽', 'cn');
  assert.equal(result[0].id, '1648877323');
  await assert.rejects(searchCatalog(async () => ({ ok: false }), 'a', 'cn'), /暂不可用/);
});

test('redirected regional pages fall back without silently changing the requested storefront', async () => {
  const result = await searchCatalog(async url => {
    if (url.startsWith('https://music.apple.com/')) return { ok: true, text: async () => page([song]) };
    assert.match(url, /country=us/);
    return { ok: true, json: async () => ({ results: [{ wrapperType: 'track', trackId: 1, trackName: 'test',
      trackViewUrl: 'https://music.apple.com/us/song/test/1' }] }) };
  }, 'a', 'us');
  assert.ok(result.length > 0);
  assert.match(result[0].url, /\/us\//);
  assert.throws(() => parseCatalogPage(page([song]), 'us'), /重定向/);
});
