<template>
  <div id="app">
    <div class="header">
      <div class="header-left">
        <h1 @click="resetView">🎵 Apple Music 下载器</h1>
        <div class="search-box">
          <input v-model="keyword" @keyup.enter="search" placeholder="输入歌手、歌曲或专辑..." />
          <button @click="search" :disabled="isSearching" class="search-btn">搜索</button>
        </div>
      </div>
      <div class="header-right">
        <button class="status-btn" :class="{active: cookieReady}" @click="handleLogin">
          {{ isLoading ? '🔄 处理中...' : (cookieReady ? '✅ 已登录 (点击刷新)' : '🔑 登录 Apple Music') }}
        </button>
        <button class="icon-btn highlight" @click="showDownloads = true">📥 下载列表 ({{ activeTasksCount }})</button>
        <button class="icon-btn" @click="changeDir">⚙️ 设置目录</button>
      </div>
    </div>

    <div class="main-layout" v-if="!isChecking">
      <div class="sidebar">
        <div class="sidebar-group">
          <h3>资源库</h3>
          <ul><li class="active">🔍 搜索发现</li><li>❤ 我的收藏</li><li>🕒 最近添加</li></ul>
        </div>
      </div>

      <div class="content">
        <div class="search-info" v-if="searchStatus">{{ searchStatus }}</div>
        
        <div class="tabs" v-if="results.length > 0">
          <div class="tab" :class="{active: tab==='song'}" @click="tab='song'">🎵 单曲</div>
          <div class="tab" :class="{active: tab==='album'}" @click="tab='album'">💿 专辑</div>
        </div>

        <div class="list-view" v-if="tab==='song' && filteredSongs.length > 0">
          <div class="list-head">
            <div class="c-tt">歌曲名称</div><div class="c-ar">歌手</div><div class="c-al">所属专辑</div><div class="c-pl">试听</div><div class="c-dl">下载</div>
          </div>
          <div class="list-row" v-for="item in filteredSongs" :key="item.id">
            <div class="c-tt"><img :src="item.cover" /> <span class="ellipsis">{{ item.title }}</span></div>
            <div class="c-ar ellipsis">{{ item.artist }}</div>
            <div class="c-al ellipsis">{{ item.album }}</div>
            <div class="c-pl"><button class="btn-sm" @click="play(item)">{{ curSong?.id===item.id && isPlaying ? '⏸' : '▶️' }}</button></div>
            <div class="c-dl"><button class="btn-dl" @click="download(item)">下载</button></div>
          </div>
        </div>

        <div class="grid-view" v-if="tab==='album' && filteredAlbums.length > 0">
          <div class="album-card" v-for="item in filteredAlbums" :key="item.id">
            <div class="cover-container">
              <img :src="item.cover" />
              <div class="overlay"><button @click="download(item)">📥 下载整张专辑</button></div>
            </div>
            <div class="card-info">
              <div class="card-tt ellipsis" :title="item.title">{{ item.title }}</div>
              <div class="card-ar ellipsis">{{ item.artist }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="player" v-if="curSong">
      <div class="p-left"><img :src="curSong.cover" /><div><b>{{curSong.title}}</b><br>{{curSong.artist}}</div></div>
      <div class="p-mid">
        <button class="p-ctrl" @click="togglePlay">{{ isPlaying ? '⏸' : '▶️' }}</button>
        <div class="p-bar">
          <span>{{ fmt(curTime) }}</span>
          <input type="range" min="0" :max="duration" step="0.1" v-model="curTime" @input="seek" />
          <span>{{ fmt(duration) }}</span>
        </div>
      </div>
      <div class="p-right">🔊 <input type="range" min="0" max="1" step="0.01" v-model="vol" @input="vChange" /></div>
    </div>
    <audio ref="audio" :src="curUrl" @timeupdate="curTime=$refs.audio.currentTime" @loadedmetadata="duration=$refs.audio.duration" @ended="isPlaying=false"></audio>

    <div class="modal-overlay" v-if="showDownloads" @click.self="showDownloads = false">
      <div class="download-panel">
        <div class="panel-header">
          <h3>📥 任务列表</h3>
          <span class="close-btn" @click="showDownloads = false">✖</span>
        </div>
        <div class="task-list">
          <div v-if="tasks.length === 0" class="empty-hint">暂无正在进行的任务</div>
          <div class="task-card" v-for="t in tasks" :key="t.id">
            <div class="task-main">
              <div class="task-tt ellipsis">{{ t.title }}</div>
              <div class="task-st">
                <span v-if="t.status === 'downloading'" class="badge blue">⏳ {{ t.prog || '分析中...' }}</span>
                <span v-else-if="t.status === 'success'" class="badge green">✅ 已完成</span>
                <span v-else class="badge red">❌ {{ t.msg || '错误' }}</span>
              </div>
            </div>
            <div class="task-actions">
              <button v-if="t.status === 'downloading'" class="cancel-btn" @click="cancelTask(t)">⏹ 终止</button>
              <button class="open-btn" @click="openDir(t.saveDir)">📁 目录</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const { ipcRenderer } = window.require('electron');
export default {
  data() { return { isChecking: true, keyword:'', isSearching:false, results:[], tab:'song', searchStatus:'', cookieReady:false, downloadDir:'', tasks:[], showDownloads:false, curSong:null, curUrl:'', isPlaying:false, curTime:0, duration:0, vol:0.8, isLoading: false } },
  computed: {
    filteredSongs() { return this.results.filter(i => i.type === '歌曲'); },
    filteredAlbums() { return this.results.filter(i => i.type === '专辑'); },
    activeTasksCount() { return this.tasks.filter(t => t.status === 'downloading').length; }
  },
  async mounted() {
    const ck = await ipcRenderer.invoke('check-cookie'); this.cookieReady = ck.valid;
    const cfg = await ipcRenderer.invoke('get-config'); this.downloadDir = cfg.downloadDir;
    
    // --- 监听下载进度 (究极暴力抓取版) ---
    ipcRenderer.on('download-progress', (e, d) => {
      const t = this.tasks.find(x => x.id === d.id);
      if(t && t.status === 'downloading') {
        // eslint-disable-next-line no-control-regex
        const cleanText = d.text.replace(/\x1B\[[0-9;]*[mK]/g, '').trim();
        
        // 1. 无视括号，暴力抓取 "数字/数字" 的模式 (比如 1/8, [1/12], (1/10))
        const albumMatch = cleanText.match(/(\d+)\/(\d+)/);
        if (albumMatch) {
          let curr = parseInt(albumMatch[1]);
          let total = parseInt(albumMatch[2]);
          // 加一个安全锁：总数不超过 300 且当前进度合理，防止误抓到类似 "2024/05" 的日期
          if (total > 0 && total < 300 && curr > 0) {
             if (curr > total) curr = total; // 强制压回最大值 (防溢出)
             t.albumProgress = `${curr}/${total}`;
          }
        }
        
        // 2. 抓取进度百分比
        const pctMatch = cleanText.match(/(\d+\.?\d*)%/);
        if (pctMatch) {
          t.prog = t.albumProgress ? `[第 ${t.albumProgress} 首] ${pctMatch[0]}` : pctMatch[0];
        } 
        // 3. 兜底策略：如果刚好下完一首但没刷出 100%，看到关键字直接补上 100%
        else if (cleanText.toLowerCase().includes('downloaded') || cleanText.toLowerCase().includes('already exists')) {
          t.prog = t.albumProgress ? `[第 ${t.albumProgress} 首] 100%` : '100%';
        }
      }
    });
    this.isChecking = false;
  },
  methods: {
    resetView() { this.results = []; this.searchStatus = ''; },
    async search() {
      if(!this.keyword || this.isSearching) return;
      this.isSearching = true; this.searchStatus = '正在全速检索全部结果...';
      try {
        const res = await ipcRenderer.invoke('search-music', this.keyword);
        const seen = new Set();
        this.results = (res || []).filter(i => {
          const k = i.type + '_' + i.title + '_' + i.artist;
          return seen.has(k) ? false : seen.add(k);
        });
        this.searchStatus = `已找到 ${this.filteredSongs.length} 首单曲，${this.filteredAlbums.length} 张专辑`;
      } catch(e) { this.searchStatus = '搜索中断，请检查网络'; } finally { this.isSearching = false; }
    },
    async download(i) {
      if(!this.downloadDir) { const p = await ipcRenderer.invoke('select-folder'); if(p) this.downloadDir = p; else return; }
      const id = Date.now().toString();
      // 【关键保障】：albumProgress 必须提前声明为空字符串
      const task = { id, title: i.title, status: 'downloading', prog: '准备中', url: i.url, saveDir: this.downloadDir, albumProgress: '' };
      this.tasks.unshift(task); this.showDownloads = true;
      const res = await ipcRenderer.invoke('start-download-task', task);
      const t = this.tasks.find(x => x.id === id); 
      if(t && t.status === 'downloading') { 
        t.status = res.success ? 'success' : 'error'; 
        t.msg = res.msg; 
      }
    },
    async cancelTask(t) {
      if(confirm('确定要终止这个下载任务吗？')) {
        t.status = 'error';
        t.msg = '已手动终止';
        await ipcRenderer.invoke('cancel-download', t.id);
      }
    },
    play(s) {
      if(!s.previewUrl) return alert('此曲无试听片段');
      if(this.curSong?.id === s.id) return this.togglePlay();
      this.curSong = s; this.curUrl = s.previewUrl; this.isPlaying = true;
      this.$nextTick(() => this.$refs.audio.play());
    },
    togglePlay() { if(this.isPlaying) this.$refs.audio.pause(); else this.$refs.audio.play(); this.isPlaying = !this.isPlaying; },
    seek() { this.$refs.audio.currentTime = this.curTime; },
    vChange() { this.$refs.audio.volume = this.vol; },
    fmt(s) { if(!s) return '0:00'; const m=Math.floor(s/60), ss=Math.floor(s%60); return `${m}:${ss<10?'0'+ss:ss}`; },
    async handleLogin() { this.isLoading = true; await ipcRenderer.invoke('run-login'); const ck = await ipcRenderer.invoke('check-cookie'); this.cookieReady = ck.valid; this.isLoading = false; },
    async changeDir() { const p = await ipcRenderer.invoke('select-folder'); if(p) { this.downloadDir = p; ipcRenderer.invoke('set-config', {downloadDir: p}); } },
    openDir(p) { ipcRenderer.invoke('open-folder', p); }
  }
}
</script>

<style>
/* 样式部分 */
body { margin:0; background:#f5f5f7; font-family:-apple-system, sans-serif; overflow:hidden; }
#app { height:100vh; display:flex; flex-direction:column; color:#1d1d1f; }
.header { height:70px; background:#fff; display:flex; justify-content:space-between; align-items:center; padding:0 30px; border-bottom:1px solid #e5e5ea; flex-shrink:0; }
.header-left { display:flex; align-items:center; gap:30px; } .header h1 { font-size:22px; cursor:pointer; margin: 0; }
.search-box { display:flex; gap:10px; width:400px; }
.search-box input { flex:1; padding:10px 15px; border-radius:12px; border:1px solid #ddd; outline:none; font-size:14px; }
.search-btn { background:#1d1d1f; color:#fff; border:none; padding:0 20px; border-radius:12px; cursor:pointer; font-weight:bold; }
.header-right { display:flex; gap:12px; }
.status-btn { border:none; padding:8px 18px; border-radius:20px; cursor:pointer; font-weight:bold; background:#fa243c; color:white; }
.status-btn.active { background:#e8e8ed; color:#1d1d1f; }
.icon-btn { background:#e8e8ed; border:none; padding:8px 18px; border-radius:20px; cursor:pointer; font-weight:bold; }
.icon-btn.highlight { background:#1d1d1f; color:#fff; }

.main-layout { flex:1; display:flex; overflow:hidden; }
.sidebar { width:220px; background:#fff; padding:30px 20px; border-right:1px solid #e5e5ea; flex-shrink:0; }
.sidebar h3 { font-size:14px; color:#86868b; margin-bottom:15px; margin-top:0; }
.sidebar ul { list-style:none; padding:0; margin:0; }
.sidebar li { padding:12px; border-radius:10px; cursor:pointer; color:#1d1d1f; margin-bottom:5px; font-weight:500; font-size: 14px;}
.sidebar li.active { background:#fa243c; color:#fff; }

.content { flex:1; padding:30px; overflow-y:auto; padding-bottom:120px; }
.search-info { margin-bottom: 20px; color: #86868b; font-weight: bold; }
.tabs { display:flex; gap:15px; margin-bottom:30px; }
.tab { padding:10px 25px; background:#e8e8ed; border-radius:20px; cursor:pointer; font-weight:bold; color:#86868b; font-size:14px;}
.tab.active { background:#fa243c; color:#fff; }
.ellipsis { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* 单曲列表 */
.list-view { background:#fff; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.02); overflow:hidden; margin-bottom: 20px; }
.list-head { display:flex; padding:15px 20px; background:#f9f9fb; font-weight:bold; color:#86868b; font-size:13px; border-bottom:1px solid #e5e5ea; }
.list-row { display:flex; padding:12px 20px; align-items:center; border-bottom:1px solid #f2f2f7; font-size:14px; transition:0.2s; }
.list-row:hover { background:#f9f9fb; }
.list-row:last-child { border-bottom:none; }
.c-tt { flex:3; display:flex; align-items:center; gap:15px; font-weight:500; overflow:hidden; padding-right:10px;}
.c-tt img { width:40px; height:40px; border-radius:8px; object-fit:cover; flex-shrink:0; }
.c-ar { flex:2; color:#555; overflow:hidden; padding-right:10px; }
.c-al { flex:2; color:#86868b; overflow:hidden; padding-right:10px; }
.c-pl { width:80px; text-align:center; }
.c-dl { width:80px; text-align:right; }
.btn-sm { background:#f2f2f7; border:1px solid #d1d1d6; border-radius:8px; padding:6px 12px; cursor:pointer; color:#1d1d1f; font-size:12px;}
.btn-dl { background:#1d1d1f; color:white; border:none; border-radius:8px; padding:8px 15px; cursor:pointer; font-weight:bold; font-size:12px;}
.btn-dl:hover { background:#fa243c; }

/* 专辑卡片 */
.grid-view { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:25px; }
.album-card { background:#fff; border-radius:18px; overflow:hidden; transition:0.3s; box-shadow:0 4px 10px rgba(0,0,0,0.02); }
.album-card:hover { transform:translateY(-5px); box-shadow:0 10px 25px rgba(0,0,0,0.1); }
.cover-container { position:relative; aspect-ratio:1; overflow:hidden; }
.cover-container img { width:100%; height:100%; object-fit:cover; }
.overlay { position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); opacity:0; transition:0.3s; display:flex; align-items:center; justify-content:center; }
.cover-container:hover .overlay { opacity:1; }
.overlay button { background:#fa243c; color:white; border:none; padding:10px 15px; border-radius:12px; cursor:pointer; font-weight:bold; }
.card-info { padding:15px; text-align:left; }
.card-tt { font-weight:bold; margin-bottom:5px; } .card-ar { color:#86868b; font-size:13px; }

/* 下载面板 */
.modal-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); display:flex; justify-content:flex-end; z-index:1000; }
.download-panel { width:450px; background:#f5f5f7; display:flex; flex-direction:column; box-shadow:-10px 0 30px rgba(0,0,0,0.1); }
.panel-header { padding:25px; background:#fff; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e5e5ea; }
.panel-header h3 { margin:0; font-size:18px; }
.task-list { padding:20px; overflow-y:auto; flex:1; }
.empty-hint { text-align:center; color:#86868b; margin-top:50px; }
.task-card { background:#fff; padding:18px; border-radius:16px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.03); }
.task-main { flex:1; overflow:hidden; padding-right:15px; }
.task-tt { font-weight:bold; font-size:15px; margin-bottom:8px; }
.task-st { display:flex; align-items:center; }
.badge { font-size:12px; font-weight:bold; padding:4px 10px; border-radius:8px; }
.badge.blue { background:#e1f0ff; color:#007aff; }
.badge.green { background:#e3f9e5; color:#16a34a; }
.badge.red { background:#ffebeb; color:#fa243c; }
.task-actions { display: flex; gap: 8px; flex-shrink: 0;}
.open-btn { background:#f2f2f7; border:1px solid #d1d1d6; padding:8px 12px; border-radius:10px; font-size:12px; cursor:pointer; }
.open-btn:hover { background:#e5e5ea; }
.cancel-btn { background:#ffebeb; border:1px solid #ffb3ba; color:#fa243c; padding:8px 12px; border-radius:10px; font-size:12px; cursor:pointer; font-weight: bold;}
.cancel-btn:hover { background:#ffc9ce; }
.close-btn { font-size:24px; cursor:pointer; color:#86868b; line-height:1; }

/* 播放器 */
.player { position:fixed; bottom:0; width:100%; height:90px; background:rgba(255,255,255,0.9); backdrop-filter:blur(15px); border-top:1px solid #e5e5ea; display:flex; align-items:center; justify-content:space-between; padding:0 40px; box-sizing:border-box; }
.p-left { width:300px; display:flex; align-items:center; gap:15px; } .p-left img { width:55px; height:55px; border-radius:10px; object-fit:cover; }
.p-left b { font-size:14px; } .p-left span { font-size:12px; color:#86868b; }
.p-mid { flex:1; max-width:600px; display:flex; flex-direction:column; align-items:center; gap:8px; }
.p-ctrl { font-size:28px; background:none; border:none; cursor:pointer; color:#fa243c; }
.p-bar { width:100%; display:flex; align-items:center; gap:15px; font-size:12px; color:#86868b; }
.p-bar input { flex:1; accent-color:#fa243c; cursor:pointer; }
.p-right { width:150px; display:flex; align-items:center; gap:10px; }
.p-right input { width:100px; accent-color:#1d1d1f; cursor:pointer; }
</style>