<template>
  <aside class="sidebar">
    <div class="sidebar-scroll">
      <div class="nav-section">
        <div class="nav-section-title">在线探索</div>
        <button
          class="nav-item"
          :class="{ active: store.activeView === 'discover' }"
          @click="store.activeView = 'discover'"
        >
          <IconSymbol name="compass" :size="17" />
          <span>探索热榜</span>
        </button>

        <button
          class="nav-item"
          :class="{ active: store.activeView === 'search' }"
          @click="store.activeView = 'search'"
        >
          <IconSymbol name="search" :size="17" />
          <span>全能搜索</span>
        </button>

        <button
          class="nav-item"
          :class="{ active: store.activeView === 'parser' }"
          @click="store.activeView = 'parser'"
        >
          <IconSymbol name="link" :size="17" />
          <span>链接解析与批量</span>
        </button>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">传输与曲库</div>
        <button
          class="nav-item"
          :class="{ active: store.activeView === 'downloads' }"
          @click="store.activeView = 'downloads'"
        >
          <IconSymbol name="download" :size="17" />
          <span>任务中心</span>
          <span v-if="activeDownloadCount > 0" class="nav-badge accent">{{ activeDownloadCount }}</span>
        </button>

        <button
          class="nav-item"
          :class="{ active: store.activeView === 'favorites' }"
          @click="store.activeView = 'favorites'"
        >
          <IconSymbol name="heart" :size="17" />
          <span>我的收藏</span>
          <span v-if="store.favorites.length > 0" class="nav-badge">{{ store.favorites.length }}</span>
        </button>

        <button
          class="nav-item"
          :class="{ active: store.activeView === 'library' }"
          @click="goLibrary"
        >
          <IconSymbol name="folder" :size="17" />
          <span>本地音乐与转码</span>
        </button>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">工作站系统</div>
        <button
          class="nav-item"
          :class="{ active: store.activeView === 'settings' }"
          @click="store.activeView = 'settings'"
        >
          <IconSymbol name="settings" :size="17" />
          <span>设置与环境诊断</span>
        </button>
      </div>
    </div>

    <!-- Bottom Engine Status Card -->
    <div class="sidebar-footer">
      <div class="engine-card" @click="openDoctor" title="点击打开环境诊断中心">
        <div class="engine-row">
          <span class="engine-dot" :class="{ ok: store.env.gamdl.installed }"></span>
          <span class="engine-name">
            {{ store.env.gamdl.installed ? `gamdl ${store.env.gamdl.version || '就绪'}` : '未检测到 gamdl' }}
          </span>
        </div>
        <div class="engine-meta">
          <span>编码: {{ (store.config.songCodec || 'aac-web').toUpperCase() }}</span>
          <span>并发: {{ store.config.maxConcurrent }}x</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import IconSymbol from './IconSymbol.vue';
import { store, activeDownloadCount, scanLocalLibrary } from '../store/appStore';

function goLibrary() {
  store.activeView = 'library';
  scanLocalLibrary();
}

function openDoctor() {
  store.activeView = 'settings';
  store.settingsTab = 'doctor';
}
</script>

<style scoped>
.sidebar {
  width: 224px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 12px 14px;
  flex-shrink: 0;
}

.sidebar-scroll {
  overflow-y: auto;
  flex: 1;
}

.nav-section {
  margin-bottom: 20px;
}

.nav-section-title {
  padding: 0 12px;
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  height: 38px;
  padding: 0 12px;
  margin-bottom: 3px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--bg-active);
  color: var(--accent);
}

.nav-badge {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 99px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.nav-badge.accent {
  background: var(--accent);
  color: #fff;
}

.sidebar-footer {
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  margin-bottom: 76px; /* Room when bottom player is visible */
}

.engine-card {
  padding: 10px 12px;
  border-radius: 11px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: border-color 0.16s ease;
}
.engine-card:hover {
  border-color: var(--border-strong);
}

.engine-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.engine-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}
.engine-dot.ok {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.engine-name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
}

.engine-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
