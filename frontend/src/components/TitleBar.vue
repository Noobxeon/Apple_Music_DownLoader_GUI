<template>
  <header class="titlebar">
    <!-- Left Brand -->
    <div class="titlebar-brand" @click="store.activeView = 'discover'">
      <div class="brand-logo">
        <IconSymbol name="music" :size="15" />
      </div>
      <div class="brand-text">
        <span class="brand-name">Apple Music</span>
        <span class="brand-edition">STUDIO</span>
      </div>
    </div>

    <!-- Center Global Search + Storefront -->
    <div class="titlebar-center no-drag">
      <div class="global-search-bar">
        <select
          class="storefront-pill"
          :value="store.config.country"
          @change="onStorefrontChange"
          title="切换 Apple Music 搜索与榜单地区"
        >
          <option v-for="sf in STOREFRONTS" :key="sf.code" :value="sf.code">
            {{ sf.short }} · {{ sf.label }}
          </option>
        </select>

        <div class="search-divider"></div>

        <IconSymbol name="search" :size="15" class="search-icon" />
        <input
          ref="searchInputRef"
          v-model="store.search.keyword"
          type="text"
          placeholder="搜索歌曲、专辑、MV、歌手，或粘贴 Apple Music 链接 (Ctrl+K)"
          @keyup.enter="onSearchSubmit"
        />
        <button
          v-if="store.search.keyword"
          class="clear-input-btn"
          @click="store.search.keyword = ''"
          title="清空"
        >
          <IconSymbol name="x" :size="13" />
        </button>
        <button class="search-go-btn" :disabled="store.search.loading" @click="onSearchSubmit">
          {{ store.search.loading ? '检索中' : '搜索' }}
        </button>
      </div>
    </div>

    <!-- Right Quick Actions + Window Controls -->
    <div class="titlebar-right no-drag">
      <!-- Auth Status Pill -->
      <button
        class="auth-pill"
        :class="{ valid: store.env.cookie.valid, expired: store.env.cookie.expired }"
        @click="store.authModalOpen = true"
        title="管理 Apple Music 登录凭证与 Cookie"
      >
        <span class="status-dot"></span>
        <span>{{ authLabel }}</span>
      </button>

      <!-- Queue Shortcut -->
      <button
        class="top-icon-btn"
        :class="{ 'has-active': activeDownloadCount > 0 }"
        @click="store.activeView = 'downloads'"
        title="打开下载任务中心"
      >
        <IconSymbol name="download" :size="16" />
        <span v-if="activeDownloadCount > 0" class="mini-counter">{{ activeDownloadCount }}</span>
      </button>

      <!-- Theme Toggle -->
      <button
        class="top-icon-btn"
        @click="toggleTheme"
        :title="store.config.theme === 'dark' ? '切换为浅色外观' : '切换为深色外观'"
      >
        <IconSymbol :name="store.config.theme === 'dark' ? 'sun' : 'moon'" :size="16" />
      </button>

      <div class="win-divider"></div>

      <!-- Frameless Window Controls -->
      <div class="win-controls">
        <button class="win-btn" @click="minimize" title="最小化">
          <IconSymbol name="minus" :size="14" />
        </button>
        <button class="win-btn" @click="maximize" :title="store.isMaximized ? '向下还原' : '最大化'">
          <IconSymbol name="square" :size="12" />
        </button>
        <button class="win-btn close" @click="closeWin" title="关闭">
          <IconSymbol name="x" :size="15" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import IconSymbol from './IconSymbol.vue';
import {
  store,
  STOREFRONTS,
  activeDownloadCount,
  updateConfig,
  toggleTheme,
  loadTopCharts,
  performSearch
} from '../store/appStore';

const searchInputRef = ref(null);
const api = window.appleMusic || {};

const authLabel = computed(() => {
  if (store.env.cookie.valid) return '已认证';
  if (store.env.cookie.expired) return '凭证过期';
  return '登录凭证';
});

async function onStorefrontChange(e) {
  const nextCountry = e.target.value;
  await updateConfig({ country: nextCountry });
  loadTopCharts(nextCountry);
  if (store.activeView === 'search' && store.search.keyword.trim()) {
    performSearch();
  }
}

function onSearchSubmit() {
  if (!store.search.keyword.trim()) return;
  performSearch();
}

function minimize() {
  if (api.minimizeWindow) api.minimizeWindow();
}
function maximize() {
  if (api.toggleMaximizeWindow) api.toggleMaximizeWindow();
}
function closeWin() {
  if (api.closeWindow) api.closeWindow();
}

function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown));
</script>

<style scoped>
.titlebar {
  height: 58px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0 18px;
  -webkit-app-region: drag;
  flex-shrink: 0;
  z-index: 100;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.titlebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 202px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.brand-logo {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--accent-gradient);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(250, 36, 60, 0.35);
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.brand-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.2px;
}

.brand-edition {
  font-size: 10px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  letter-spacing: 0.6px;
}

.titlebar-center {
  flex: 1;
  max-width: 620px;
  padding: 0 16px;
}

.global-search-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 11px;
  padding: 0 4px 0 8px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.global-search-bar:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.storefront-pill {
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 4px;
  cursor: pointer;
  outline: none;
}

.storefront-pill option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.search-divider {
  width: 1px;
  height: 16px;
  background: var(--border-strong);
  margin: 0 8px;
}

.search-icon {
  color: var(--text-muted);
  margin-right: 7px;
}

.global-search-bar input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.global-search-bar input::placeholder {
  color: var(--text-muted);
}

.clear-input-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}
.clear-input-btn:hover {
  color: var(--text-primary);
}

.search-go-btn {
  height: 28px;
  padding: 0 13px;
  border-radius: 8px;
  border: none;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  margin-left: 4px;
}
.search-go-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.titlebar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.auth-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border-radius: 99px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.16s ease;
}
.auth-pill:hover {
  border-color: var(--border-strong);
}
.auth-pill .status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warning);
}
.auth-pill.valid .status-dot {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}
.auth-pill.expired .status-dot {
  background: var(--danger);
}

.top-icon-btn {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: 0.15s ease;
}
.top-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.top-icon-btn.has-active {
  color: var(--accent);
  background: var(--accent-soft);
}
.mini-counter {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 99px;
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.win-divider {
  width: 1px;
  height: 20px;
  background: var(--border-subtle);
  margin: 0 4px;
}

.win-controls {
  display: flex;
  height: 100%;
}

.win-btn {
  width: 44px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.win-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.win-btn.close:hover {
  background: #e81123;
  color: #fff;
}
</style>
