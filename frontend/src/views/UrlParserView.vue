<template>
  <div class="parser-view">
    <div class="view-header">
      <div class="view-title-group">
        <h1>智能链接解析与批量导入</h1>
        <p>支持单曲、专辑、歌单 (Playlist)、MV、艺人主页链接预解析选曲，或导入多行链接 / TXT 清单</p>
      </div>

      <div class="pill-tabs">
        <button class="pill-tab" :class="{ active: mode === 'single' }" @click="mode = 'single'">
          单链深度解析
        </button>
        <button class="pill-tab" :class="{ active: mode === 'batch' }" @click="mode = 'batch'">
          批量多链 / TXT 导入
        </button>
      </div>
    </div>

    <!-- Mode 1: Smart Single URL Inspector -->
    <div v-if="mode === 'single'">
      <div class="surface-card parser-box">
        <div class="url-input-bar">
          <IconSymbol name="link" :size="18" style="color: var(--accent)" />
          <input
            v-model="singleUrl"
            type="text"
            class="input-control"
            style="flex: 1; height: 42px; font-size: 14px"
            placeholder="粘贴 Apple Music 链接，例如 https://music.apple.com/cn/album/..."
            @keyup.enter="analyzeUrl"
          />
          <button class="btn" @click="pasteFromClipboard">粘贴</button>
          <button class="btn btn-primary" style="height: 42px; padding: 0 22px" :disabled="parsing" @click="analyzeUrl">
            {{ parsing ? '正在解析...' : '智能解析' }}
          </button>
        </div>

        <!-- Per-task Override Options -->
        <div class="override-bar">
          <div class="ov-item">
            <span>本次音质覆盖:</span>
            <select v-model="overrideCodec" class="select-control">
              <option value="">跟随全局设置 ({{ store.config.songCodec.toUpperCase() }})</option>
              <option value="aac-web">AAC-Web (256kbps 稳定推荐)</option>
              <option value="aac">AAC (标准)</option>
              <option value="alac">ALAC (无损音质)</option>
              <option value="atmos">Dolby Atmos (杜比全景声)</option>
            </select>
          </div>

          <label class="ov-check">
            <input type="checkbox" v-model="lyricsOnly" />
            <span>仅下载同步歌词 (--synced-lyrics-only)</span>
          </label>
        </div>
      </div>

      <!-- Parsed Preview Result -->
      <div v-if="parsedResult" class="surface-card parsed-preview" style="margin-top: 20px">
        <div class="pp-header">
          <img :src="parsedResult.item.cover || DEFAULT_COVER" class="pp-cover" alt="" />
          <div class="pp-meta">
            <div style="display: flex; gap: 6px; margin-bottom: 6px">
              <span class="tag-badge accent">{{ parsedResult.item.type }}</span>
              <span class="tag-badge neutral">区域: {{ parsedResult.storefront.toUpperCase() }}</span>
              <span v-if="parsedResult.tracks.length" class="tag-badge info">共 {{ parsedResult.tracks.length }} 首曲目</span>
            </div>
            <h2>{{ parsedResult.item.title }}</h2>
            <p>{{ parsedResult.item.artist }}</p>

            <div style="display: flex; gap: 10px; margin-top: 12px">
              <button class="btn btn-primary" @click="downloadParsedMain">
                <IconSymbol name="download" :size="15" />
                <span>下载整个{{ parsedResult.item.type }}</span>
              </button>
              <button
                v-if="checkedTrackIds.size > 0"
                class="btn"
                @click="downloadCheckedTracks"
              >
                下载已勾选单曲 ({{ checkedTrackIds.size }})
              </button>
            </div>
          </div>
        </div>

        <div v-if="parsedResult.tracks && parsedResult.tracks.length > 0" class="pp-tracks">
          <div class="track-head">
            <input type="checkbox" :checked="allChecked" @change="toggleAllParsed" />
            <div style="width: 36px">#</div>
            <div style="flex: 3">曲目名称</div>
            <div style="width: 70px">时长</div>
            <div style="width: 90px; text-align: right">试听</div>
          </div>

          <div v-for="(t, i) in parsedResult.tracks" :key="t.id" class="track-row">
            <input type="checkbox" :checked="checkedTrackIds.has(t.id)" @change="toggleParsedTrack(t.id)" />
            <div style="width: 36px; color: var(--text-muted)">{{ t.trackNumber || i + 1 }}</div>
            <div style="flex: 3; font-weight: 600" class="ellipsis">{{ t.title }}</div>
            <div style="width: 70px; color: var(--text-muted); font-size: 12px">{{ formatDuration(t.durationMs) }}</div>
            <div style="width: 90px; text-align: right">
              <button class="btn btn-icon btn-sm" @click="playTrack(t, parsedResult.tracks)">
                <IconSymbol
                  :name="store.player.currentTrack?.id === t.id && store.player.isPlaying ? 'pause' : 'play'"
                  :size="13"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mode 2: Batch Multi-URL & TXT Import -->
    <div v-else class="surface-card parser-box">
      <div class="batch-header">
        <div>
          <h3 style="margin: 0 0 4px">批量链接队列导入</h3>
          <p style="margin: 0; font-size: 12.5px; color: var(--text-secondary)">
            每行输入一个 Apple Music 链接（支持混合粘贴单曲、专辑、歌单、MV），自动去重并按并发策略排队下载。
          </p>
        </div>
        <button class="btn btn-sm" @click="importTxtFile">
          <IconSymbol name="folder" :size="14" /> 从 .txt 文件导入
        </button>
      </div>

      <textarea
        v-model="batchText"
        rows="10"
        class="textarea-control"
        style="width: 100%; font-family: Consolas, monospace; margin: 14px 0"
        placeholder="https://music.apple.com/cn/album/...&#10;https://music.apple.com/us/playlist/...&#10;https://music.apple.com/jp/music-video/..."
      ></textarea>

      <div class="batch-footer">
        <span style="color: var(--text-secondary); font-size: 13px">
          已识别有效链接: <b style="color: var(--accent)">{{ validBatchUrls.length }}</b> 条
        </span>
        <div style="display: flex; gap: 10px">
          <button class="btn btn-ghost" @click="batchText = ''">清空</button>
          <button
            class="btn btn-primary"
            :disabled="validBatchUrls.length === 0"
            @click="submitBatchUrls"
          >
            <IconSymbol name="download" :size="15" />
            <span>全部加入下载队列 ({{ validBatchUrls.length }})</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import IconSymbol from '../components/IconSymbol.vue';
import {
  store,
  DEFAULT_COVER,
  formatDuration,
  playTrack,
  enqueueDownload,
  notify
} from '../store/appStore';

const api = window.appleMusic || {};
const mode = ref('single');
const singleUrl = ref('');
const parsing = ref(false);
const parsedResult = ref(null);
const checkedTrackIds = ref(new Set());
const overrideCodec = ref('');
const lyricsOnly = ref(false);
const batchText = ref('');

const validBatchUrls = computed(() => {
  const seen = new Set();
  return batchText.value
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#') && s.includes('music.apple.com'))
    .filter(s => (seen.has(s) ? false : seen.add(s)));
});

const allChecked = computed(
  () =>
    parsedResult.value?.tracks?.length > 0 &&
    checkedTrackIds.value.size === parsedResult.value.tracks.length
);

async function pasteFromClipboard() {
  if (navigator.clipboard) {
    const txt = await navigator.clipboard.readText();
    if (txt) singleUrl.value = txt.trim();
  }
}

async function analyzeUrl() {
  const u = singleUrl.value.trim();
  if (!u) return;
  parsing.value = true;
  try {
    const res = await api.parseAppleUrl({ url: u, country: store.config.country });
    parsedResult.value = res;
    checkedTrackIds.value = new Set((res.tracks || []).map(t => t.id));
  } catch (err) {
    notify(err.message || '链接解析失败，请确认是有效的 music.apple.com 链接', 'danger');
  } finally {
    parsing.value = false;
  }
}

function toggleParsedTrack(id) {
  const next = new Set(checkedTrackIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  checkedTrackIds.value = next;
}

function toggleAllParsed() {
  if (allChecked.value) {
    checkedTrackIds.value = new Set();
  } else {
    checkedTrackIds.value = new Set((parsedResult.value?.tracks || []).map(t => t.id));
  }
}

function getOverrides() {
  const ov = {};
  if (overrideCodec.value) ov.codec = overrideCodec.value;
  if (lyricsOnly.value) ov.lyricsOnly = true;
  return ov;
}

function downloadParsedMain() {
  if (!parsedResult.value?.item) return;
  enqueueDownload(parsedResult.value.item, getOverrides());
}

function downloadCheckedTracks() {
  const tracks = (parsedResult.value?.tracks || []).filter(t => checkedTrackIds.value.has(t.id));
  enqueueDownload(tracks, getOverrides());
}

async function importTxtFile() {
  const filePath = await api.selectFile({
    title: '选择包含 Apple Music 链接的 TXT 文件',
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  if (!filePath) return;
  // Read via fetch on local-media protocol
  try {
    const resp = await fetch(`local-media://stream?path=${encodeURIComponent(filePath)}`);
    const txt = await resp.text();
    batchText.value = (batchText.value ? batchText.value + '\n' : '') + txt;
    notify('已导入 TXT 链接清单', 'success');
  } catch (e) {
    notify('读取 TXT 文件失败', 'danger');
  }
}

function submitBatchUrls() {
  const items = validBatchUrls.value.map(url => {
    const slug = decodeURIComponent(url.split('/').filter(Boolean).slice(-2, -1)[0] || url.split('/').pop() || '链接项目').replace(/-/g, ' ');
    return {
      title: slug,
      artist: '批量直链队列',
      type: url.includes('/playlist/') ? '歌单' : (url.includes('/album/') && !url.includes('?i=') ? '专辑' : '直链'),
      url
    };
  });
  enqueueDownload(items, getOverrides());
  batchText.value = '';
  store.activeView = 'downloads';
}
</script>

<style scoped>
.parser-box {
  padding: 22px;
}

.url-input-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.override-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  font-size: 13px;
  color: var(--text-secondary);
}

.ov-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ov-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.parsed-preview {
  overflow: hidden;
}

.pp-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 22px;
  border-bottom: 1px solid var(--border-subtle);
}

.pp-cover {
  width: 112px;
  height: 112px;
  border-radius: 14px;
  object-fit: cover;
  box-shadow: var(--shadow-md);
}

.pp-meta h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.pp-meta p {
  margin: 0;
  color: var(--text-secondary);
}

.batch-header,
.batch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
</style>
