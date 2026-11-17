<template>
  <div v-if="modal.open" class="modal-backdrop" @click.self="close">
    <div class="modal-card detail-modal">
      <div class="modal-header">
        <div class="detail-hero" v-if="modal.header">
          <img :src="modal.header.cover || DEFAULT_COVER" class="detail-cover" alt="" />
          <div class="detail-meta">
            <div class="detail-type-row">
              <span class="tag-badge accent">{{ modal.mode === 'album' ? '专辑曲目详情' : '艺人精选主页' }}</span>
              <span v-if="modal.header.genre" class="tag-badge neutral">{{ modal.header.genre }}</span>
              <span v-if="modal.header.releaseDate" class="tag-badge neutral">{{ modal.header.releaseDate }}</span>
            </div>
            <h2 class="ellipsis" :title="modal.header.title">{{ modal.header.title }}</h2>
            <p class="detail-artist">{{ modal.header.artist }}</p>

            <div class="detail-actions">
              <button
                v-if="modal.header.url"
                class="btn btn-primary btn-sm"
                @click="downloadWholeHeader"
              >
                <IconSymbol name="download" :size="14" />
                <span>{{ modal.mode === 'album' ? '下载整张专辑' : '按歌手策略自动下载' }}</span>
              </button>

              <button
                v-if="selectedIds.size > 0"
                class="btn btn-sm"
                @click="downloadSelectedTracks"
              >
                <IconSymbol name="check" :size="14" />
                <span>下载已勾选 ({{ selectedIds.size }})</span>
              </button>

              <button
                v-if="modal.tracks.length > 0"
                class="btn btn-sm"
                @click="playTrack(modal.tracks[0], modal.tracks)"
              >
                <IconSymbol name="play" :size="13" />
                <span>全部试听</span>
              </button>

              <button
                v-if="modal.header.url"
                class="btn btn-sm btn-ghost"
                @click="toggleFavoriteItem(modal.header)"
              >
                <IconSymbol name="heart" :size="14" :filled="isFavorite(modal.header)" />
                <span>{{ isFavorite(modal.header) ? '已收藏' : '收藏' }}</span>
              </button>
            </div>
          </div>
        </div>
        <button class="btn btn-icon btn-ghost" @click="close">
          <IconSymbol name="x" :size="18" />
        </button>
      </div>

      <div class="modal-body" style="padding: 0">
        <div v-if="modal.loading" class="empty-state">
          <p>正在从 Apple Music 加载完整曲目列表...</p>
        </div>

        <template v-else>
          <!-- Sub-tabs when viewing Artist (Top Songs vs Albums) -->
          <div v-if="modal.mode === 'artist' && modal.albums.length > 0" class="artist-subbar">
            <div class="pill-tabs">
              <button class="pill-tab" :class="{ active: artistSubTab === 'songs' }" @click="artistSubTab = 'songs'">
                热门单曲 ({{ modal.tracks.length }})
              </button>
              <button class="pill-tab" :class="{ active: artistSubTab === 'albums' }" @click="artistSubTab = 'albums'">
                代表专辑 ({{ modal.albums.length }})
              </button>
            </div>
          </div>

          <!-- Artist Albums Grid -->
          <div
            v-if="modal.mode === 'artist' && artistSubTab === 'albums'"
            class="media-grid"
            style="padding: 18px 22px"
          >
            <div
              v-for="alb in modal.albums"
              :key="alb.id"
              class="media-card"
              @click="openAlbumDetail(alb)"
            >
              <div class="media-cover-wrap">
                <img :src="alb.cover || DEFAULT_COVER" alt="" />
                <div class="media-cover-overlay">
                  <button class="btn btn-primary btn-sm" @click.stop="enqueueDownload(alb)">
                    <IconSymbol name="download" :size="13" /> 下载专辑
                  </button>
                </div>
              </div>
              <div class="media-card-title ellipsis">{{ alb.title }}</div>
              <div class="media-card-sub ellipsis">{{ alb.releaseDate || alb.artist }}</div>
            </div>
          </div>

          <!-- Tracklist Table -->
          <div v-else-if="modal.tracks.length > 0">
            <div class="track-head">
              <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
              <div style="width: 34px">#</div>
              <div style="flex: 3">曲目名称</div>
              <div style="flex: 2" v-if="modal.mode === 'artist'">专辑</div>
              <div style="width: 64px">时长</div>
              <div style="width: 110px; text-align: right">操作</div>
            </div>

            <div
              v-for="(t, idx) in modal.tracks"
              :key="t.id"
              class="track-row"
              :class="{ playing: store.player.currentTrack?.id === t.id }"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(t.id)"
                @change="toggleSelect(t.id)"
              />
              <div style="width: 34px; color: var(--text-muted); font-size: 12px">
                {{ t.trackNumber || idx + 1 }}
              </div>
              <div style="flex: 3; display: flex; align-items: center; gap: 8px; min-width: 0">
                <span class="ellipsis" style="font-weight: 600">{{ t.title }}</span>
                <span v-if="t.explicit" class="explicit-chip">E</span>
              </div>
              <div v-if="modal.mode === 'artist'" style="flex: 2; color: var(--text-secondary)" class="ellipsis">
                {{ t.album }}
              </div>
              <div style="width: 64px; color: var(--text-muted); font-size: 12px">
                {{ formatDuration(t.durationMs) }}
              </div>
              <div style="width: 110px; display: flex; justify-content: flex-end; gap: 6px">
                <button class="btn btn-icon btn-sm" @click="playTrack(t, modal.tracks)" title="试听">
                  <IconSymbol
                    :name="store.player.currentTrack?.id === t.id && store.player.isPlaying ? 'pause' : 'play'"
                    :size="13"
                  />
                </button>
                <button class="btn btn-sm" @click="enqueueDownload(t)" title="单曲下载">
                  <IconSymbol name="download" :size="13" />
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <p>暂无曲目明细，可直接点击上方“下载”按钮交由内核解析。</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import IconSymbol from './IconSymbol.vue';
import {
  store,
  DEFAULT_COVER,
  formatDuration,
  playTrack,
  enqueueDownload,
  openAlbumDetail,
  isFavorite,
  toggleFavoriteItem
} from '../store/appStore';

const modal = computed(() => store.detailModal);
const selectedIds = ref(new Set());
const artistSubTab = ref('songs');

watch(
  () => modal.value.header,
  () => {
    selectedIds.value = new Set();
    artistSubTab.value = 'songs';
  }
);

const isAllSelected = computed(
  () => modal.value.tracks.length > 0 && selectedIds.value.size === modal.value.tracks.length
);

function toggleSelect(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(modal.value.tracks.map(t => t.id));
  }
}

function downloadWholeHeader() {
  if (modal.value.header) {
    enqueueDownload(modal.value.header);
  }
}

function downloadSelectedTracks() {
  const picked = modal.value.tracks.filter(t => selectedIds.value.has(t.id));
  enqueueDownload(picked);
}

function close() {
  store.detailModal.open = false;
}
</script>

<style scoped>
.detail-modal {
  max-width: 820px;
}

.detail-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
  flex: 1;
}

.detail-cover {
  width: 96px;
  height: 96px;
  border-radius: 12px;
  object-fit: cover;
  box-shadow: var(--shadow-md);
  flex-shrink: 0;
}

.detail-meta {
  min-width: 0;
  flex: 1;
}

.detail-type-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.detail-meta h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
}

.detail-artist {
  margin: 3px 0 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.artist-subbar {
  padding: 12px 22px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
</style>
