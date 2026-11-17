<template>
  <div class="library-view">
    <div class="view-header">
      <div class="view-title-group">
        <h1>本地音乐库与无损格式转码</h1>
        <p>
          目录: {{ store.library.rootDir || store.config.downloadDir }} · 共 {{ store.library.items.length }} 个文件 ({{ formatBytes(store.library.totalSize) }})
        </p>
      </div>

      <div style="display: flex; gap: 8px; align-items: center">
        <!-- Format Converter Target -->
        <div class="converter-toolbar">
          <span style="font-size: 12px; color: var(--text-secondary)">转码目标:</span>
          <select v-model="convertTarget" class="select-control" style="height: 30px; padding: 0 8px">
            <option value="mp3">MP3 (320kbps)</option>
            <option value="flac">FLAC (无损压缩)</option>
            <option value="wav">WAV (PCM 无损)</option>
          </select>
          <button
            v-if="selectedPaths.size > 0"
            class="btn btn-sm btn-primary"
            :disabled="converting"
            @click="batchConvertSelected"
          >
            <IconSymbol name="repeat" :size="13" />
            <span>{{ converting ? '正在转码...' : `批量转码 (${selectedPaths.size})` }}</span>
          </button>
        </div>

        <button class="btn btn-sm" @click="scanLocalLibrary" :disabled="store.library.loading">
          <IconSymbol name="refresh" :size="13" /> 刷新扫描
        </button>
        <button class="btn btn-sm" @click="openFolder">
          <IconSymbol name="folder" :size="13" /> 打开目录
        </button>
      </div>
    </div>

    <div class="lib-filter-row" v-if="store.library.items.length > 0">
      <div class="pill-tabs">
        <button class="pill-tab" :class="{ active: mediaFilter === 'all' }" @click="mediaFilter = 'all'">
          全部 ({{ store.library.items.length }})
        </button>
        <button class="pill-tab" :class="{ active: mediaFilter === 'audio' }" @click="mediaFilter = 'audio'">
          音频曲目 ({{ audioItems.length }})
        </button>
        <button class="pill-tab" :class="{ active: mediaFilter === 'video' }" @click="mediaFilter = 'video'">
          MV 视频 ({{ videoItems.length }})
        </button>
      </div>

      <input
        v-model="keyword"
        type="text"
        class="input-control"
        style="width: 250px"
        placeholder="搜索本地歌名、歌手或专辑..."
      />
    </div>

    <div v-if="store.library.loading" class="empty-state">
      <p>正在扫描本地音频与歌词文件...</p>
    </div>

    <div v-else-if="store.library.items.length === 0" class="empty-state surface-card">
      <div class="empty-state-icon"><IconSymbol name="folder" :size="26" /></div>
      <h3>当前下载目录中暂无媒体文件</h3>
      <p>下载完成后的 .m4a / .mp4 曲目与 .lrc 歌词会自动展示在这里，支持原声播放、内嵌无损标签检验与格式转码。</p>
    </div>

    <div v-else class="surface-card">
      <div class="track-head">
        <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
        <div style="flex: 3">本地曲目</div>
        <div style="flex: 2">歌手 / 专辑</div>
        <div style="width: 115px">格式与歌词</div>
        <div style="width: 80px">大小</div>
        <div style="width: 185px; text-align: right">操作与转码</div>
      </div>

      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="track-row"
        :class="{ playing: store.player.currentTrack?.id === item.id }"
      >
        <input
          type="checkbox"
          :checked="selectedPaths.has(item.filePath)"
          @change="toggleSelect(item.filePath)"
        />

        <div style="flex: 3; display: flex; align-items: center; gap: 12px; min-width: 0">
          <img :src="item.cover || DEFAULT_COVER" style="width:40px;height:40px;border-radius:8px;object-fit:cover" alt="" />
          <div class="ellipsis">
            <div class="ellipsis" style="font-weight: 600" :title="item.fileName">{{ item.title }}</div>
            <div class="ellipsis" style="font-size: 11.5px; color: var(--text-muted)">{{ item.fileName }}</div>
          </div>
        </div>

        <div style="flex: 2; color: var(--text-secondary)" class="ellipsis">
          {{ item.artist }} · {{ item.album }}
        </div>

        <div style="width: 115px; display: flex; gap: 5px; align-items: center">
          <span class="tag-badge neutral">{{ item.ext }}</span>
          <span v-if="item.hasLyrics" class="tag-badge success">{{ item.lyricFormat }}</span>
        </div>

        <div style="width: 80px; font-size: 12px; color: var(--text-muted)">
          {{ formatBytes(item.size) }}
        </div>

        <div style="width: 185px; display: flex; justify-content: flex-end; gap: 6px">
          <button
            v-if="item.mediaKind === 'audio'"
            class="btn btn-icon btn-sm"
            @click="playLocal(item)"
            title="播放完整本地原声 (含同步歌词)"
          >
            <IconSymbol
              :name="store.player.currentTrack?.id === item.id && store.player.isPlaying ? 'pause' : 'play'"
              :size="13"
            />
          </button>

          <button
            class="btn btn-icon btn-sm"
            @click="openMediaTagInspector(item)"
            title="检验无损编码参数与内嵌元数据"
          >
            <IconSymbol name="info" :size="14" />
          </button>

          <button
            v-if="item.mediaKind === 'audio'"
            class="btn btn-sm"
            :disabled="convertingPath === item.filePath"
            @click="convertSingle(item)"
            :title="`使用 FFmpeg 转换为 ${convertTarget.toUpperCase()}`"
          >
            {{ convertingPath === item.filePath ? '...' : `转 ${convertTarget.toUpperCase()}` }}
          </button>

          <button
            class="btn btn-icon btn-sm btn-ghost"
            @click="revealFile(item.filePath)"
            title="在资源管理器中定位文件"
          >
            <IconSymbol name="folder" :size="14" />
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
  formatBytes,
  scanLocalLibrary,
  playTrack,
  openMediaTagInspector,
  notify
} from '../store/appStore';

const api = window.appleMusic || {};
const keyword = ref('');
const mediaFilter = ref('all');
const convertTarget = ref('mp3');
const converting = ref(false);
const convertingPath = ref('');
const selectedPaths = ref(new Set());

const audioItems = computed(() => store.library.items.filter(i => i.mediaKind === 'audio'));
const videoItems = computed(() => store.library.items.filter(i => i.mediaKind === 'video'));

const filteredItems = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return store.library.items.filter(i => {
    if (mediaFilter.value !== 'all' && i.mediaKind !== mediaFilter.value) return false;
    if (!q) return true;
    return (
      i.title.toLowerCase().includes(q) ||
      i.artist.toLowerCase().includes(q) ||
      i.album.toLowerCase().includes(q) ||
      i.fileName.toLowerCase().includes(q)
    );
  });
});

const allSelected = computed(
  () => filteredItems.value.length > 0 && filteredItems.value.every(i => selectedPaths.value.has(i.filePath))
);

function toggleSelect(fp) {
  const next = new Set(selectedPaths.value);
  if (next.has(fp)) next.delete(fp);
  else next.add(fp);
  selectedPaths.value = next;
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedPaths.value = new Set();
  } else {
    selectedPaths.value = new Set(filteredItems.value.map(i => i.filePath));
  }
}

function playLocal(item) {
  playTrack(item, audioItems.value);
  if (item.hasLyrics) {
    store.player.showLyrics = true;
  }
}

async function convertSingle(item) {
  convertingPath.value = item.filePath;
  try {
    const res = await api.convertAudio({
      filePath: item.filePath,
      targetFormat: convertTarget.value
    });
    notify(`转码完成: 已生成 ${res.format} 文件`, 'success');
    await scanLocalLibrary();
  } catch (err) {
    notify(err.message || '转码失败', 'danger', 4500);
  } finally {
    convertingPath.value = '';
  }
}

async function batchConvertSelected() {
  const paths = [...selectedPaths.value];
  if (!paths.length) return;
  converting.value = true;
  let okCount = 0;
  try {
    for (const fp of paths) {
      await api.convertAudio({ filePath: fp, targetFormat: convertTarget.value });
      okCount++;
    }
    notify(`批量转码完成 (${okCount}/${paths.length})`, 'success');
    selectedPaths.value = new Set();
    await scanLocalLibrary();
  } catch (err) {
    notify(err.message || '转码中断', 'danger', 4500);
  } finally {
    converting.value = false;
  }
}

function openFolder() {
  api.openFolder?.(store.library.rootDir || store.config.downloadDir);
}

function revealFile(fp) {
  api.showItemInFolder?.(fp);
}
</script>

<style scoped>
.converter-toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}

.lib-filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}
</style>
