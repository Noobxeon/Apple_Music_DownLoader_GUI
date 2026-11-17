import { reactive, computed } from 'vue';

const api = window.appleMusic || {};

export const STOREFRONTS = [
  { code: 'cn', label: '中国大陆', short: 'CN' },
  { code: 'us', label: '美国', short: 'US' },
  { code: 'jp', label: '日本', short: 'JP' },
  { code: 'hk', label: '中国香港', short: 'HK' },
  { code: 'tw', label: '中国台湾', short: 'TW' },
  { code: 'gb', label: '英国', short: 'GB' },
  { code: 'kr', label: '韩国', short: 'KR' },
  { code: 'de', label: '德国', short: 'DE' }
];

export const DEFAULT_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#262a38"/>
          <stop offset="100%" stop-color="#171923"/>
        </linearGradient>
      </defs>
      <rect width="240" height="240" fill="url(#g)"/>
      <path d="M102 156V84l56-12v72" fill="none" stroke="#fa243c" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="88" cy="158" r="16" fill="#fa243c"/>
      <circle cx="144" cy="146" r="16" fill="#fa243c"/>
    </svg>`
  );

export function formatDuration(msOrSec, isSeconds = false) {
  const totalSec = isSeconds ? Math.floor(msOrSec || 0) : Math.floor((msOrSec || 0) / 1000);
  if (!totalSec || totalSec < 0) return '--:--';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' + s : s}`;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export const store = reactive({
  initialized: false,
  isMaximized: false,
  activeView: 'discover', // discover | search | parser | downloads | favorites | library | settings
  settingsTab: 'general', // general | quality | lyrics | templates | doctor

  config: {
    downloadDir: '',
    country: 'cn',
    theme: 'dark',
    maxConcurrent: 2,
    desktopNotification: true,
    useArchiveDb: false,
    songCodec: 'aac-web',
    musicVideoResolution: '1080p',
    musicVideoRemuxFormat: 'mp4',
    artistAutoSelect: 'top-songs',
    downloadMode: 'ytdlp',
    language: '',
    useWrapper: false,
    wrapperUrl: 'http://127.0.0.1',
    wrapperDecryptHost: '127.0.0.1',
    wrapperDecryptPort: 10020,
    syncedLyricsFormat: 'lrc',
    syncedLyricsOnly: false,
    coverFormat: 'jpg',
    coverSize: 1200,
    saveCover: false,
    savePlaylist: false,
    overwrite: false,
    useAlbumDate: false,
    albumFolderTemplate: '{album_artist}/{album}',
    singleDiscFileTemplate: '{track:02d} {title}',
    multiDiscFileTemplate: '{disc}-{track:02d} {title}',
    playlistFolderTemplate: 'Playlists/{playlist_title}',
    truncate: 60,
    pythonPath: '',
    ffmpegPath: '',
    nm3u8dlrePath: '',
    wvdPath: ''
  },

  env: {
    loading: false,
    python: { installed: false, version: null, path: null },
    gamdl: { installed: false, version: null },
    ffmpeg: { installed: false, version: null },
    nm3u8dlre: { installed: false, version: null },
    playwright: { installed: false },
    cookie: { valid: false, exists: false, count: 0, expiresAt: null, expired: false, path: '' }
  },

  charts: {
    loading: false,
    country: 'cn',
    songs: [],
    albums: [],
    error: ''
  },

  search: {
    keyword: '',
    loading: false,
    tab: 'songs', // songs | albums | videos | artists
    songs: [],
    albums: [],
    videos: [],
    artists: [],
    directItem: null,
    error: ''
  },

  queue: [],
  history: [],
  favorites: [],

  library: {
    loading: false,
    rootDir: '',
    items: [],
    totalSize: 0
  },

  // Modals
  authModalOpen: false,
  detailModal: {
    open: false,
    loading: false,
    mode: 'album', // album | artist
    header: null,
    tracks: [],
    albums: []
  },
  logModal: {
    open: false,
    task: null,
    lines: []
  },
  tagModal: {
    open: false,
    loading: false,
    data: null
  },

  // Audio Player State
  player: {
    currentTrack: null,
    playlist: [],
    currentIndex: -1,
    isPlaying: false,
    loadingAudio: false,
    currentTime: 0,
    duration: 0,
    volume: 0.85,
    muted: false,
    repeatMode: 'list', // list | one | shuffle
    showLyrics: false,
    lyrics: {
      found: false,
      format: '',
      raw: '',
      synced: []
    }
  },

  toasts: []
});

// Audio singleton managed cleanly outside DOM re-renders
let audioEl = null;

function ensureAudioElement() {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.volume = store.player.volume;

  audioEl.addEventListener('timeupdate', () => {
    store.player.currentTime = audioEl.currentTime || 0;
  });
  audioEl.addEventListener('loadedmetadata', () => {
    store.player.duration = audioEl.duration || 0;
    store.player.loadingAudio = false;
  });
  audioEl.addEventListener('play', () => {
    store.player.isPlaying = true;
  });
  audioEl.addEventListener('pause', () => {
    store.player.isPlaying = false;
  });
  audioEl.addEventListener('ended', () => {
    store.player.isPlaying = false;
    handleTrackEnded();
  });
  audioEl.addEventListener('error', () => {
    store.player.isPlaying = false;
    store.player.loadingAudio = false;
  });
  return audioEl;
}

function handleTrackEnded() {
  if (store.player.repeatMode === 'one') {
    const el = ensureAudioElement();
    el.currentTime = 0;
    el.play().catch(() => {});
    return;
  }
  if (store.player.playlist.length > 1) {
    playNext();
  }
}

export const activeDownloadCount = computed(
  () => store.queue.filter(t => t.status === 'downloading' || t.status === 'queued').length
);

export const activeLyricIndex = computed(() => {
  const list = store.player.lyrics.synced;
  if (!list || list.length === 0) return -1;
  const t = store.player.currentTime + 0.15;
  let active = -1;
  for (let i = 0; i < list.length; i++) {
    if (t >= list[i].time) {
      active = i;
    } else {
      break;
    }
  }
  return active;
});

export function notify(message, type = 'info', duration = 3200) {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  store.toasts.push({ id, message, type });
  setTimeout(() => {
    const idx = store.toasts.findIndex(t => t.id === id);
    if (idx >= 0) store.toasts.splice(idx, 1);
  }, duration);
}

export function applyTheme(theme) {
  const target = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
}

export async function updateConfig(partial) {
  Object.assign(store.config, partial);
  if (partial.theme) {
    applyTheme(partial.theme);
  }
  if (api.setConfig) {
    const saved = await api.setConfig(partial);
    if (saved) Object.assign(store.config, saved);
  }
}

export async function toggleTheme() {
  const next = store.config.theme === 'dark' ? 'light' : 'dark';
  await updateConfig({ theme: next });
}

export async function refreshEnvironment(force = false) {
  if (!api.checkEnvironment) return;
  store.env.loading = true;
  try {
    const res = await api.checkEnvironment(force);
    if (res) {
      Object.assign(store.env, res);
    }
  } catch (e) {
    console.error('Environment check error:', e);
  } finally {
    store.env.loading = false;
  }
}

export async function loadTopCharts(country) {
  if (!api.getTopCharts) return;
  const targetCountry = country || store.config.country || 'cn';
  store.charts.loading = true;
  store.charts.error = '';
  try {
    const res = await api.getTopCharts(targetCountry);
    store.charts.country = res.country;
    store.charts.songs = res.songs || [];
    store.charts.albums = res.albums || [];
  } catch (e) {
    store.charts.error = '获取 Apple Music 实时榜单失败，请检查网络连接';
  } finally {
    store.charts.loading = false;
  }
}

export async function performSearch(customKeyword) {
  const kw = (customKeyword !== undefined ? customKeyword : store.search.keyword).trim();
  if (!kw) return;
  store.search.keyword = kw;
  store.activeView = 'search';
  store.search.loading = true;
  store.search.error = '';

  try {
    const res = await api.searchMusic({
      term: kw,
      country: store.config.country || 'cn'
    });
    store.search.songs = res.songs || [];
    store.search.albums = res.albums || [];
    store.search.videos = res.videos || [];
    store.search.artists = res.artists || [];
    store.search.directItem = res.directItem || null;

    if (store.search.songs.length > 0) store.search.tab = 'songs';
    else if (store.search.albums.length > 0) store.search.tab = 'albums';
    else if (store.search.videos.length > 0) store.search.tab = 'videos';
    else if (store.search.artists.length > 0) store.search.tab = 'artists';
  } catch (e) {
    store.search.error = `搜索出错: ${e.message || '网络请求失败'}`;
  } finally {
    store.search.loading = false;
  }
}

export async function openAlbumDetail(albumItem) {
  const colId = albumItem?.collectionId || albumItem?.id;
  if (!colId || !api.lookupItem) return;

  store.detailModal.open = true;
  store.detailModal.loading = true;
  store.detailModal.mode = 'album';
  store.detailModal.header = albumItem;
  store.detailModal.tracks = [];
  store.detailModal.albums = [];

  try {
    const res = await api.lookupItem({
      id: colId,
      entity: 'album',
      country: store.config.country || 'cn'
    });
    if (res?.collection) {
      store.detailModal.header = { ...albumItem, ...res.collection };
    }
    store.detailModal.tracks = res?.tracks || [];
  } catch (e) {
    notify('加载专辑曲目详情失败', 'danger');
  } finally {
    store.detailModal.loading = false;
  }
}

export async function openArtistDetail(artistItem) {
  const artistId = artistItem?.artistId || artistItem?.id;
  if (!artistId || !api.lookupItem) return;

  store.detailModal.open = true;
  store.detailModal.loading = true;
  store.detailModal.mode = 'artist';
  store.detailModal.header = artistItem;
  store.detailModal.tracks = [];
  store.detailModal.albums = [];

  try {
    const res = await api.lookupItem({
      id: artistId,
      entity: 'artist',
      country: store.config.country || 'cn'
    });
    if (res?.artist) {
      store.detailModal.header = {
        ...artistItem,
        ...res.artist,
        cover: artistItem.cover || res.albums?.[0]?.cover || res.topSongs?.[0]?.cover || ''
      };
    }
    store.detailModal.tracks = res?.topSongs || [];
    store.detailModal.albums = res?.albums || [];
  } catch (e) {
    notify('加载歌手主页作品失败', 'danger');
  } finally {
    store.detailModal.loading = false;
  }
}

export async function enqueueDownload(items, overrides = {}) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (list.length === 0) return;

  if (!store.config.useWrapper && !store.env.cookie.valid && !store.env.cookie.hasMediaToken) {
    notify('请先登录或导入 Apple Music 凭证（或在设置中启用 Wrapper v2）', 'warning');
    store.authModalOpen = true;
    return;
  }

  if (!store.config.downloadDir && api.selectFolder) {
    const folder = await api.selectFolder();
    if (!folder) return;
    await updateConfig({ downloadDir: folder });
  }

  const addedIds = await api.enqueueTasks({ items: list, overrides });
  if (addedIds && addedIds.length > 0) {
    notify(`已加入下载队列 (${addedIds.length} 项)`, 'success');
  } else {
    notify('所选任务已在下载队列中', 'info');
  }
}

export function isFavorite(item) {
  if (!item) return false;
  return store.favorites.some(f => (item.id && f.id === String(item.id)) || (item.url && f.url === item.url));
}

export async function toggleFavoriteItem(item) {
  if (!api.toggleFavorite || !item) return;
  const existed = isFavorite(item);
  store.favorites = await api.toggleFavorite(item);
  notify(existed ? `已取消收藏「${item.title}」` : `已收藏「${item.title}」`, 'info', 2200);
}

export async function scanLocalLibrary() {
  if (!api.scanLibrary) return;
  store.library.loading = true;
  try {
    const res = await api.scanLibrary();
    store.library.rootDir = res.rootDir || store.config.downloadDir;
    store.library.items = res.items || [];
    store.library.totalSize = res.totalSize || 0;
  } catch (e) {
    notify('扫描本地音乐库失败', 'danger');
  } finally {
    store.library.loading = false;
  }
}

export async function openTaskLogModal(task) {
  store.logModal.task = task;
  store.logModal.lines = api.getTaskLogs ? await api.getTaskLogs(task.id) : [];
  store.logModal.open = true;
}

export async function openMediaTagInspector(localItem) {
  if (!api.inspectMediaTags) return;
  store.tagModal.open = true;
  store.tagModal.loading = true;
  store.tagModal.data = null;
  try {
    store.tagModal.data = await api.inspectMediaTags(localItem.filePath);
  } catch (e) {
    store.tagModal.data = { ok: false, error: e.message };
  } finally {
    store.tagModal.loading = false;
  }
}

// --- Audio Playback Actions ---
export async function playTrack(track, playlistContext = null) {
  if (!track) return;
  const el = ensureAudioElement();

  // Toggle play/pause if clicking same track
  if (store.player.currentTrack && store.player.currentTrack.id === track.id) {
    togglePlay();
    return;
  }

  if (Array.isArray(playlistContext) && playlistContext.length > 0) {
    store.player.playlist = playlistContext;
    store.player.currentIndex = playlistContext.findIndex(x => x.id === track.id);
  } else if (!store.player.playlist.some(x => x.id === track.id)) {
    store.player.playlist.push(track);
    store.player.currentIndex = store.player.playlist.length - 1;
  } else {
    store.player.currentIndex = store.player.playlist.findIndex(x => x.id === track.id);
  }

  store.player.currentTrack = track;
  store.player.currentTime = 0;
  store.player.duration = 0;
  store.player.loadingAudio = true;
  store.player.lyrics = { found: false, format: '', raw: '', synced: [] };

  let audioSrc = track.streamUrl || track.previewUrl || '';

  // Lazy lookup previewUrl for Apple RSS chart tracks
  if (!audioSrc && track.id && /^\d+$/.test(String(track.id)) && api.lookupItem) {
    try {
      const looked = await api.lookupItem({
        id: track.id,
        entity: 'song',
        country: store.config.country || 'cn'
      });
      if (looked && looked.previewUrl) {
        track.previewUrl = looked.previewUrl;
        audioSrc = looked.previewUrl;
      }
    } catch (e) {}
  }

  if (!audioSrc) {
    store.player.loadingAudio = false;
    notify('该曲目暂无官方试听音源，可直接下载完整版', 'warning');
    return;
  }

  el.src = audioSrc;
  el.play().catch(() => {
    store.player.loadingAudio = false;
    notify('音频流加载失败', 'danger');
  });

  // Load local synchronized lyrics if playing a local file
  if (track.filePath && api.getLocalLyrics) {
    api.getLocalLyrics(track.filePath).then(lyr => {
      if (store.player.currentTrack?.id === track.id && lyr) {
        store.player.lyrics = lyr;
      }
    }).catch(() => {});
  }
}

export function togglePlay() {
  if (!store.player.currentTrack) return;
  const el = ensureAudioElement();
  if (store.player.isPlaying) {
    el.pause();
  } else {
    el.play().catch(() => {});
  }
}

export function playPrev() {
  const list = store.player.playlist;
  if (!list.length) return;
  let nextIdx = store.player.currentIndex - 1;
  if (nextIdx < 0) nextIdx = list.length - 1;
  playTrack(list[nextIdx]);
}

export function playNext() {
  const list = store.player.playlist;
  if (!list.length) return;
  let nextIdx;
  if (store.player.repeatMode === 'shuffle' && list.length > 1) {
    nextIdx = Math.floor(Math.random() * list.length);
  } else {
    nextIdx = (store.player.currentIndex + 1) % list.length;
  }
  playTrack(list[nextIdx]);
}

export function seekAudio(seconds) {
  const el = ensureAudioElement();
  el.currentTime = Number(seconds) || 0;
  store.player.currentTime = el.currentTime;
}

export function setVolume(val) {
  const v = Math.max(0, Math.min(1, Number(val)));
  store.player.volume = v;
  store.player.muted = v === 0;
  const el = ensureAudioElement();
  el.volume = v;
  el.muted = store.player.muted;
}

export function toggleMute() {
  const el = ensureAudioElement();
  store.player.muted = !store.player.muted;
  el.muted = store.player.muted;
}

export function cycleRepeatMode() {
  const modes = ['list', 'one', 'shuffle'];
  const idx = modes.indexOf(store.player.repeatMode);
  store.player.repeatMode = modes[(idx + 1) % modes.length];
}

// --- Bootstrapping ---
export async function initApp() {
  if (store.initialized) return;
  store.initialized = true;

  try {
    if (api.getConfig) {
      const cfg = await api.getConfig();
      if (cfg) Object.assign(store.config, cfg);
    }
    applyTheme(store.config.theme);

    if (api.isWindowMaximized) {
      store.isMaximized = await api.isWindowMaximized();
    }
    if (api.onWindowMaximized) {
      api.onWindowMaximized((val) => {
        store.isMaximized = Boolean(val);
      });
    }

    if (api.onQueueUpdate) {
      api.onQueueUpdate((snapshot) => {
        store.queue = snapshot || [];
        if (api.getHistory) {
          api.getHistory().then(h => { store.history = h || []; });
        }
      });
    }

    if (api.onTaskLog) {
      api.onTaskLog(({ id, line }) => {
        if (store.logModal.open && store.logModal.task?.id === id) {
          store.logModal.lines.push(line);
          if (store.logModal.lines.length > 150) store.logModal.lines.shift();
        }
      });
    }

    const [favs, q, hist] = await Promise.all([
      api.getFavorites ? api.getFavorites() : [],
      api.getQueue ? api.getQueue() : [],
      api.getHistory ? api.getHistory() : []
    ]);
    store.favorites = favs || [];
    store.queue = q || [];
    store.history = hist || [];

    // Non-blocking parallel load of environment + live charts
    refreshEnvironment();
    loadTopCharts(store.config.country);
  } catch (err) {
    console.error('Init failed:', err);
    applyTheme('dark');
  }
}
