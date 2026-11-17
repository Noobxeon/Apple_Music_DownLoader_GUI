<template>
  <div class="favorites-view">
    <div class="view-header">
      <div class="view-title-group">
        <h1>我的收藏夹</h1>
        <p>共收藏 {{ favSongs.length }} 首单曲 · {{ favAlbums.length }} 张专辑（本地持久化保存）</p>
      </div>

      <div style="display: flex; gap: 10px">
        <button
          v-if="favSongs.length > 0"
          class="btn btn-sm"
          @click="playTrack(favSongs[0], favSongs)"
        >
          <IconSymbol name="play" :size="13" /> 播放全部收藏单曲
        </button>
        <button
          v-if="store.favorites.length > 0"
          class="btn btn-sm btn-primary"
          @click="enqueueDownload(store.favorites)"
        >
          <IconSymbol name="download" :size="14" /> 一键下载全部收藏 ({{ store.favorites.length }})
        </button>
      </div>
    </div>

    <div v-if="store.favorites.length === 0" class="empty-state surface-card">
      <div class="empty-state-icon"><IconSymbol name="heart" :size="26" /></div>
      <h3>收藏夹还是空的</h3>
      <p>在【探索热榜】或【全能搜索】中点击心形图标，即可将心仪的单曲或专辑收纳至此。</p>
    </div>

    <template v-else>
      <div class="pill-tabs" style="margin-bottom: 18px">
        <button class="pill-tab" :class="{ active: tab === 'all' }" @click="tab = 'all'">
          全部 ({{ store.favorites.length }})
        </button>
        <button class="pill-tab" :class="{ active: tab === 'songs' }" @click="tab = 'songs'">
          单曲 ({{ favSongs.length }})
        </button>
        <button class="pill-tab" :class="{ active: tab === 'albums' }" @click="tab = 'albums'">
          专辑 ({{ favAlbums.length }})
        </button>
      </div>

      <div class="surface-card">
        <div class="track-head">
          <div style="flex: 3">标题</div>
          <div style="flex: 2">歌手</div>
          <div style="width: 80px">类型</div>
          <div style="width: 150px; text-align: right">操作</div>
        </div>

        <div v-for="item in displayedList" :key="item.id + item.url" class="track-row">
          <div
            style="flex: 3; display: flex; align-items: center; gap: 12px; min-width: 0; cursor: pointer"
            @click="item.type === '专辑' ? openAlbumDetail(item) : playTrack(item, favSongs)"
          >
            <img :src="item.cover || DEFAULT_COVER" style="width:40px;height:40px;border-radius:8px;object-fit:cover" alt="" />
            <span class="ellipsis" style="font-weight: 600">{{ item.title }}</span>
          </div>

          <div style="flex: 2; color: var(--text-secondary)" class="ellipsis">{{ item.artist }}</div>

          <div style="width: 80px">
            <span class="tag-badge neutral">{{ item.type }}</span>
          </div>

          <div style="width: 150px; display: flex; justify-content: flex-end; gap: 6px">
            <button
              v-if="item.type !== '专辑'"
              class="btn btn-icon btn-sm"
              @click="playTrack(item, favSongs)"
              title="试听"
            >
              <IconSymbol name="play" :size="13" />
            </button>
            <button class="btn btn-sm btn-primary" @click="enqueueDownload(item)">下载</button>
            <button class="btn btn-icon btn-sm btn-ghost" @click="toggleFavoriteItem(item)" title="取消收藏">
              <IconSymbol name="trash" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import IconSymbol from '../components/IconSymbol.vue';
import {
  store,
  DEFAULT_COVER,
  playTrack,
  enqueueDownload,
  openAlbumDetail,
  toggleFavoriteItem
} from '../store/appStore';

const tab = ref('all');

const favSongs = computed(() => store.favorites.filter(x => x.type !== '专辑'));
const favAlbums = computed(() => store.favorites.filter(x => x.type === '专辑'));

const displayedList = computed(() => {
  if (tab.value === 'songs') return favSongs.value;
  if (tab.value === 'albums') return favAlbums.value;
  return store.favorites;
});
</script>
