const { searchCatalog } = require('../backend/search');
const { musicUrl } = require('../backend/engine');

function upscaleArtwork(url, size = 600) {
  if (!url) return '';
  return url.replace(/\d+x\d+(bb|mv|sr)?\.(jpg|png|webp)/i, `${size}x${size}bb.$2`);
}

function normalizeAppleUrl(url) {
  if (!url) return '';
  return url.replace('https://itunes.apple.com/', 'https://music.apple.com/');
}

function mapSongItem(item) {
  return {
    id: String(item.trackId),
    type: '歌曲',
    mediaKind: 'song',
    title: item.trackName || '未知曲目',
    artist: item.artistName || '未知艺术家',
    artistId: item.artistId ? String(item.artistId) : '',
    album: item.collectionName || '',
    collectionId: item.collectionId ? String(item.collectionId) : '',
    trackNumber: item.trackNumber || 0,
    discNumber: item.discNumber || 1,
    durationMs: item.trackTimeMillis || 0,
    explicit: item.trackExplicitness === 'explicit',
    genre: item.primaryGenreName || '',
    releaseDate: item.releaseDate ? item.releaseDate.slice(0, 10) : '',
    cover: upscaleArtwork(item.artworkUrl100, 600),
    url: normalizeAppleUrl(item.trackViewUrl || ''),
    previewUrl: item.previewUrl || ''
  };
}

function mapAlbumItem(item) {
  return {
    id: String(item.collectionId),
    collectionId: String(item.collectionId),
    type: '专辑',
    mediaKind: 'album',
    title: item.collectionName || '未知专辑',
    artist: item.artistName || '未知艺术家',
    artistId: item.artistId ? String(item.artistId) : '',
    album: item.collectionName || '',
    trackCount: item.trackCount || 0,
    explicit: item.collectionExplicitness === 'explicit',
    genre: item.primaryGenreName || '',
    releaseDate: item.releaseDate ? item.releaseDate.slice(0, 10) : '',
    copyright: item.copyright || '',
    cover: upscaleArtwork(item.artworkUrl100, 600),
    url: normalizeAppleUrl(item.collectionViewUrl || ''),
    previewUrl: ''
  };
}

function mapMusicVideoItem(item) {
  return {
    id: String(item.trackId),
    type: 'MV',
    mediaKind: 'music-video',
    title: item.trackName || '未知 MV',
    artist: item.artistName || '未知艺术家',
    artistId: item.artistId ? String(item.artistId) : '',
    album: item.collectionName || 'Music Video',
    durationMs: item.trackTimeMillis || 0,
    explicit: item.trackExplicitness === 'explicit',
    genre: item.primaryGenreName || '',
    releaseDate: item.releaseDate ? item.releaseDate.slice(0, 10) : '',
    cover: upscaleArtwork(item.artworkUrl100, 640),
    url: normalizeAppleUrl(item.trackViewUrl || ''),
    previewUrl: item.previewUrl || ''
  };
}

function mapArtistItem(item) {
  return {
    id: String(item.artistId),
    artistId: String(item.artistId),
    type: '歌手',
    mediaKind: 'artist',
    title: item.artistName || '未知歌手',
    artist: item.artistName || '',
    genre: item.primaryGenreName || 'Apple Music 艺人',
    cover: '',
    url: normalizeAppleUrl(item.artistLinkUrl || ''),
    previewUrl: ''
  };
}

class AppleMusicCatalog {
  constructor(fetchImpl) {
    this.fetch = fetchImpl || global.fetch;
  }

  async _fetchJson(url, retries = 2) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  async getTopCharts(country = 'cn') {
    const cc = (country || 'cn').toLowerCase();
    const songsUrl = `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/50/songs.json`;
    const albumsUrl = `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/25/albums.json`;

    const fastFetchJson = async (url) => {
      const res = await this.fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    const [songsData, albumsData] = await Promise.all([
      fastFetchJson(songsUrl).catch(() => null),
      fastFetchJson(albumsUrl).catch(() => null)
    ]);

    let songs = (songsData?.feed?.results || []).map((item, idx) => {
      let collectionId = '';
      const albumMatch = (item.url || '').match(/\/album\/[^/]+\/(\d+)/);
      if (albumMatch) collectionId = albumMatch[1];

      return {
        id: String(item.id),
        rank: idx + 1,
        type: '歌曲',
        mediaKind: 'song',
        title: item.name || '未知曲目',
        artist: item.artistName || '未知艺术家',
        artistId: item.artistId ? String(item.artistId) : '',
        album: item.genres?.[0]?.name || 'Apple Music 热榜',
        collectionId,
        explicit: item.contentAdvisoryRating === 'Explicit',
        releaseDate: item.releaseDate || '',
        cover: upscaleArtwork(item.artworkUrl100, 600),
        url: item.url || '',
        previewUrl: ''
      };
    });

    let albums = (albumsData?.feed?.results || []).map((item, idx) => ({
      id: String(item.id),
      collectionId: String(item.id),
      rank: idx + 1,
      type: '专辑',
      mediaKind: 'album',
      title: item.name || '未知专辑',
      artist: item.artistName || '未知艺术家',
      artistId: item.artistId ? String(item.artistId) : '',
      album: item.name || '',
      genre: item.genres?.[0]?.name || '',
      explicit: item.contentAdvisoryRating === 'Explicit',
      releaseDate: item.releaseDate || '',
      cover: upscaleArtwork(item.artworkUrl100, 600),
      url: item.url || '',
      previewUrl: ''
    }));

    // Domestic CDN fallback via Apple Music real subscription catalog (works in CN where iTunes Store is empty!)
    if (songs.length === 0 || albums.length === 0) {
      const seedTermMap = { cn: '周杰伦', hk: '陳奕迅', tw: '周杰倫', jp: 'YOASOBI', kr: 'NewJeans' };
      const seed = seedTermMap[cc] || 'Taylor Swift';
      const catalogFallback = await searchCatalog(this.fetch, seed, cc).catch(() => []);
      if (songs.length === 0) {
        songs = catalogFallback
          .filter(x => x.type === '歌曲')
          .map((item, idx) => ({ ...item, mediaKind: 'song', rank: idx + 1 }));
      }
      if (albums.length === 0) {
        albums = catalogFallback
          .filter(x => x.type === '专辑')
          .map((item, idx) => ({ ...item, collectionId: String(item.id), mediaKind: 'album', rank: idx + 1 }));
      }
    }

    return {
      country: cc,
      updatedAt: songsData?.feed?.updated || new Date().toISOString(),
      songs,
      albums
    };
  }

  async lookupItem({ id, entity = 'song', country = 'cn' }) {
    const cc = (country || 'cn').toLowerCase();
    const cleanId = String(id).trim();
    if (!cleanId) throw new Error('缺少查询 ID');

    const rewriteStorefront = (urlStr) => {
      if (!urlStr) return '';
      return normalizeAppleUrl(urlStr).replace(/^(https:\/\/music\.apple\.com\/)[a-z]{2}\//i, `$1${cc}/`);
    };

    if (entity === 'album') {
      let data = await this._fetchJson(
        `https://itunes.apple.com/lookup?id=${encodeURIComponent(cleanId)}&country=${cc}&entity=song&limit=200`
      ).catch(() => ({ results: [] }));

      let results = data?.results || [];
      let tracks = results.filter(r => r.wrapperType === 'track' && r.kind === 'song');

      // Mainland China (cn) iTunes Store omits tracklists; enrich via hk/jp/us while preserving /cn/ URLs
      if (tracks.length === 0 && cc === 'cn') {
        for (const fallbackCc of ['hk', 'jp', 'us']) {
          const fb = await this._fetchJson(
            `https://itunes.apple.com/lookup?id=${encodeURIComponent(cleanId)}&country=${fallbackCc}&entity=song&limit=200`
          ).catch(() => ({ results: [] }));
          const fbTracks = (fb?.results || []).filter(r => r.wrapperType === 'track' && r.kind === 'song');
          if (fbTracks.length > 0) {
            if (!results.find(r => r.wrapperType === 'collection')) {
              results = fb.results;
            }
            tracks = fbTracks;
            break;
          }
        }
      }

      const colRaw = results.find(r => r.wrapperType === 'collection');
      const mappedCol = colRaw ? mapAlbumItem(colRaw) : null;
      if (mappedCol) mappedCol.url = rewriteStorefront(mappedCol.url);

      const mappedTracks = tracks.map(r => {
        const t = mapSongItem(r);
        t.url = rewriteStorefront(t.url);
        return t;
      });

      return {
        collection: mappedCol,
        tracks: mappedTracks
      };
    }

    if (entity === 'artist') {
      const queryCc = cc === 'cn' ? 'hk' : cc;
      const [songsRes, albumsRes] = await Promise.all([
        this._fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(cleanId)}&country=${queryCc}&entity=song&limit=40`).catch(() => ({ results: [] })),
        this._fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(cleanId)}&country=${queryCc}&entity=album&limit=30`).catch(() => ({ results: [] }))
      ]);
      const artistRaw = (songsRes?.results || []).find(r => r.wrapperType === 'artist')
        || (albumsRes?.results || []).find(r => r.wrapperType === 'artist');
      const topSongs = (songsRes?.results || []).filter(r => r.wrapperType === 'track').map(r => {
        const s = mapSongItem(r);
        s.url = rewriteStorefront(s.url);
        return s;
      });
      const albums = (albumsRes?.results || []).filter(r => r.wrapperType === 'collection').map(r => {
        const a = mapAlbumItem(r);
        a.url = rewriteStorefront(a.url);
        return a;
      });

      const mappedArtist = artistRaw ? mapArtistItem(artistRaw) : null;
      if (mappedArtist) mappedArtist.url = rewriteStorefront(mappedArtist.url);

      return {
        artist: mappedArtist,
        topSongs,
        albums
      };
    }

    let data = await this._fetchJson(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(cleanId)}&country=${cc}`
    ).catch(() => ({ results: [] }));
    let first = (data?.results || [])[0];

    if ((!first || !first.previewUrl) && cc === 'cn') {
      for (const fallbackCc of ['hk', 'jp', 'us']) {
        const fb = await this._fetchJson(
          `https://itunes.apple.com/lookup?id=${encodeURIComponent(cleanId)}&country=${fallbackCc}`
        ).catch(() => ({ results: [] }));
        if (fb?.results?.[0]) {
          first = fb.results[0];
          if (first.previewUrl) break;
        }
      }
    }

    if (!first) return null;
    const mapped = first.kind === 'music-video'
      ? mapMusicVideoItem(first)
      : (first.wrapperType === 'collection' ? mapAlbumItem(first) : mapSongItem(first));
    mapped.url = rewriteStorefront(mapped.url);
    return mapped;
  }

  async parseAppleUrl(rawUrl, fallbackCountry = 'cn') {
    const trimmed = (rawUrl || '').trim();
    const normalized = musicUrl(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const urlObj = new URL(normalized);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    const storefront = (parts[0] && parts[0].length === 2 ? parts[0] : fallbackCountry).toLowerCase();
    const mediaType = parts[1] || '';
    const lastSegment = parts[parts.length - 1] || '';
    const slugSegment = parts.length >= 4 ? parts[2] : '';
    const subSongId = urlObj.searchParams.get('i');

    const prettySlug = slugSegment
      ? decodeURIComponent(slugSegment).replace(/-/g, ' ')
      : 'Apple Music 媒体项目';

    if (mediaType === 'album' && subSongId && /^\d+$/.test(subSongId)) {
      const songInfo = await this.lookupItem({ id: subSongId, entity: 'song', country: storefront }).catch(() => null);
      if (songInfo) {
        return {
          kind: 'song',
          storefront,
          url: normalized,
          item: { ...songInfo, url: normalized, isDirectUrl: true },
          tracks: [songInfo]
        };
      }
    }

    if (mediaType === 'album' && /^\d+$/.test(lastSegment)) {
      const albumData = await this.lookupItem({ id: lastSegment, entity: 'album', country: storefront }).catch(() => null);
      if (albumData && albumData.collection) {
        return {
          kind: 'album',
          storefront,
          url: normalized,
          item: { ...albumData.collection, url: normalized, isDirectUrl: true },
          tracks: albumData.tracks || []
        };
      }
    }

    if ((mediaType === 'song' || mediaType === 'music-video') && /^\d+$/.test(lastSegment)) {
      const itemInfo = await this.lookupItem({ id: lastSegment, entity: 'song', country: storefront }).catch(() => null);
      if (itemInfo) {
        return {
          kind: mediaType,
          storefront,
          url: normalized,
          item: { ...itemInfo, url: normalized, isDirectUrl: true },
          tracks: [itemInfo]
        };
      }
    }

    if (mediaType === 'artist' && /^\d+$/.test(lastSegment)) {
      const artistData = await this.lookupItem({ id: lastSegment, entity: 'artist', country: storefront }).catch(() => null);
      if (artistData && artistData.artist) {
        return {
          kind: 'artist',
          storefront,
          url: normalized,
          item: {
            ...artistData.artist,
            cover: artistData.albums?.[0]?.cover || artistData.topSongs?.[0]?.cover || '',
            url: normalized,
            isDirectUrl: true
          },
          tracks: artistData.topSongs || [],
          albums: artistData.albums || []
        };
      }
    }

    const typeLabelMap = {
      playlist: '歌单',
      album: '专辑',
      song: '歌曲',
      'music-video': 'MV',
      artist: '歌手',
      post: '动态视频'
    };
    const detectedType = typeLabelMap[mediaType] || '直链';
    return {
      kind: mediaType || 'direct',
      storefront,
      url: normalized,
      item: {
        id: `url_${lastSegment || Date.now()}`,
        type: detectedType,
        mediaKind: mediaType || 'direct',
        title: prettySlug,
        artist: `链接来源 (${storefront.toUpperCase()})`,
        album: detectedType,
        cover: '',
        url: normalized,
        previewUrl: '',
        isDirectUrl: true
      },
      tracks: []
    };
  }

  async searchMusic({ term, country = 'cn' }) {
    const trimmed = (term || '').trim();
    if (!trimmed) return { songs: [], albums: [], videos: [], artists: [], directItem: null };

    if (trimmed.includes('music.apple.com')) {
      const parsed = await this.parseAppleUrl(trimmed, country);
      return {
        songs: parsed.kind === 'song' && parsed.item ? [parsed.item] : (parsed.tracks || []),
        albums: parsed.kind === 'album' && parsed.item ? [parsed.item] : (parsed.albums || []),
        videos: parsed.kind === 'music-video' && parsed.item ? [parsed.item] : [],
        artists: parsed.kind === 'artist' && parsed.item ? [parsed.item] : [],
        directItem: parsed.item
      };
    }

    const cc = (country || 'cn').toLowerCase();
    const storeCc = cc === 'cn' ? 'hk' : cc;
    const q = encodeURIComponent(trimmed);
    const rewriteStorefront = (urlStr) => {
      if (!urlStr) return '';
      return normalizeAppleUrl(urlStr).replace(/^(https:\/\/music\.apple\.com\/)[a-z]{2}\//i, `$1${cc}/`);
    };

    // 1. Primary Song/Album search via Apple Music real subscription catalog (preserves CN catalog tracks!)
    // 2. Parallel iTunes enrichment for previewUrl/duration + MV + Artists
    const [catalogItems, itunesSongs, mvData, artistData] = await Promise.all([
      searchCatalog(this.fetch, trimmed, cc),
      this._fetchJson(`https://itunes.apple.com/search?term=${q}&country=${storeCc}&entity=song&limit=80`).catch(() => ({ results: [] })),
      this._fetchJson(`https://itunes.apple.com/search?term=${q}&country=${storeCc}&entity=musicVideo&limit=36`).catch(() => ({ results: [] })),
      this._fetchJson(`https://itunes.apple.com/search?term=${q}&country=${storeCc}&entity=musicArtist&limit=20`).catch(() => ({ results: [] }))
    ]);

    const itunesSongById = new Map();
    for (const raw of (itunesSongs.results || [])) {
      if (raw.trackId) itunesSongById.set(String(raw.trackId), mapSongItem(raw));
    }

    const songs = [];
    const albums = [];
    for (const item of catalogItems) {
      if (item.type === '歌曲') {
        const extra = itunesSongById.get(String(item.id));
        const colMatch = (item.url || '').match(/\/album\/[^/]+\/(\d+)/);
        songs.push({
          ...item,
          mediaKind: 'song',
          collectionId: extra?.collectionId || (colMatch ? colMatch[1] : ''),
          artistId: extra?.artistId || '',
          durationMs: extra?.durationMs || 0,
          explicit: extra?.explicit || false,
          previewUrl: item.previewUrl || extra?.previewUrl || ''
        });
      } else {
        albums.push({
          ...item,
          collectionId: String(item.id),
          mediaKind: 'album'
        });
      }
    }

    const seenMv = new Set();
    const videos = (mvData.results || [])
      .map(raw => {
        const mv = mapMusicVideoItem(raw);
        mv.url = rewriteStorefront(mv.url);
        return mv;
      })
      .filter(v => (seenMv.has(v.id) ? false : seenMv.add(v.id)));

    const artistCoverMap = new Map();
    for (const a of albums) {
      if (a.artist && a.cover && !artistCoverMap.has(a.artist)) artistCoverMap.set(a.artist, a.cover);
    }
    for (const s of songs) {
      if (s.artist && s.cover && !artistCoverMap.has(s.artist)) artistCoverMap.set(s.artist, s.cover);
    }

    const seenArtist = new Set();
    const artists = (artistData.results || [])
      .map(raw => {
        const mapped = mapArtistItem(raw);
        mapped.url = rewriteStorefront(mapped.url);
        mapped.cover = artistCoverMap.get(mapped.title) || '';
        return mapped;
      })
      .filter(a => (seenArtist.has(a.id) ? false : seenArtist.add(a.id)));

    return { songs, albums, videos, artists, directItem: null };
  }
}

module.exports = { AppleMusicCatalog, upscaleArtwork };
