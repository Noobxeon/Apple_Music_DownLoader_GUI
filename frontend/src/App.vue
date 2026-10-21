<template>
  <div id="app">
    <!-- 顶部导航栏 -->
    <div class="header">
      <div class="header-left">
        <h1 @click="currentNav = 'search'">🎵 Apple Music 下载器</h1>
        
        <!-- 地区选择器与搜索框 -->
        <div class="search-box">
          <select v-model="config.country" @change="saveConfig" class="country-select" title="选择搜索地区 (Storefront)">
            <option value="cn">🇨🇳 中国 (CN)</option>
            <option value="us">🇺🇸 美国 (US)</option>
            <option value="jp">🇯🇵 日本 (JP)</option>
            <option value="hk">🇭🇰 香港 (HK)</option>
            <option value="tw">🇹🇼 台湾 (TW)</option>
            <option value="gb">🇬🇧 英国 (GB)</option>
          </select>
          <input 
            v-model="keyword" 
            @keyup.enter="handleSearchOrDirectDownload" 
            placeholder="输入歌手、歌曲、专辑名，或直接粘贴 Apple Music 链接..." 
          />
          <button @click="handleSearchOrDirectDownload" :disabled="isSearching" class="search-btn">
            {{ isSearching ? '搜索中...' : '搜索' }}
          </button>
        </div>
      </div>

      <div class="header-right">
        <button class="status-btn" :class="{ active: cookieReady }" @click="handleLogin" :disabled="isLoading">
          {{ isLoading ? '🔄 登录中...' : (cookieReady ? '✅ 凭证就绪 (点击刷新)' : '🔑 登录 Apple Music') }}
        </button>
        <button class="icon-btn highlight" @click="showDownloads = true">
          📥 下载列表 <span v-if="activeTasksCount > 0">({{ activeTasksCount }})</span>
        </button>
        <button class="icon-btn" @click="showSettings = true">⚙️ 设置</button>
      </div>
    </div>

    <!-- 主界面布局 -->
    <div class="main-layout" v-if="!isChecking">
      <!-- 左侧边栏 -->
      <div class="sidebar">
        <div class="sidebar-group">
          <h3>导航</h3>
          <ul>
            <li :class="{ active: currentNav === 'search' }" @click="currentNav = 'search'">
              🔍 搜索发现
            </li>
            <li :class="{ active: currentNav === 'direct' }" @click="currentNav = 'direct'">
              🔗 直链下载
            </li>
            <li :class="{ active: currentNav === 'settings' }" @click="showSettings = true">
              ⚙️ 参数设置
            </li>
          </ul>
        </div>

        <div class="sidebar-footer">
          <div class="engine-badge" :class="{ ready: gamdlStatus.installed }">
            <span class="dot"></span>
            <span>{{ gamdlStatus.installed ? (gamdlStatus.version || 'gamdl 内核就绪') : '未检测到 gamdl' }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧主内容区 -->
      <div class="content">
        <!-- 视图 1: 搜索发现 -->
        <div v-if="currentNav === 'search'">
          <div class="search-info" v-if="searchStatus">{{ searchStatus }}</div>
          
          <div class="tabs" v-if="results.length > 0">
            <div class="tab" :class="{ active: tab === 'song' }" @click="tab = 'song'">
              🎵 单曲 ({{ filteredSongs.length }})
            </div>
            <div class="tab" :class="{ active: tab === 'album' }" @click="tab = 'album'">
              💿 专辑 ({{ filteredAlbums.length }})
            </div>
            <div class="tab" v-if="filteredDirect.length > 0" :class="{ active: tab === 'direct' }" @click="tab = 'direct'">
              🔗 直链项目 ({{ filteredDirect.length }})
            </div>
          </div>

          <!-- 单曲列表 -->
          <div class="list-view" v-if="tab === 'song' && filteredSongs.length > 0">
            <div class="list-head">
              <div class="c-tt">歌曲名称</div>
              <div class="c-ar">歌手</div>
              <div class="c-al">所属专辑</div>
              <div class="c-pl">试听</div>
              <div class="c-dl">操作</div>
            </div>
            <div class="list-row" v-for="item in filteredSongs" :key="item.id">
              <div class="c-tt">
                <img :src="item.cover || defaultCover" />
                <span class="ellipsis" :title="item.title">{{ item.title }}</span>
              </div>
              <div class="c-ar ellipsis" :title="item.artist">{{ item.artist }}</div>
              <div class="c-al ellipsis" :title="item.album">{{ item.album }}</div>
              <div class="c-pl">
                <button class="btn-sm" @click="play(item)" :disabled="!item.previewUrl" :title="item.previewUrl ? '播放试听片段' : '无试听片段'">
                  {{ curSong?.id === item.id && isPlaying ? '⏸' : '▶️' }}
                </button>
              </div>
              <div class="c-dl">
                <button class="btn-dl" @click="download(item)">下载</button>
              </div>
            </div>
          </div>

          <!-- 专辑网格 -->
          <div class="grid-view" v-if="tab === 'album' && filteredAlbums.length > 0">
            <div class="album-card" v-for="item in filteredAlbums" :key="item.id">
              <div class="cover-container">
                <img :src="item.cover || defaultCover" />
                <div class="overlay">
                  <button @click="download(item)">📥 下载整张专辑</button>
                </div>
              </div>
              <div class="card-info">
                <div class="card-tt ellipsis" :title="item.title">{{ item.title }}</div>
                <div class="card-ar ellipsis" :title="item.artist">{{ item.artist }}</div>
              </div>
            </div>
          </div>

          <!-- 直链识别结果 -->
          <div class="direct-results" v-if="tab === 'direct' && filteredDirect.length > 0">
            <div class="direct-card" v-for="item in filteredDirect" :key="item.id">
              <div class="direct-info">
                <h3>🔗 {{ item.title }}</h3>
                <p>{{ item.artist }} | {{ item.url }}</p>
              </div>
              <button class="btn-dl" @click="download(item)">立即下载</button>
            </div>
          </div>

          <!-- 空白欢迎状态 -->
          <div class="welcome-box" v-if="results.length === 0 && !isSearching">
            <div class="welcome-icon">🎧</div>
            <h2>欢迎使用 Apple Music 下载器</h2>
            <p>在上方搜索框输入歌曲名、歌手，或直接粘贴 Apple Music 网页链接开始体验高品质音频下载。</p>
            <div class="quick-tips">
              <span>💡 提示：在右上角设置中可切换音质编码 (AAC / ALAC / Atmos) 与歌词格式。</span>
            </div>
          </div>
        </div>

        <!-- 视图 2: 批量链接直下 -->
        <div v-if="currentNav === 'direct'" class="direct-download-view">
          <h2>🔗 批量链接直链下载</h2>
          <p class="section-desc">支持输入单曲、专辑、歌单或音乐视频链接（每行一个）：</p>
          <textarea 
            v-model="batchUrlsText" 
            placeholder="例如:&#10;https://music.apple.com/cn/album/song-name/123456789&#10;https://music.apple.com/us/playlist/todays-hits/pl.xxxxx"
            rows="8"
            class="batch-textarea"
          ></textarea>
          <div class="direct-actions">
            <button class="btn-dl primary" @click="handleBatchDownload" :disabled="!batchUrlsText.trim()">
              🚀 全部加入下载队列
            </button>
            <button class="btn-sm" @click="batchUrlsText = ''">清空输入</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部音乐播放器 -->
    <div class="player" v-if="curSong">
      <div class="p-left">
        <img :src="curSong.cover || defaultCover" />
        <div class="ellipsis">
          <b>{{ curSong.title }}</b><br>
          <span>{{ curSong.artist }}</span>
        </div>
      </div>
      <div class="p-mid">
        <button class="p-ctrl" @click="togglePlay">{{ isPlaying ? '⏸' : '▶️' }}</button>
        <div class="p-bar">
          <span>{{ fmt(curTime) }}</span>
          <input type="range" min="0" :max="duration || 100" step="0.1" v-model="curTime" @input="seek" />
          <span>{{ fmt(duration) }}</span>
        </div>
      </div>
      <div class="p-right">
        <span>🔊</span>
        <input type="range" min="0" max="1" step="0.01" v-model="vol" @input="vChange" />
      </div>
    </div>
    <audio ref="audio" :src="curUrl" @timeupdate="curTime = $refs.audio.currentTime" @loadedmetadata="duration = $refs.audio.duration" @ended="isPlaying = false"></audio>

    <!-- 下载任务侧边抽屉 -->
    <div class="modal-overlay" v-if="showDownloads" @click.self="showDownloads = false">
      <div class="download-panel">
        <div class="panel-header">
          <h3>📥 下载任务列表 ({{ tasks.length }})</h3>
          <div class="panel-header-actions">
            <button class="text-btn" @click="clearFinishedTasks" v-if="hasFinishedTasks">清空已完成</button>
            <span class="close-btn" @click="showDownloads = false">✖</span>
          </div>
        </div>
        <div class="task-list">
          <div v-if="tasks.length === 0" class="empty-hint">暂无下载任务</div>
          <div class="task-card" v-for="t in tasks" :key="t.id">
            <div class="task-main">
              <div class="task-tt ellipsis" :title="t.title">{{ t.title }}</div>
              <div class="task-st">
                <span v-if="t.status === 'downloading'" class="badge blue">⏳ {{ t.prog || '分析解析中...' }}</span>
                <span v-else-if="t.status === 'success'" class="badge green">✅ 下载完成</span>
                <span v-else class="badge red" :title="t.msg">❌ {{ t.msg || '错误' }}</span>
              </div>
            </div>
            <div class="task-actions">
              <button v-if="t.status === 'downloading'" class="cancel-btn" @click="cancelTask(t)">⏹ 终止</button>
              <button v-if="t.status === 'error'" class="retry-btn" @click="retryTask(t)">🔁 重试</button>
              <button class="open-btn" @click="openDir(t.saveDir)" title="打开文件所在目录">📁</button>
              <button class="remove-btn" @click="removeTask(t.id)" v-if="t.status !== 'downloading'">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 设置模态窗口 -->
    <div class="modal-overlay" v-if="showSettings" @click.self="showSettings = false">
      <div class="settings-modal">
        <div class="settings-header">
          <h3>⚙️ 下载与核心参数设置</h3>
          <span class="close-btn" @click="showSettings = false">✖</span>
        </div>
        
        <div class="settings-body">
          <div class="form-group">
            <label>默认下载目录</label>
            <div class="path-input-row">
              <input type="text" v-model="config.downloadDir" readonly />
              <button class="btn-sm" @click="selectDownloadDir">浏览目录</button>
              <button class="btn-sm" @click="openDir(config.downloadDir)">打开</button>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>默认搜索地区 (Storefront)</label>
              <select v-model="config.country" class="form-select">
                <option value="cn">🇨🇳 中国 (CN)</option>
                <option value="us">🇺🇸 美国 (US)</option>
                <option value="jp">🇯🇵 日本 (JP)</option>
                <option value="hk">🇭🇰 香港 (HK)</option>
                <option value="tw">🇹🇼 台湾 (TW)</option>
                <option value="gb">🇬🇧 英国 (GB)</option>
              </select>
            </div>

            <div class="form-group">
              <label>音频编码偏好 (--song-codec-priority)</label>
              <select v-model="config.songCodec" class="form-select">
                <option value="aac-web">AAC-Web (256kbps 推荐/最稳定)</option>
                <option value="aac">AAC (默认标准)</option>
                <option value="alac">ALAC (无损音质)</option>
                <option value="atmos">ATMOS (杜比全景声)</option>
                <option value="ac3">AC3 (5.1 环绕声)</option>
              </select>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>逐字同步歌词格式 (--synced-lyrics-format)</label>
              <select v-model="config.syncedLyricsFormat" class="form-select">
                <option value="lrc">LRC (常用格式)</option>
                <option value="ttml">TTML (逐字精细时轴)</option>
                <option value="srt">SRT (字幕格式)</option>
                <option value="none">不下载歌词文件</option>
              </select>
            </div>

            <div class="form-group">
              <label>附加选项</label>
              <div class="checkbox-list">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="config.saveCover" /> 保存独立专辑封面图片 (-s)
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" v-model="config.savePlaylist" /> 生成 M3U8 播放列表文件
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" v-model="config.overwrite" /> 覆盖同名已有文件
                </label>
              </div>
            </div>
          </div>

          <div class="form-divider">高级依赖配置 (可选)</div>

          <div class="form-group">
            <label>自定义 FFmpeg 路径 (留空使用系统 PATH)</label>
            <div class="path-input-row">
              <input type="text" v-model="config.ffmpegPath" placeholder="例如: C:\ffmpeg\bin\ffmpeg.exe" />
              <button class="btn-sm" @click="selectBinary('ffmpegPath')">浏览</button>
            </div>
          </div>

          <div class="form-group">
            <label>自定义 N_m3u8DL-RE 路径 (留空使用系统 PATH)</label>
            <div class="path-input-row">
              <input type="text" v-model="config.nm3u8dlrePath" placeholder="例如: N_m3u8DL-RE.exe" />
              <button class="btn-sm" @click="selectBinary('nm3u8dlrePath')">浏览</button>
            </div>
          </div>

          <div class="form-group">
            <label>Widevine 设备文件 (.wvd 路径，用于特定高阶解密)</label>
            <div class="path-input-row">
              <input type="text" v-model="config.wvdPath" placeholder="例如: device.wvd" />
              <button class="btn-sm" @click="selectBinary('wvdPath')">浏览</button>
            </div>
          </div>
        </div>

        <div class="settings-footer">
          <button class="btn-dl primary" @click="saveSettingsAndClose">保存设置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const { ipcRenderer } = window.require('electron');

export default {
  data() {
    return {
      isChecking: true,
      currentNav: 'search',
      keyword: '',
      isSearching: false,
      results: [],
      tab: 'song',
      searchStatus: '',
      cookieReady: false,
      tasks: [],
      showDownloads: false,
      showSettings: false,
      batchUrlsText: '',
      curSong: null,
      curUrl: '',
      isPlaying: false,
      curTime: 0,
      duration: 0,
      vol: 0.8,
      isLoading: false,
      gamdlStatus: { installed: true, version: '' },
      defaultCover: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="%23d1d1d6"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
      config: {
        downloadDir: '',
        country: 'cn',
        songCodec: 'aac-web',
        syncedLyricsFormat: 'lrc',
        saveCover: false,
        savePlaylist: false,
        overwrite: false,
        ffmpegPath: '',
        nm3u8dlrePath: '',
        wvdPath: ''
      }
    };
  },
  computed: {
    filteredSongs() {
      return this.results.filter(i => i.type === '歌曲');
    },
    filteredAlbums() {
      return this.results.filter(i => i.type === '专辑');
    },
    filteredDirect() {
      return this.results.filter(i => i.isDirectUrl);
    },
    activeTasksCount() {
      return this.tasks.filter(t => t.status === 'downloading').length;
    },
    hasFinishedTasks() {
      return this.tasks.some(t => t.status === 'success');
    }
  },
  async mounted() {
    try {
      const [ck, cfg, gStatus] = await Promise.all([
        ipcRenderer.invoke('check-cookie'),
        ipcRenderer.invoke('get-config'),
        ipcRenderer.invoke('check-gamdl')
      ]);

      this.cookieReady = ck.valid;
      if (cfg) {
        this.config = { ...this.config, ...cfg };
      }
      if (gStatus) {
        this.gamdlStatus = gStatus;
      }

      // 实时监听来自主进程的下载进度
      ipcRenderer.on('download-progress', (e, d) => {
        const t = this.tasks.find(x => x.id === d.id);
        if (t && t.status === 'downloading') {
          // 清理 ANSI 颜色字符
          // eslint-disable-next-line no-control-regex
          const cleanText = d.text.replace(/\x1B\[[0-9;]*[mK]/g, '').trim();

          // 抓取曲目索引 (例如 Track 2/10 或 2/10)
          const trackMatch = cleanText.match(/Track\s*(\d+)\s*\/\s*(\d+)/i) || cleanText.match(/(\d+)\/(\d+)/);
          if (trackMatch) {
            const curr = parseInt(trackMatch[1], 10);
            const total = parseInt(trackMatch[2], 10);
            if (total > 0 && total < 300 && curr > 0) {
              t.albumProgress = `${Math.min(curr, total)}/${total}`;
            }
          }

          // 抓取正在下载的单曲名称
          const downloadingSongMatch = cleanText.match(/Downloading\s*"([^"]+)"/i);
          if (downloadingSongMatch) {
            t.currentTrackTitle = downloadingSongMatch[1];
          }

          // 抓取百分比
          const pctMatch = cleanText.match(/(\d+\.?\d*)%/);
          if (pctMatch) {
            const prefix = t.albumProgress ? `[第 ${t.albumProgress} 首] ` : '';
            t.prog = `${prefix}${pctMatch[0]}`;
          } else if (cleanText.toLowerCase().includes('downloaded') || cleanText.toLowerCase().includes('already exists')) {
            const prefix = t.albumProgress ? `[第 ${t.albumProgress} 首] ` : '';
            t.prog = `${prefix}100%`;
          }
        }
      });
    } catch (err) {
      console.error('初始化失败:', err);
    } finally {
      this.isChecking = false;
    }
  },
  methods: {
    resetView() {
      this.results = [];
      this.searchStatus = '';
      this.currentNav = 'search';
    },

    async saveConfig() {
      await ipcRenderer.invoke('set-config', this.config);
    },

    async saveSettingsAndClose() {
      await this.saveConfig();
      this.showSettings = false;
    },

    async selectDownloadDir() {
      const p = await ipcRenderer.invoke('select-folder');
      if (p) {
        this.config.downloadDir = p;
        await this.saveConfig();
      }
    },

    async selectBinary(field) {
      const p = await ipcRenderer.invoke('select-file');
      if (p) {
        this.config[field] = p;
      }
    },

    async handleSearchOrDirectDownload() {
      if (!this.keyword || this.isSearching) return;
      const term = this.keyword.trim();

      // 如果直接是 Apple Music 链接，自动添加直链
      if (term.includes('music.apple.com')) {
        this.searchStatus = '检测到 Apple Music 链接，正在解析...';
        this.tab = 'direct';
      }

      this.isSearching = true;
      try {
        const res = await ipcRenderer.invoke('search-music', {
          term: term,
          country: this.config.country || 'cn'
        });

        const seen = new Set();
        this.results = (res || []).filter(i => {
          const k = i.type + '_' + i.title + '_' + i.artist;
          return seen.has(k) ? false : seen.add(k);
        });

        if (this.results.some(i => i.isDirectUrl)) {
          this.tab = 'direct';
          this.searchStatus = '已识别直链项目，可直接点击下载';
        } else {
          this.tab = this.filteredSongs.length > 0 ? 'song' : 'album';
          this.searchStatus = `已找到 ${this.filteredSongs.length} 首单曲，${this.filteredAlbums.length} 张专辑`;
        }
      } catch (e) {
        this.searchStatus = '搜索中断，请检查网络或更换地区';
      } finally {
        this.isSearching = false;
      }
    },

    async download(item) {
      if (!this.config.downloadDir) {
        const p = await ipcRenderer.invoke('select-folder');
        if (p) {
          this.config.downloadDir = p;
          await this.saveConfig();
        } else {
          return;
        }
      }

      const id = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6);
      const task = {
        id,
        title: item.title,
        status: 'downloading',
        prog: '分析中...',
        url: item.url,
        saveDir: this.config.downloadDir,
        albumProgress: ''
      };

      this.tasks.unshift(task);
      this.showDownloads = true;

      const res = await ipcRenderer.invoke('start-download-task', task);
      const t = this.tasks.find(x => x.id === id);
      if (t) {
        t.status = res.success ? 'success' : 'error';
        t.msg = res.msg;
      }
    },

    async handleBatchDownload() {
      const urls = this.batchUrlsText
        .split('\n')
        .map(u => u.trim())
        .filter(u => u && u.includes('music.apple.com'));

      if (urls.length === 0) {
        alert('请输入有效的 Apple Music 链接');
        return;
      }

      for (const url of urls) {
        this.download({
          title: '链接任务: ' + url.split('/').pop().split('?')[0],
          url: url
        });
      }

      this.batchUrlsText = '';
      this.showDownloads = true;
    },

    async cancelTask(t) {
      if (confirm(`确定要终止任务 "${t.title}" 吗？`)) {
        t.status = 'error';
        t.msg = '已手动终止';
        await ipcRenderer.invoke('cancel-download', t.id);
      }
    },

    async retryTask(t) {
      t.status = 'downloading';
      t.prog = '正在重新开始...';
      const res = await ipcRenderer.invoke('start-download-task', t);
      t.status = res.success ? 'success' : 'error';
      t.msg = res.msg;
    },

    removeTask(taskId) {
      this.tasks = this.tasks.filter(t => t.id !== taskId);
    },

    clearFinishedTasks() {
      this.tasks = this.tasks.filter(t => t.status === 'downloading' || t.status === 'error');
    },

    play(s) {
      if (!s.previewUrl) return alert('此曲暂无官方试听片段');
      if (this.curSong?.id === s.id) return this.togglePlay();
      this.curSong = s;
      this.curUrl = s.previewUrl;
      this.isPlaying = true;
      this.$nextTick(() => {
        if (this.$refs.audio) {
          this.$refs.audio.play().catch(() => {});
        }
      });
    },

    togglePlay() {
      if (!this.$refs.audio) return;
      if (this.isPlaying) {
        this.$refs.audio.pause();
      } else {
        this.$refs.audio.play().catch(() => {});
      }
      this.isPlaying = !this.isPlaying;
    },

    seek() {
      if (this.$refs.audio) {
        this.$refs.audio.currentTime = this.curTime;
      }
    },

    vChange() {
      if (this.$refs.audio) {
        this.$refs.audio.volume = this.vol;
      }
    },

    fmt(s) {
      if (!s || isNaN(s)) return '0:00';
      const m = Math.floor(s / 60);
      const ss = Math.floor(s % 60);
      return `${m}:${ss < 10 ? '0' + ss : ss}`;
    },

    async handleLogin() {
      this.isLoading = true;
      try {
        await ipcRenderer.invoke('run-login');
        const ck = await ipcRenderer.invoke('check-cookie');
        this.cookieReady = ck.valid;
        if (ck.valid) {
          alert('✅ 登录凭证抓取成功！可以正常开始下载音乐了。');
        } else {
          alert('❌ 未检测到登录凭证，请重试并在弹出的浏览器窗口中完成登录。');
        }
      } catch (err) {
        alert('登录操作取消或出错: ' + (err.message || err));
      } finally {
        this.isLoading = false;
      }
    },

    openDir(p) {
      ipcRenderer.invoke('open-folder', p);
    }
  }
};
</script>

<style>
/* 全局基础设置 */
body {
  margin: 0;
  background: #f5f5f7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
  user-select: none;
}
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: #1d1d1f;
}

/* 顶部 Header */
.header {
  height: 70px;
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 30px;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 25px;
}
.header h1 {
  font-size: 20px;
  cursor: pointer;
  margin: 0;
  white-space: nowrap;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 520px;
}
.country-select {
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid #d1d1d6;
  background: #f9f9fb;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
}
.search-box input {
  flex: 1;
  padding: 10px 15px;
  border-radius: 12px;
  border: 1px solid #ddd;
  outline: none;
  font-size: 14px;
}
.search-box input:focus {
  border-color: #fa243c;
}
.search-btn {
  background: #1d1d1f;
  color: #fff;
  border: none;
  padding: 0 20px;
  height: 38px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: bold;
  white-space: nowrap;
  transition: 0.2s;
}
.search-btn:hover {
  background: #333;
}
.header-right {
  display: flex;
  gap: 12px;
}
.status-btn {
  border: none;
  padding: 8px 18px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  background: #fa243c;
  color: white;
  transition: 0.2s;
}
.status-btn.active {
  background: #e8e8ed;
  color: #1d1d1f;
}
.status-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.icon-btn {
  background: #e8e8ed;
  border: none;
  padding: 8px 18px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  transition: 0.2s;
}
.icon-btn:hover {
  background: #dcdcde;
}
.icon-btn.highlight {
  background: #1d1d1f;
  color: #fff;
}
.icon-btn.highlight:hover {
  background: #333;
}

/* 主布局 */
.main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.sidebar {
  width: 220px;
  background: #fff;
  padding: 30px 20px 20px;
  border-right: 1px solid #e5e5ea;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.sidebar h3 {
  font-size: 13px;
  color: #86868b;
  margin-bottom: 15px;
  margin-top: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sidebar li {
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  color: #1d1d1f;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
  transition: 0.2s;
}
.sidebar li:hover {
  background: #f2f2f7;
}
.sidebar li.active {
  background: #fa243c;
  color: #fff;
}
.sidebar-footer {
  padding-top: 15px;
  border-top: 1px solid #f2f2f7;
}
.engine-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #86868b;
}
.engine-badge .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff3b30;
}
.engine-badge.ready .dot {
  background: #34c759;
}

/* 内容区域 */
.content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
  padding-bottom: 120px;
}
.search-info {
  margin-bottom: 20px;
  color: #86868b;
  font-weight: 600;
  font-size: 14px;
}
.tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 25px;
}
.tab {
  padding: 8px 22px;
  background: #e8e8ed;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  color: #86868b;
  font-size: 14px;
  transition: 0.2s;
}
.tab:hover {
  background: #dedede;
}
.tab.active {
  background: #fa243c;
  color: #fff;
}
.ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 单曲列表视图 */
.list-view {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  margin-bottom: 20px;
}
.list-head {
  display: flex;
  padding: 14px 20px;
  background: #f9f9fb;
  font-weight: bold;
  color: #86868b;
  font-size: 13px;
  border-bottom: 1px solid #e5e5ea;
}
.list-row {
  display: flex;
  padding: 12px 20px;
  align-items: center;
  border-bottom: 1px solid #f2f2f7;
  font-size: 14px;
  transition: 0.2s;
}
.list-row:hover {
  background: #f9f9fb;
}
.list-row:last-child {
  border-bottom: none;
}
.c-tt {
  flex: 3;
  display: flex;
  align-items: center;
  gap: 15px;
  font-weight: 500;
  overflow: hidden;
  padding-right: 10px;
}
.c-tt img {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  background: #f0f0f2;
}
.c-ar {
  flex: 2;
  color: #555;
  overflow: hidden;
  padding-right: 10px;
}
.c-al {
  flex: 2;
  color: #86868b;
  overflow: hidden;
  padding-right: 10px;
}
.c-pl {
  width: 60px;
  text-align: center;
}
.c-dl {
  width: 80px;
  text-align: right;
}
.btn-sm {
  background: #f2f2f7;
  border: 1px solid #d1d1d6;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  color: #1d1d1f;
  font-size: 12px;
  font-weight: 500;
  transition: 0.2s;
}
.btn-sm:hover:not(:disabled) {
  background: #e5e5ea;
}
.btn-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-dl {
  background: #1d1d1f;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: bold;
  font-size: 12px;
  transition: 0.2s;
}
.btn-dl:hover {
  background: #fa243c;
}
.btn-dl.primary {
  background: #fa243c;
  padding: 12px 24px;
  font-size: 14px;
}
.btn-dl.primary:hover {
  background: #e01b33;
}

/* 专辑卡片网格 */
.grid-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 25px;
}
.album-card {
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  transition: 0.3s;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
}
.album-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
}
.cover-container {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: #f0f0f2;
}
.cover-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover-container:hover .overlay {
  opacity: 1;
}
.overlay button {
  background: #fa243c;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: bold;
}
.card-info {
  padding: 15px;
  text-align: left;
}
.card-tt {
  font-weight: bold;
  margin-bottom: 5px;
}
.card-ar {
  color: #86868b;
  font-size: 13px;
}

/* 直链项目卡片 */
.direct-results {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.direct-card {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.direct-info h3 {
  margin: 0 0 6px 0;
  font-size: 16px;
}
.direct-info p {
  margin: 0;
  color: #86868b;
  font-size: 13px;
}

/* 欢迎空白提示 */
.welcome-box {
  text-align: center;
  padding: 80px 20px;
  color: #86868b;
}
.welcome-icon {
  font-size: 54px;
  margin-bottom: 15px;
}
.welcome-box h2 {
  color: #1d1d1f;
  margin-bottom: 10px;
}
.quick-tips {
  margin-top: 30px;
  display: inline-block;
  background: #e8e8ed;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 13px;
  color: #555;
}

/* 批量直链下载视图 */
.direct-download-view {
  background: #fff;
  padding: 30px;
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  max-width: 800px;
}
.section-desc {
  color: #86868b;
  margin-bottom: 15px;
  font-size: 14px;
}
.batch-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 15px;
  border-radius: 12px;
  border: 1px solid #d1d1d6;
  font-family: monospace;
  font-size: 13px;
  resize: vertical;
  outline: none;
}
.batch-textarea:focus {
  border-color: #fa243c;
}
.direct-actions {
  margin-top: 20px;
  display: flex;
  gap: 15px;
  align-items: center;
}

/* 下载侧边抽屉面板 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
  backdrop-filter: blur(4px);
}
.download-panel {
  width: 480px;
  background: #f5f5f7;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.15);
  height: 100%;
}
.panel-header {
  padding: 22px 25px;
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e5e5ea;
}
.panel-header h3 {
  margin: 0;
  font-size: 17px;
}
.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}
.text-btn {
  background: none;
  border: none;
  color: #007aff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.text-btn:hover {
  text-decoration: underline;
}
.task-list {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.empty-hint {
  text-align: center;
  color: #86868b;
  margin-top: 60px;
}
.task-card {
  background: #fff;
  padding: 16px;
  border-radius: 14px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
.task-main {
  flex: 1;
  overflow: hidden;
  padding-right: 12px;
}
.task-tt {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 6px;
}
.task-st {
  display: flex;
  align-items: center;
}
.badge {
  font-size: 11px;
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 6px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge.blue {
  background: #e1f0ff;
  color: #007aff;
}
.badge.green {
  background: #e3f9e5;
  color: #16a34a;
}
.badge.red {
  background: #ffebeb;
  color: #fa243c;
}
.task-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.open-btn, .retry-btn, .remove-btn {
  background: #f2f2f7;
  border: 1px solid #d1d1d6;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}
.open-btn:hover, .retry-btn:hover, .remove-btn:hover {
  background: #e5e5ea;
}
.cancel-btn {
  background: #ffebeb;
  border: 1px solid #ffb3ba;
  color: #fa243c;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  font-weight: bold;
}
.cancel-btn:hover {
  background: #ffc9ce;
}
.close-btn {
  font-size: 20px;
  cursor: pointer;
  color: #86868b;
  line-height: 1;
}

/* 参数设置模态框 */
.settings-modal {
  width: 600px;
  max-height: 85vh;
  background: #fff;
  border-radius: 20px;
  margin: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
.settings-header {
  padding: 20px 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e5e5ea;
}
.settings-header h3 {
  margin: 0;
  font-size: 18px;
}
.settings-body {
  padding: 25px;
  overflow-y: auto;
  flex: 1;
}
.form-group {
  margin-bottom: 18px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1d1d1f;
}
.path-input-row {
  display: flex;
  gap: 8px;
}
.path-input-row input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #d1d1d6;
  font-size: 13px;
  outline: none;
}
.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}
.form-select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #d1d1d6;
  background: #fff;
  font-size: 13px;
  outline: none;
}
.checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: normal;
  cursor: pointer;
}
.form-divider {
  font-size: 12px;
  font-weight: bold;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 25px 0 15px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f2f2f7;
}
.settings-footer {
  padding: 15px 25px;
  border-top: 1px solid #e5e5ea;
  display: flex;
  justify-content: flex-end;
  background: #fafafa;
}

/* 底部试听播放器 */
.player {
  position: fixed;
  bottom: 0;
  width: 100%;
  height: 85px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(15px);
  border-top: 1px solid #e5e5ea;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  box-sizing: border-box;
}
.p-left {
  width: 280px;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}
.p-left img {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  background: #eee;
}
.p-left b {
  font-size: 14px;
}
.p-left span {
  font-size: 12px;
  color: #86868b;
}
.p-mid {
  flex: 1;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.p-ctrl {
  font-size: 26px;
  background: none;
  border: none;
  cursor: pointer;
  color: #fa243c;
  line-height: 1;
}
.p-bar {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #86868b;
}
.p-bar input {
  flex: 1;
  accent-color: #fa243c;
  cursor: pointer;
}
.p-right {
  width: 140px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.p-right input {
  width: 90px;
  accent-color: #1d1d1f;
  cursor: pointer;
}
</style>
