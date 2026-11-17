<template>
  <div class="search-view">
    <div class="view-header">
      <div class="view-title-group">
        <h1>全能多源检索</h1>
        <p v-if="store.search.keyword">
          关键词「{{ store.search.keyword }}」· 共检索到
          {{ store.search.songs.length }} 首单曲、{{ store.search.albums.length }} 张专辑、{{ store.search.videos.length }} 部 MV、{{ store.search.artists.length }} 位歌手
        </p>
        <p v-else>支持按单曲、专辑、MV 音乐视频、歌手多维度检索，支持多选批量下载</p>
      </div>

      <!-- Batch Action Toolbar -->
      <div v-if="selectedSongIds.size > 0" class="batch-bar">
        <span class="tag-badge accent">已选 {{ selectedSongIds.size }} 首</span>
        <button class="btn btn-sm btn-primary" @click="downloadSelected">
          <IconSymbol name="download" :size="13" /> 批量下载选中项
        </button>
        <button class="btn btn-sm btn-ghost" @click="selectedSongIds = new Set()">取消选择</button>
      </div>
    </div>

    <!-- Direct Link Recognized Card -->
    <div v-if="store.search.directItem" class="direct-match-card surface-card">
      <div class="dm-left">
        <img :src="store.search.directItem.cover || DEFAULT_COVER" alt="" />
        <div>
          <span class="tag-badge accent">Apple Music 直链已识别 · {{ store.search.directItem.type }}</span>
          <h3>{{ store.search.directItem.title }}</h3>
          <p>{{ store.search.directItem.artist }} · {{ store.search.directItem.url }}</p>
        </div>
      </div>
      <div class="dm-actions">
        <button class="btn btn-primary" @click="enqueueDownload(store.search.directItem)">
          <IconSymbol name="download" :size="15" /> 立即加入下载队列
        </button>
      </div>
    </div>

    <!-- Category Tabs + Quick Filter -->
    <div v-if="hasAnyResults" class="search-toolbar">
      <div class="pill-tabs">
        <button class="pill-tab" :class="{ active: store.search.tab === 'songs' }" @click="store.search.tab = 'songs'">
          <IconSymbol name="music" :size="14" /> 单曲 ({{ store.search.songs.length }})
        </button>
        <button class="pill-tab" :class="{ active: store.search.tab === 'albums' }" @click="store.search.tab = 'albums'">
          <IconSymbol name="disc" :size="14" /> 专辑 ({{ store.search.albums.length }})
        </button>
        <button class="pill-tab" :class="{ active: store.search.tab === 'videos' }" @click="store.search.tab = 'videos'">
          <IconSymbol name="video" :size="14" /> MV 视频 ({{ store.search.videos.length }})
        </button>
        <button class="pill-tab" :class="{ active: store.search.tab === 'artists' }" @click="store.search.tab = 'artists'">
          <IconSymbol name="user" :size="14" /> 歌手 ({{ store.search.artists.length }})
        </button>
      </div>

      <input
        v-model="localFilter"
        type="text"
        class="input-control"
        style="width: 220px"
        placeholder="在当前结果中二次筛选..."
      />
    </div>

    <div v-if="store.search.loading" class="empty-state">
      <p>正在并行检索单曲、专辑、MV 与艺人目录...</p>
    </div>

    <div v-else-if="store.search.error" class="empty-state">
      <h3>搜索遇到问题</h3>
      <p>{{ store.search.error }}</p>
    </div>

    <div v-else-if="!hasAnyResults" class="empty-state surface-card">
      <div class="empty-state-icon"><IconSymbol name="search" :size="26" /></div>
      <h3>输入关键词开始探索 Apple Music 曲库</h3>
      <p>在顶部搜索框（快捷键 Ctrl+K）输入歌名、专辑名、艺人，或直接粘贴 Apple Music 网页链接。</p>
    </div>

    <!-- Tab 1: Songs -->
    <div v-else-if="store.search.tab === 'songs'" class="surface-card">
      <div class="track-head">
        <input type="checkbox" :checked="isAllSongsSelected" @change="toggleSelectAllSongs" />
        <div style="flex: 3">曲目名称</div>
        <div style="flex: 2">歌手</div>
        <div style="flex: 2">所属专辑</div>
        <div style="width: 60px">时长</div>
        <div style="width: 140px; text-align: right">操作</div>
      </div>

      <div
        v-for="item in filteredSongs"
        :key="item.id"
        class="track-row"
        :class="{ playing: store.player.currentTrack?.id === item.id }"
      >
        <input
          type="checkbox"
          :checked="selectedSongIds.has(item.id)"
          @change="toggleSongSelect(item.id)"
        />

        <div style="flex: 3; display: flex; align-items: center; gap: 12px; min-width: 0">
          <img :src="item.cover || DEFAULT_COVER" class="row-thumb" alt="" />
          <div class="ellipsis" style="display: flex; align-items: center; gap: 6px">
            <span class="ellipsis" style="font-weight: 600" :title="item.title">{{ item.title }}</span>
            <span v-if="item.explicit" class="explicit-chip">E</span>
          </div>
        </div>

        <div
          style="flex: 2; color: var(--text-secondary); cursor: pointer"
          class="ellipsis hover-link"
          @click="item.artistId && openArtistDetail({ id: item.artistId, artistId: item.artistId, title: item.artist, artist: item.artist, cover: item.cover })"
        >
          {{ item.artist }}
        </div>

        <div
          style="flex: 2; color: var(--text-muted); cursor: pointer"
          class="ellipsis hover-link"
          @click="item.collectionId && openAlbumDetail({ id: item.collectionId, collectionId: item.collectionId, title: item.album, artist: item.artist, cover: item.cover })"
        >
          {{ item.album }}
        </div>

        <div style="width: 60px; color: var(--text-muted); font-size: 12px">
          {{ formatDuration(item.durationMs) }}
        </div>

        <div style="width: 140px; display: flex; justify-content: flex-end; gap: 6px">
          <button class="btn btn-icon btn-sm" @click="playTrack(item, filteredSongs)" title="试听 30s 片段">
            <IconSymbol
              :name="store.player.currentTrack?.id === item.id && store.player.isPlaying ? 'pause' : 'play'"
              :size="13"
            />
          </button>
          <button
            class="btn btn-icon btn-sm btn-ghost"
            :style="{ color: isFavorite(item) ? 'var(--accent)' : '' }"
            @click="toggleFavoriteItem(item)"
            title="收藏"
          >
            <IconSymbol name="heart" :size="14" :filled="isFavorite(item)" />
          </button>
          <button class="btn btn-sm btn-primary" @click="enqueueDownload(item)">下载</button>
        </div>
      </div>
    </div>

    <!-- Tab 2: Albums -->
    <div v-else-if="store.search.tab === 'albums'" class="media-grid">
      <div
        v-for="alb in filteredAlbums"
        :key="alb.id"
        class="media-card"
        @click="openAlbumDetail(alb)"
      >
        <div class="media-cover-wrap">
          <img :src="alb.cover || DEFAULT_COVER" alt="" />
          <div class="media-cover-overlay">
            <button class="btn btn-sm btn-primary" @click.stop="enqueueDownload(alb)">
              <IconSymbol name="download" :size="13" /> 下载专辑
            </button>
            <button
              class="btn btn-icon btn-sm"
              style="background: rgba(20,22,30,0.85); color: #fff; border:none"
              @click.stop="toggleFavoriteItem(alb)"
            >
              <IconSymbol name="heart" :size="14" :filled="isFavorite(alb)" />
            </button>
          </div>
        </div>
        <div class="media-card-title ellipsis" :title="alb.title">{{ alb.title }}</div>
        <div class="media-card-sub ellipsis">
          {{ alb.artist }} <span v-if="alb.trackCount">· {{ alb.trackCount }} 首</span>
        </div>
      </div>
    </div>

    <!-- Tab 3: Music Videos -->
    <div v-else-if="store.search.tab === 'videos'" class="media-grid mv-grid">
      <div v-for="mv in filteredVideos" :key="mv.id" class="media-card">
        <div class="media-cover-wrap video-ratio">
          <img :src="mv.cover || DEFAULT_COVER" alt="" />
          <div class="media-cover-overlay" style="opacity: 1; background: linear-gradient(to top, rgba(0,0,0,0.78), transparent 55%)">
            <span class="tag-badge accent">MV · {{ formatDuration(mv.durationMs) }}</span>
            <div style="display: flex; gap: 6px">
              <button v-if="mv.previewUrl" class="btn btn-icon btn-sm" @click="playTrack(mv, filteredVideos)" title="预览音轨">
                <IconSymbol name="play" :size="13" />
              </button>
              <button class="btn btn-sm btn-primary" @click="enqueueDownload(mv)">
                <IconSymbol name="download" :size="13" /> 下载视频
              </button>
            </div>
          </div>
        </div>
        <div class="media-card-title ellipsis" :title="mv.title">{{ mv.title }}</div>
        <div class="media-card-sub ellipsis">{{ mv.artist }} · {{ mv.releaseDate }}</div>
      </div>
    </div>

    <!-- Tab 4: Artists -->
    <div v-else-if="store.search.tab === 'artists'" class="media-grid">
      <div
        v-for="ar in filteredArtists"
        :key="ar.id"
        class="media-card artist-card"
        @click="openArtistDetail(ar)"
      >
        <div class="artist-avatar-wrap">
          <img v-if="ar.cover" :src="ar.cover" alt="" />
          <IconSymbol v-else name="user" :size="36" />
        </div>
        <div class="media-card-title ellipsis">{{ ar.title }}</div>
        <div class="media-card-sub ellipsis">{{ ar.genre }}</div>
        <button class="btn btn-sm" style="margin-top: 10px; width: 100%" @click.stop="openArtistDetail(ar)">
          浏览作品集
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import IconSymbol from '../components/IconSymbol.vue';
import {
  store,
  DEFAULT_COVER,
  formatDuration,
  playTrack,
  enqueueDownload,
  openAlbumDetail,
  openArtistDetail,
  isFavorite,
  toggleFavoriteItem
} from '../store/appStore';

const localFilter = ref('');
const selectedSongIds = ref(new Set());

watch(
  () => store.search.songs,
  () => {
    selectedSongIds.value = new Set();
    localFilter.value = '';
  }
);

const hasAnyResults = computed(
  () =>
    store.search.songs.length > 0 ||
    store.search.albums.length > 0 ||
    store.search.videos.length > 0 ||
    store.search.artists.length > 0
);

function matchQuery(item) {
  const q = localFilter.value.trim().toLowerCase();
  if (!q) return true;
  return (
    (item.title || '').toLowerCase().includes(q) ||
    (item.artist || '').toLowerCase().includes(q) ||
    (item.album || '').toLowerCase().includes(q)
  );
}

const filteredSongs = computed(() => store.search.songs.filter(matchQuery));
const filteredAlbums = computed(() => store.search.albums.filter(matchQuery));
const filteredVideos = computed(() => store.search.videos.filter(matchQuery));
const filteredArtists = computed(() => store.search.artists.filter(matchQuery));

const isAllSongsSelected = computed(
  () => filteredSongs.value.length > 0 && filteredSongs.value.every(s => selectedSongIds.value.has(s.id))
);

function toggleSongSelect(id) {
  const next = new Set(selectedSongIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedSongIds.value = next;
}

function toggleSelectAllSongs() {
  if (isAllSongsSelected.value) {
    selectedSongIds.value = new Set();
  } else {
    selectedSongIds.value = new Set(filteredSongs.value.map(s => s.id));
  }
}

function downloadSelected() {
  const picked = store.search.songs.filter(s => selectedSongIds.value.has(s.id));
  enqueueDownload(picked);
  selectedSongIds.value = new Set();
}
</script>

<style scoped>
.search-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
}

.direct-match-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  margin-bottom: 20px;
  border-color: rgba(250, 36, 60, 0.35);
}
.dm-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.dm-left img {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  object-fit: cover;
}
.dm-left h3 {
  margin: 4px 0 2px;
  font-size: 16px;
}
.dm-left p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.row-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.hover-link:hover {
  color: var(--accent) !important;
  text-decoration: underline;
}

.mv-grid {
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}

.artist-card {
  text-align: center;
}

.artist-avatar-wrap {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  margin: 6px auto 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.artist-avatar-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
