const fs = require('fs');
const path = require('path');

function createDefaultConfig(downloadsDir) {
  return {
    downloadDir: path.join(downloadsDir, 'Apple Music'),
    country: 'cn',
    theme: 'dark',
    maxConcurrent: 2,
    desktopNotification: true,
    useArchiveDb: false,

    // Audio & Video quality
    songCodec: 'aac-web',
    musicVideoResolution: '1080p',
    musicVideoRemuxFormat: 'mp4',
    artistAutoSelect: 'top-songs',
    downloadMode: 'ytdlp',
    language: '',

    // Wrapper v2 (for ALAC lossless)
    useWrapper: false,
    wrapperUrl: 'http://127.0.0.1',
    wrapperDecryptHost: '127.0.0.1',
    wrapperDecryptPort: 10020,

    // Lyrics & Cover & Metadata
    syncedLyricsFormat: 'lrc',
    syncedLyricsOnly: false,
    coverFormat: 'jpg',
    coverSize: 1200,
    saveCover: false,
    savePlaylist: false,
    overwrite: false,
    useAlbumDate: false,

    // Naming templates
    albumFolderTemplate: '{album_artist}/{album}',
    singleDiscFileTemplate: '{track:02d} {title}',
    multiDiscFileTemplate: '{disc}-{track:02d} {title}',
    playlistFolderTemplate: 'Playlists/{playlist_title}',
    truncate: 60,

    // Custom binary paths
    pythonPath: '',
    ffmpegPath: '',
    nm3u8dlrePath: '',
    wvdPath: ''
  };
}

class AppStore {
  constructor(userDataPath, downloadsDir) {
    this.userDataPath = userDataPath;
    this.downloadsDir = downloadsDir || userDataPath;
    try { fs.mkdirSync(this.userDataPath, { recursive: true }); } catch {}

    this.configPath = path.join(this.userDataPath, 'config.json');
    this.cookiePath = path.join(this.userDataPath, 'cookies.txt');
    this.favoritesPath = path.join(this.userDataPath, 'favorites.json');
    this.historyPath = path.join(this.userDataPath, 'history.json');
    this.archiveDbPath = path.join(this.userDataPath, 'gamdl_archive.sqlite');
  }

  _readJson(filePath, fallback) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.error(`Failed reading ${filePath}:`, err);
    }
    return fallback;
  }

  _writeJson(filePath, data) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`Failed writing ${filePath}:`, e);
      return false;
    }
  }

  getConfig() {
    const defaults = createDefaultConfig(this.downloadsDir);
    const saved = this._readJson(this.configPath, {});
    return { ...defaults, ...saved };
  }

  setConfig(partial) {
    const merged = { ...this.getConfig(), ...partial };
    if (!this._writeJson(this.configPath, merged)) return null;
    return merged;
  }

  resetConfig() {
    const defaults = createDefaultConfig(this.downloadsDir);
    this._writeJson(this.configPath, defaults);
    return defaults;
  }

  getFavorites() {
    const data = this._readJson(this.favoritesPath, []);
    return Array.isArray(data) ? data : [];
  }

  toggleFavorite(item) {
    if (!item || !item.url) return this.getFavorites();
    const list = this.getFavorites();
    const idx = list.findIndex(x => (item.id && x.id === String(item.id)) || x.url === item.url);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.unshift({
        id: String(item.id || `fav_${Date.now()}`),
        type: item.type || '歌曲',
        title: item.title || '未知标题',
        artist: item.artist || '未知艺术家',
        album: item.album || '',
        cover: item.cover || '',
        url: item.url,
        previewUrl: item.previewUrl || '',
        collectionId: item.collectionId || null,
        addedAt: Date.now()
      });
    }
    this._writeJson(this.favoritesPath, list);
    return list;
  }

  removeFavorite(idOrUrl) {
    const list = this.getFavorites().filter(x => x.id !== idOrUrl && x.url !== idOrUrl);
    this._writeJson(this.favoritesPath, list);
    return list;
  }

  getHistory() {
    const data = this._readJson(this.historyPath, []);
    return Array.isArray(data) ? data : [];
  }

  addHistoryEntry(entry) {
    const list = this.getHistory();
    const filtered = list.filter(x => x.id !== entry.id);
    filtered.unshift({
      id: entry.id,
      title: entry.title,
      artist: entry.artist || '',
      cover: entry.cover || '',
      type: entry.type || '歌曲',
      url: entry.url,
      saveDir: entry.saveDir,
      codec: entry.codec || '',
      status: entry.status,
      msg: entry.msg || '',
      completedAt: Date.now()
    });
    const trimmed = filtered.slice(0, 200);
    this._writeJson(this.historyPath, trimmed);
    return trimmed;
  }

  clearHistory() {
    this._writeJson(this.historyPath, []);
    return [];
  }
}

module.exports = { AppStore, createDefaultConfig };
