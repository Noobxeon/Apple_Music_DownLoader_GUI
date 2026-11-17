<template>
  <div class="discover-view">
    <!-- Studio Hero Banner -->
    <section class="hero-banner">
      <div class="hero-content">
        <div class="hero-eyebrow">
          <IconSymbol name="sparkles" :size="14" />
          <span>APPLE MUSIC LIVE CHARTS · {{ currentRegionLabel }}</span>
        </div>
        <h1>探索全球实时热歌与无损专辑</h1>
        <p>
          实时同步 Apple Music 官方热门榜单。支持一键试听预览、查看专辑完整曲目、批量加入并发无损下载队列。
        </p>
        <div class="hero-actions">
          <button
            class="btn btn-primary"
            :disabled="store.charts.songs.length === 0"
            @click="playTrack(store.charts.songs[0], store.charts.songs)"
          >
            <IconSymbol name="play" :size="15" />
            <span>播放热歌榜试听</span>
          </button>

          <button
            class="btn"
            :disabled="store.charts.songs.length === 0"
            @click="downloadTop10"
          >
            <IconSymbol name="download" :size="15" />
            <span>一键下载热榜 Top 10</span>
          </button>

          <button class="btn btn-ghost" :disabled="store.charts.loading" @click="loadTopCharts()">
            <IconSymbol name="refresh" :size="14" />
            <span>{{ store.charts.loading ? '刷新中...' : '刷新榜单' }}</span>
          </button>
        </div>
      </div>

      <div v-if="featuredAlbum" class="hero-featured" @click="openAlbumDetail(featuredAlbum)">
        <img :src="featuredAlbum.cover || DEFAULT_COVER" alt="" />
        <div class="hf-meta">
          <span class="tag-badge accent">#1 冠军专辑</span>
          <div class="hf-title ellipsis">{{ featuredAlbum.title }}</div>
          <div class="hf-artist ellipsis">{{ featuredAlbum.artist }}</div>
        </div>
      </div>
    </section>

    <!-- Chart Mode Switch + Quick Region Pills -->
    <div class="discover-toolbar">
      <div class="pill-tabs">
        <button class="pill-tab" :class="{ active: chartTab === 'songs' }" @click="chartTab = 'songs'">
          <IconSymbol name="music" :size="14" />
          <span>热歌榜 Top {{ store.charts.songs.length || 50 }}</span>
        </button>
        <button class="pill-tab" :class="{ active: chartTab === 'albums' }" @click="chartTab = 'albums'">
          <IconSymbol name="disc" :size="14" />
          <span>热门专辑 Top {{ store.charts.albums.length || 25 }}</span>
        </button>
      </div>

      <div class="region-chips">
        <button
          v-for="sf in STOREFRONTS.slice(0, 6)"
          :key="sf.code"
          class="region-chip"
          :class="{ active: store.config.country === sf.code }"
          @click="switchRegion(sf.code)"
        >
          {{ sf.short }}
        </button>
      </div>
    </div>

    <div v-if="store.charts.loading" class="empty-state">
      <p>正在同步 Apple Music {{ currentRegionLabel }} 实时流行榜单...</p>
    </div>

    <div v-else-if="store.charts.error" class="empty-state">
      <h3>榜单获取失败</h3>
      <p>{{ store.charts.error }}</p>
      <button class="btn btn-sm" style="margin-top: 12px" @click="loadTopCharts()">重试</button>
    </div>

    <!-- Top Songs Table -->
    <div v-else-if="chartTab === 'songs'" class="surface-card">
      <div class="track-head">
        <div style="width: 38px">排名</div>
        <div style="flex: 3">歌曲</div>
        <div style="flex: 2">歌手</div>
        <div style="flex: 1.5">流派 / 发行</div>
        <div style="width: 138px; text-align: right">操作</div>
      </div>

      <div
        v-for="song in store.charts.songs"
        :key="song.id"
        class="track-row"
        :class="{ playing: store.player.currentTrack?.id === song.id }"
      >
        <div class="rank-num" :class="{ top3: song.rank <= 3 }">
          {{ song.rank }}
        </div>

        <div style="flex: 3; display: flex; align-items: center; gap: 12px; min-width: 0">
          <img :src="song.cover || DEFAULT_COVER" class="row-thumb" alt="" />
          <div class="ellipsis">
            <div style="display: flex; align-items: center; gap: 6px">
              <span class="ellipsis" style="font-weight: 600">{{ song.title }}</span>
              <span v-if="song.explicit" class="explicit-chip">E</span>
            </div>
          </div>
        </div>

        <div
          style="flex: 2; color: var(--text-secondary); cursor: pointer"
          class="ellipsis hover-link"
          @click="song.artistId && openArtistDetail({ id: song.artistId, artistId: song.artistId, title: song.artist, artist: song.artist })"
        >
          {{ song.artist }}
        </div>

        <div style="flex: 1.5; color: var(--text-muted); font-size: 12px" class="ellipsis">
          {{ song.album }} · {{ song.releaseDate }}
        </div>

        <div style="width: 138px; display: flex; justify-content: flex-end; gap: 6px">
          <button class="btn btn-icon btn-sm" @click="playTrack(song, store.charts.songs)" title="试听">
            <IconSymbol
              :name="store.player.currentTrack?.id === song.id && store.player.isPlaying ? 'pause' : 'play'"
              :size="13"
            />
          </button>
          <button
            class="btn btn-icon btn-sm btn-ghost"
            :style="{ color: isFavorite(song) ? 'var(--accent)' : '' }"
            @click="toggleFavoriteItem(song)"
            title="收藏"
          >
            <IconSymbol name="heart" :size="14" :filled="isFavorite(song)" />
          </button>
          <button class="btn btn-sm btn-primary" @click="enqueueDownload(song)">
            下载
          </button>
        </div>
      </div>
    </div>

    <!-- Top Albums Grid -->
    <div v-else class="media-grid">
      <div
        v-for="alb in store.charts.albums"
        :key="alb.id"
        class="media-card"
        @click="openAlbumDetail(alb)"
      >
        <div class="media-cover-wrap">
          <img :src="alb.cover || DEFAULT_COVER" alt="" />
          <span class="album-rank-badge">#{{ alb.rank }}</span>
          <div class="media-cover-overlay">
            <button class="btn btn-sm btn-primary" @click.stop="enqueueDownload(alb)">
              <IconSymbol name="download" :size="13" /> 整张下载
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
        <div class="media-card-sub ellipsis">{{ alb.artist }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import IconSymbol from '../components/IconSymbol.vue';
import {
  store,
  STOREFRONTS,
  DEFAULT_COVER,
  updateConfig,
  loadTopCharts,
  playTrack,
  enqueueDownload,
  openAlbumDetail,
  openArtistDetail,
  isFavorite,
  toggleFavoriteItem
} from '../store/appStore';

const chartTab = ref('songs');

const currentRegionLabel = computed(() => {
  const f = STOREFRONTS.find(s => s.code === store.config.country);
  return f ? `${f.label} (${f.short})` : store.config.country.toUpperCase();
});

const featuredAlbum = computed(() => store.charts.albums[0] || null);

async function switchRegion(code) {
  await updateConfig({ country: code });
  loadTopCharts(code);
}

function downloadTop10() {
  enqueueDownload(store.charts.songs.slice(0, 10));
}
</script>

<style scoped>
.hero-banner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 30px;
  border-radius: 20px;
  background: radial-gradient(circle at top right, rgba(250, 36, 60, 0.24), transparent 58%),
              var(--bg-surface);
  border: 1px solid var(--border-subtle);
  margin-bottom: 24px;
  overflow: hidden;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.8px;
  color: var(--accent);
  margin-bottom: 8px;
}

.hero-content h1 {
  margin: 0 0 8px;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: -0.4px;
}

.hero-content p {
  margin: 0 0 18px;
  color: var(--text-secondary);
  max-width: 520px;
  font-size: 13.5px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-featured {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px 12px 12px;
  border-radius: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  width: 280px;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.2s ease;
}
.hero-featured:hover {
  transform: translateY(-3px);
}
.hero-featured img {
  width: 76px;
  height: 76px;
  border-radius: 10px;
  object-fit: cover;
}
.hf-meta {
  min-width: 0;
  flex: 1;
}
.hf-title {
  font-weight: 700;
  font-size: 14px;
  margin-top: 6px;
}
.hf-artist {
  font-size: 12px;
  color: var(--text-secondary);
}

.discover-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 12px;
}

.region-chips {
  display: flex;
  gap: 6px;
}
.region-chip {
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.15s ease;
}
.region-chip:hover {
  color: var(--text-primary);
}
.region-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.rank-num {
  width: 38px;
  font-weight: 800;
  font-size: 14px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.rank-num.top3 {
  color: var(--accent);
  font-size: 15px;
}

.row-thumb {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.hover-link:hover {
  color: var(--accent) !important;
  text-decoration: underline;
}

.album-rank-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(12, 13, 18, 0.8);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}
</style>
