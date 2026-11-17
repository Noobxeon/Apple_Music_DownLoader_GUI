<template>
  <div class="studio-shell">
    <TitleBar />

    <div class="studio-body">
      <Sidebar />

      <main class="studio-main">
        <DiscoverView v-if="store.activeView === 'discover'" />
        <SearchView v-else-if="store.activeView === 'search'" />
        <UrlParserView v-else-if="store.activeView === 'parser'" />
        <DownloadsView v-else-if="store.activeView === 'downloads'" />
        <FavoritesView v-else-if="store.activeView === 'favorites'" />
        <LocalLibraryView v-else-if="store.activeView === 'library'" />
        <SettingsView v-else-if="store.activeView === 'settings'" />
      </main>
    </div>

    <PlayerBar />
    <DetailModal />
    <CookieAuthModal />
    <TaskLogModal />
    <TagInspectorModal />
    <ToastContainer />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { store, initApp } from './store/appStore';

import TitleBar from './components/TitleBar.vue';
import Sidebar from './components/Sidebar.vue';
import PlayerBar from './components/PlayerBar.vue';
import DetailModal from './components/DetailModal.vue';
import CookieAuthModal from './components/CookieAuthModal.vue';
import TaskLogModal from './components/TaskLogModal.vue';
import TagInspectorModal from './components/TagInspectorModal.vue';
import ToastContainer from './components/ToastContainer.vue';

import DiscoverView from './views/DiscoverView.vue';
import SearchView from './views/SearchView.vue';
import UrlParserView from './views/UrlParserView.vue';
import DownloadsView from './views/DownloadsView.vue';
import FavoritesView from './views/FavoritesView.vue';
import LocalLibraryView from './views/LocalLibraryView.vue';
import SettingsView from './views/SettingsView.vue';

onMounted(() => {
  initApp();
});
</script>
