<template>
  <div v-if="store.tagModal.open" class="modal-backdrop" @click.self="close">
    <div class="modal-card" style="max-width: 640px">
      <div class="modal-header">
        <h3>无损音频流与内嵌元数据检验 (Mutagen)</h3>
        <button class="btn btn-icon btn-ghost" @click="close">
          <IconSymbol name="x" :size="18" />
        </button>
      </div>

      <div class="modal-body">
        <div v-if="store.tagModal.loading" class="empty-state">
          <p>正在解析媒体容器原子标签与音频流参数...</p>
        </div>

        <div v-else-if="info && info.ok" class="inspector-content">
          <div class="insp-top">
            <img :src="info.coverDataUrl || DEFAULT_COVER" class="insp-cover" alt="" />
            <div class="insp-summary">
              <div class="tag-badge accent" style="margin-bottom: 6px">
                {{ info.audio?.codec || info.ext?.toUpperCase() }}
              </div>
              <h4 style="margin: 0 0 4px; font-size: 17px">
                {{ info.tags?.title || info.fileName }}
              </h4>
              <div style="color: var(--text-secondary); font-size: 13px">
                {{ info.tags?.artist || '未知歌手' }} · {{ info.tags?.album || '未知专辑' }}
              </div>

              <div class="audio-specs">
                <span v-if="info.audio?.sampleRate" class="spec-chip">
                  {{ (info.audio.sampleRate / 1000).toFixed(1) }} kHz
                </span>
                <span v-if="info.audio?.bitsPerSample" class="spec-chip">
                  {{ info.audio.bitsPerSample }}-bit
                </span>
                <span v-if="info.audio?.bitrate" class="spec-chip">
                  {{ info.audio.bitrate }} kbps
                </span>
                <span v-if="info.audio?.channels" class="spec-chip">
                  {{ info.audio.channels }} 声道
                </span>
                <span class="spec-chip">{{ formatBytes(info.fileSize) }}</span>
              </div>
            </div>
          </div>

          <div class="kv-grid selectable">
            <div class="kv-item" v-if="info.tags?.albumArtist">
              <span class="kv-k">专辑艺人</span>
              <span class="kv-v">{{ info.tags.albumArtist }}</span>
            </div>
            <div class="kv-item" v-if="info.tags?.composer">
              <span class="kv-k">作曲</span>
              <span class="kv-v">{{ info.tags.composer }}</span>
            </div>
            <div class="kv-item" v-if="info.tags?.genre">
              <span class="kv-k">流派</span>
              <span class="kv-v">{{ info.tags.genre }}</span>
            </div>
            <div class="kv-item" v-if="info.tags?.date">
              <span class="kv-k">发行时间</span>
              <span class="kv-v">{{ info.tags.date }}</span>
            </div>
            <div class="kv-item" v-if="info.tags?.track">
              <span class="kv-k">音轨号</span>
              <span class="kv-v">{{ info.tags.track }}</span>
            </div>
            <div class="kv-item" v-if="info.tags?.copyright">
              <span class="kv-k">版权信息</span>
              <span class="kv-v">{{ info.tags.copyright }}</span>
            </div>
            <div class="kv-item full">
              <span class="kv-k">本地路径</span>
              <span class="kv-v">{{ info.filePath }}</span>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <p>{{ info?.error || '无法读取文件标签信息' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import IconSymbol from './IconSymbol.vue';
import { store, DEFAULT_COVER, formatBytes } from '../store/appStore';

const info = computed(() => store.tagModal.data);

function close() {
  store.tagModal.open = false;
}
</script>

<style scoped>
.insp-top {
  display: flex;
  gap: 18px;
  align-items: center;
  margin-bottom: 20px;
}

.insp-cover {
  width: 104px;
  height: 104px;
  border-radius: 12px;
  object-fit: cover;
  box-shadow: var(--shadow-md);
  flex-shrink: 0;
}

.audio-specs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.spec-chip {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.kv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  background: var(--bg-elevated);
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.kv-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kv-item.full {
  grid-column: 1 / -1;
}
.kv-k {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}
.kv-v {
  font-size: 12.5px;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
