<template>
  <div v-if="track" class="player-wrapper">
    <!-- Expandable Synchronized Lyrics Drawer -->
    <transition name="lyrics-slide">
      <div v-if="store.player.showLyrics" class="lyrics-drawer">
        <div class="lyrics-drawer-header">
          <div class="lyr-track-meta">
            <img :src="track.cover || DEFAULT_COVER" alt="" />
            <div>
              <div class="lyr-title">{{ track.title }}</div>
              <div class="lyr-artist">
                {{ track.artist }}
                <span v-if="store.player.lyrics.format" class="tag-badge accent" style="margin-left:6px">
                  {{ store.player.lyrics.format }}
                </span>
              </div>
            </div>
          </div>
          <button class="btn btn-icon btn-ghost" @click="store.player.showLyrics = false">
            <IconSymbol name="x" :size="18" />
          </button>
        </div>

        <div ref="lyricsScrollRef" class="lyrics-body">
          <template v-if="store.player.lyrics.synced && store.player.lyrics.synced.length > 0">
            <div
              v-for="(line, idx) in store.player.lyrics.synced"
              :key="idx"
              :ref="el => setLineRef(el, idx)"
              class="lyric-line"
              :class="{ active: idx === activeLyricIndex }"
              @click="seekAudio(line.time)"
            >
              {{ line.text }}
            </div>
          </template>
          <template v-else-if="store.player.lyrics.raw">
            <pre class="lyric-raw selectable">{{ store.player.lyrics.raw }}</pre>
          </template>
          <div v-else class="empty-state" style="padding:40px 20px">
            <div class="empty-state-icon"><IconSymbol name="lyrics" :size="24" /></div>
            <h3>暂无本地同步歌词</h3>
            <p>播放【本地音乐库】中附带 .lrc 同步歌词的歌曲时，此处将自动逐行高亮滚动。</p>
          </div>
        </div>
      </div>
    </transition>

    <!-- Bottom Glassmorphic Player Bar -->
    <footer class="player-bar">
      <!-- Left: Artwork + Track Info -->
      <div class="p-info">
        <img :src="track.cover || DEFAULT_COVER" class="p-cover" alt="" />
        <div class="p-meta ellipsis">
          <div class="p-title-row">
            <span class="p-title ellipsis" :title="track.title">{{ track.title }}</span>
            <span class="source-pill" :class="{ local: Boolean(track.streamUrl) }">
              {{ track.streamUrl ? (track.ext || '本地原声') : '30s 试听' }}
            </span>
          </div>
          <div class="p-artist ellipsis">{{ track.artist }}</div>
        </div>
        <button
          v-if="!track.streamUrl"
          class="btn btn-icon btn-ghost"
          :style="{ color: isFavorite(track) ? 'var(--accent)' : '' }"
          @click="toggleFavoriteItem(track)"
          title="收藏/取消收藏"
        >
          <IconSymbol name="heart" :size="15" :filled="isFavorite(track)" />
        </button>
      </div>

      <!-- Center: Transport Controls + Scrubber -->
      <div class="p-center">
        <div class="p-controls">
          <button
            class="ctrl-btn sm"
            @click="cycleRepeatMode"
            :title="repeatLabel"
            :class="{ active: store.player.repeatMode !== 'list' }"
          >
            <IconSymbol name="repeat" :size="14" />
            <span v-if="store.player.repeatMode === 'one'" class="repeat-sub">1</span>
            <span v-else-if="store.player.repeatMode === 'shuffle'" class="repeat-sub">S</span>
          </button>

          <button class="ctrl-btn" @click="playPrev" title="上一首">
            <IconSymbol name="skip-back" :size="17" />
          </button>

          <button class="play-main-btn" @click="togglePlay" :title="store.player.isPlaying ? '暂停' : '播放'">
            <IconSymbol :name="store.player.isPlaying ? 'pause' : 'play'" :size="18" />
          </button>

          <button class="ctrl-btn" @click="playNext" title="下一首">
            <IconSymbol name="skip-forward" :size="17" />
          </button>

          <button
            class="ctrl-btn sm"
            :class="{ active: store.player.showLyrics }"
            @click="store.player.showLyrics = !store.player.showLyrics"
            title="展开/收起同步歌词面板"
          >
            <IconSymbol name="lyrics" :size="15" />
          </button>
        </div>

        <div class="p-scrubber">
          <span class="time-txt">{{ formatDuration(store.player.currentTime, true) }}</span>
          <input
            type="range"
            min="0"
            :max="store.player.duration || 30"
            step="0.1"
            :value="store.player.currentTime"
            @input="e => seekAudio(e.target.value)"
          />
          <span class="time-txt">{{ formatDuration(store.player.duration, true) }}</span>
        </div>
      </div>

      <!-- Right: Download Shortcut + Volume -->
      <div class="p-right">
        <button
          v-if="!track.streamUrl && track.url"
          class="btn btn-sm btn-primary"
          @click="enqueueDownload(track)"
          title="下载完整无损/高品质音频"
        >
          <IconSymbol name="download" :size="13" />
          <span>下载完整版</span>
        </button>

        <button class="ctrl-btn sm" @click="toggleMute" :title="store.player.muted ? '取消静音' : '静音'">
          <IconSymbol :name="store.player.muted || store.player.volume === 0 ? 'volume-x' : 'volume'" :size="16" />
        </button>

        <input
          class="vol-slider"
          type="range"
          min="0"
          max="1"
          step="0.02"
          :value="store.player.muted ? 0 : store.player.volume"
          @input="e => setVolume(e.target.value)"
        />
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import IconSymbol from './IconSymbol.vue';
import {
  store,
  DEFAULT_COVER,
  activeLyricIndex,
  formatDuration,
  togglePlay,
  playPrev,
  playNext,
  seekAudio,
  setVolume,
  toggleMute,
  cycleRepeatMode,
  isFavorite,
  toggleFavoriteItem,
  enqueueDownload
} from '../store/appStore';

const track = computed(() => store.player.currentTrack);
const lyricsScrollRef = ref(null);
const lineRefs = ref({});

function setLineRef(el, idx) {
  if (el) lineRefs.value[idx] = el;
}

watch(activeLyricIndex, (idx) => {
  if (!store.player.showLyrics || idx < 0) return;
  const el = lineRefs.value[idx];
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

const repeatLabel = computed(() => {
  if (store.player.repeatMode === 'one') return '单曲循环';
  if (store.player.repeatMode === 'shuffle') return '随机播放';
  return '列表循环';
});
</script>

<style scoped>
.player-wrapper {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 500;
}

.player-bar {
  height: 76px;
  background: var(--bg-glass);
  backdrop-filter: blur(24px) saturate(180%);
  border-top: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  gap: 20px;
}

.p-info {
  width: 290px;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.p-cover {
  width: 48px;
  height: 48px;
  border-radius: 9px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-elevated);
  box-shadow: var(--shadow-sm);
}

.p-meta {
  flex: 1;
  min-width: 0;
}

.p-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.p-title {
  font-weight: 700;
  font-size: 13.5px;
}

.source-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  flex-shrink: 0;
}
.source-pill.local {
  background: var(--success-soft);
  color: var(--success);
}

.p-artist {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.p-center {
  flex: 1;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.p-controls {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ctrl-btn {
  position: relative;
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  padding: 5px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.15s ease;
}
.ctrl-btn.sm {
  color: var(--text-secondary);
}
.ctrl-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ctrl-btn.active {
  color: var(--accent);
}
.repeat-sub {
  position: absolute;
  bottom: 1px;
  right: 1px;
  font-size: 8px;
  font-weight: 800;
}

.play-main-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--accent-gradient);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(250, 36, 60, 0.36);
  transition: transform 0.15s ease;
}
.play-main-btn:hover {
  transform: scale(1.06);
}

.p-scrubber {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}
.time-txt {
  font-size: 11px;
  color: var(--text-muted);
  width: 36px;
  font-variant-numeric: tabular-nums;
}
.time-txt:first-child {
  text-align: right;
}
.p-scrubber input[type="range"],
.vol-slider {
  flex: 1;
  height: 4px;
  accent-color: var(--accent);
  cursor: pointer;
}

.p-right {
  width: 260px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.vol-slider {
  max-width: 88px;
}

/* Lyrics Drawer */
.lyrics-drawer {
  position: fixed;
  right: 24px;
  bottom: 88px;
  width: 420px;
  height: 470px;
  background: var(--bg-glass);
  backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid var(--border-strong);
  border-radius: 20px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.lyrics-drawer-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lyr-track-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lyr-track-meta img {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  object-fit: cover;
}
.lyr-title {
  font-weight: 700;
  font-size: 13.5px;
}
.lyr-artist {
  font-size: 12px;
  color: var(--text-secondary);
}

.lyrics-body {
  flex: 1;
  overflow-y: auto;
  padding: 22px 24px;
}

.lyric-line {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.22s ease;
  line-height: 1.6;
}
.lyric-line:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}
.lyric-line.active {
  color: var(--accent);
  font-size: 17px;
  font-weight: 800;
  transform: scale(1.02);
  transform-origin: left center;
}

.lyric-raw {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.lyrics-slide-enter-active,
.lyrics-slide-leave-active {
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}
.lyrics-slide-enter-from,
.lyrics-slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.97);
}
</style>
