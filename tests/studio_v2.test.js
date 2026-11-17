const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AppStore } = require('../electron/store');
const { AppleMusicCatalog } = require('../electron/appleApi');
const { DownloadQueueManager } = require('../electron/downloadManager');
const { LibraryManager, parseLrcContent } = require('../electron/libraryManager');
const { inspectCookieContent, normalizeCookieInput } = require('../backend/cookies');
const { engineRuntime } = require('../backend/engine');

test('Studio AppStore persists config, favorites and history cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amdl-store-'));
  try {
    const store = new AppStore(tmpDir, tmpDir);
    assert.equal(store.getConfig().theme, 'dark');
    store.setConfig({ theme: 'light', maxConcurrent: 4 });
    assert.equal(store.getConfig().theme, 'light');
    assert.equal(store.getConfig().maxConcurrent, 4);

    const favs = store.toggleFavorite({ id: '1648877323', title: 'だから僕は音楽を辞めた', artist: 'Yorushika', url: 'https://music.apple.com/cn/album/test/1648876058?i=1648877323' });
    assert.equal(favs.length, 1);
    assert.equal(store.toggleFavorite({ id: '1648877323', url: 'https://music.apple.com/cn/album/test/1648876058?i=1648877323' }).length, 0);

    store.addHistoryEntry({ id: 'dl_1', title: 'Album A', status: 'completed', url: 'https://music.apple.com/cn/album/a/1' });
    assert.equal(store.getHistory().length, 1);
    assert.equal(store.clearHistory().length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Cookie inspector & bare media-user-token normalizer work accurately', () => {
  const netscape = normalizeCookieInput('eyJhbGciOiJFUzI1NiJ9.valid_sample_apple_media_token_payload');
  const summary = inspectCookieContent(netscape, '/tmp/cookies.txt');
  assert.equal(summary.valid, true);
  assert.equal(summary.hasMediaToken, true);
  assert.equal(summary.expired, false);
});

test('LibraryManager scans local audio, matches LRC lyrics, and bundled engine inspects media', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amdl-lib-'));
  try {
    const store = new AppStore(tmpDir, tmpDir);
    const albumFolder = path.join(tmpDir, 'Yorushika', 'Magic Lantern');
    fs.mkdirSync(albumFolder, { recursive: true });
    const audioFile = path.join(albumFolder, '01 都落ち.m4a');
    const lrcFile = path.join(albumFolder, '01 都落ち.lrc');
    fs.writeFileSync(audioFile, Buffer.alloc(512));
    fs.writeFileSync(lrcFile, '[00:05.50]第一句歌词\n[00:11.20]第二句歌词\n', 'utf8');

    const bundledExe = path.resolve(__dirname, '../vendor/gamdl-engine/gamdl-engine.exe');
    const getRuntime = cfg => engineRuntime(cfg, { enginePath: bundledExe });
    const lib = new LibraryManager(store, getRuntime, path.resolve(__dirname, '../backend'));

    const scanned = lib.scanLibrary(tmpDir);
    assert.equal(scanned.items.length, 1);
    assert.equal(scanned.items[0].title, '都落ち');
    assert.equal(scanned.items[0].hasLyrics, true);

    const lyrics = await lib.getLyricsForTrack(audioFile);
    assert.equal(lyrics.found, true);
    assert.equal(lyrics.synced.length, 2);
    assert.equal(parseLrcContent(lyrics.raw)[0].time, 5.5);

    if (fs.existsSync(bundledExe)) {
      const inspected = await lib.inspectMediaTags(audioFile);
      assert.equal(inspected.ok, true);
      assert.equal(inspected.fileName, '01 都落ち.m4a');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('DownloadQueueManager parses Track X/Y, track names, speed and percentages cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amdl-qm-'));
  try {
    const store = new AppStore(tmpDir, tmpDir);
    const qm = new DownloadQueueManager({ store, getRuntime: async () => ({}), userDataPath: tmpDir });
    const dummy = { id: '1', logs: [], percent: 0, albumProgress: '', currentTrack: '', speed: '', progText: '' };
    qm._parseOutputChunk(dummy, '2026-11-18 [info ] Track 2/8 Downloading "晴天"\n[download]  50.0% of ~7.5MiB at 9.8MiB/s');
    assert.equal(dummy.albumProgress, '2/8');
    assert.equal(dummy.currentTrack, '晴天');
    assert.equal(dummy.speed, '9.8MiB/s');
    assert.ok(dummy.percent >= 15 && dummy.percent <= 25);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AppleMusicCatalog fetches live Top Charts and CN subscription catalog tracks', async () => {
  const catalog = new AppleMusicCatalog(global.fetch);
  const charts = await catalog.getTopCharts('cn');
  assert.ok(charts.songs.length > 0);
  assert.ok(charts.albums.length > 0);

  const cnRes = await catalog.searchMusic({ term: 'yorushika', country: 'cn' });
  assert.ok(cnRes.songs.length > 0, 'CN catalog search should return Yorushika songs');
});
