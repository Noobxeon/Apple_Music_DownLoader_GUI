const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { PythonShell } = require('python-shell');
const { spawn, exec } = require('child_process');

let mainWindow;
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const cookiePath = path.join(userDataPath, 'cookies.txt');

// 默认配置
const DEFAULT_CONFIG = {
  downloadDir: path.join(app.getPath('downloads'), 'Apple Music'),
  country: 'cn',
  songCodec: 'aac-web',
  syncedLyricsFormat: 'lrc',
  saveCover: false,
  savePlaylist: false,
  overwrite: false,
  ffmpegPath: '',
  nm3u8dlrePath: '',
  wvdPath: ''
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    const merged = { ...loadConfig(), ...cfg };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (e) {
    console.error('Error saving config:', e);
    return null;
  }
}

// 保存正在运行的下载进程与已取消的任务ID集合
const activeDownloads = new Map();
const cancelledTasks = new Set();

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.setMenuBarVisibility(false);

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  } else {
    // 开发模式检测
    const devUrl = 'http://localhost:8080';
    net.fetch(devUrl).then(() => {
      mainWindow.loadURL(devUrl);
    }).catch(() => {
      mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
    });
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// --- 基础配置与凭证 ---
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('set-config', (e, config) => saveConfig(config));

ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return !canceled ? filePaths[0] : null;
});

ipcMain.handle('select-file', async (e, options = {}) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    ...options
  });
  return !canceled ? filePaths[0] : null;
});

ipcMain.handle('open-folder', (e, p) => {
  if (p && fs.existsSync(p)) {
    shell.openPath(p);
  }
});

ipcMain.handle('check-cookie', () => {
  try {
    const exists = fs.existsSync(cookiePath);
    if (!exists) return { valid: false, path: cookiePath };
    const content = fs.readFileSync(cookiePath, 'utf8');
    const hasToken = content.includes('media-user-token');
    return { valid: hasToken, path: cookiePath };
  } catch(e) {
    return { valid: false, path: cookiePath, error: e.message };
  }
});

// 检测系统是否已安装 gamdl
ipcMain.handle('check-gamdl', async () => {
  return new Promise((resolve) => {
    exec('gamdl --version', (err, stdout) => {
      if (err) {
        resolve({ installed: false, version: null });
      } else {
        const match = stdout.trim();
        resolve({ installed: true, version: match || 'gamdl' });
      }
    });
  });
});

ipcMain.handle('run-login', async () => {
  return new Promise((resolve, reject) => {
    try {
      const getBackendPath = () => __dirname.includes('app.asar')
        ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'backend')
        : path.join(__dirname, 'backend');
      const scriptDir = getBackendPath();
      const options = {
        mode: 'text',
        pythonOptions: ['-u'],
        args: [cookiePath],
        scriptPath: scriptDir,
        cwd: scriptDir
      };

      const pyShell = new PythonShell('cookie_helper.py', options);
      let output = '';

      pyShell.on('message', (message) => {
        output += message + '\n';
        if (mainWindow) {
          mainWindow.webContents.send('login-log', message);
        }
      });

      pyShell.end((err, code) => {
        if (err || code !== 0) {
          reject(new Error(output || err?.message || '登录异常终止'));
        } else {
          resolve('成功');
        }
      });
    } catch (e) {
      reject(e);
    }
  });
});

// --- 音乐搜索 (支持多地区 Storefront 与直链识别) ---
ipcMain.handle('search-music', async (event, { term, country = 'cn' }) => {
  try {
    if (!term || !term.trim()) return [];
    const trimmed = term.trim();

    // 1. 如果用户输入的是直接的 Apple Music 链接
    if (trimmed.includes('music.apple.com')) {
      try {
        const urlObj = new URL(trimmed);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        // 例如: /us/album/song-name/123456?i=78910
        // 或: /cn/playlist/playlist-name/pl.xxxx
        let detectedType = '直链';
        let title = 'Apple Music 直链项目';
        let storefront = parts[0] || country;

        if (parts.includes('album')) {
          detectedType = urlObj.searchParams.get('i') ? '单曲' : '专辑';
          title = parts[2] ? decodeURIComponent(parts[2]).replace(/-/g, ' ') : '专辑/单曲';
        } else if (parts.includes('playlist')) {
          detectedType = '歌单';
          title = parts[2] ? decodeURIComponent(parts[2]).replace(/-/g, ' ') : '歌单';
        } else if (parts.includes('song')) {
          detectedType = '单曲';
          title = parts[2] ? decodeURIComponent(parts[2]).replace(/-/g, ' ') : '单曲';
        } else if (parts.includes('music-video')) {
          detectedType = 'MV';
          title = parts[2] ? decodeURIComponent(parts[2]).replace(/-/g, ' ') : '音乐视频';
        }

        return [{
          id: 'url_' + Date.now(),
          type: detectedType,
          title: title,
          artist: `链接来源 (${storefront.toUpperCase()})`,
          album: detectedType,
          cover: '',
          url: trimmed,
          previewUrl: '',
          isDirectUrl: true
        }];
      } catch (e) {
        // 如果 URL 解析失败则走普通搜索
      }
    }

    const encodedTerm = encodeURIComponent(trimmed);
    const searchCountry = country || 'cn';

    // 强制分离搜歌曲和搜专辑，避免混入电台播客
    const [songRes, albumRes] = await Promise.all([
      net.fetch(`https://itunes.apple.com/search?term=${encodedTerm}&country=${searchCountry}&entity=song&limit=150`),
      net.fetch(`https://itunes.apple.com/search?term=${encodedTerm}&country=${searchCountry}&entity=album&limit=150`)
    ]);

    const songData = await songRes.json();
    const albumData = await albumRes.json();
    
    const combined = [...(songData.results || []), ...(albumData.results || [])];

    return combined.map(item => ({
      id: String(item.trackId || item.collectionId),
      type: item.wrapperType === 'track' ? '歌曲' : '专辑',
      title: item.trackName || item.collectionName,
      artist: item.artistName || '未知艺术家',
      album: item.collectionName || item.trackName || '',
      cover: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '',
      url: item.trackViewUrl || item.collectionViewUrl,
      previewUrl: item.previewUrl || ''
    }));
  } catch (e) {
    console.error('search-music error:', e);
    throw e;
  }
});

// --- 下载管理与命令执行 (安全参数传递，全面对接 gamdl) ---
ipcMain.handle('start-download-task', async (event, task) => {
  try {
    if (!fs.existsSync(cookiePath)) {
      return { success: false, msg: '未检测到登录凭证 (请先点击登录)' };
    }

    const config = loadConfig();
    const saveDir = task.saveDir || config.downloadDir;
    if (!fs.existsSync(saveDir)) {
      try { fs.mkdirSync(saveDir, { recursive: true }); } catch (e) {}
    }

    // 构建安全的命令参数数组，杜绝字符串拼接 shell injection
    const args = [
      task.url,
      '--cookies-path', cookiePath,
      '--output-path', saveDir,
      '--album-folder-template', '{album_artist}/{album}'
    ];

    // 歌曲音质/编码选择 (例如 aac-web, aac, alac, atmos)
    if (config.songCodec) {
      args.push('--song-codec-priority', config.songCodec);
    }

    // 歌词下载配置
    if (config.syncedLyricsFormat === 'none') {
      args.push('--no-synced-lyrics');
    } else if (config.syncedLyricsFormat) {
      args.push('--synced-lyrics-format', config.syncedLyricsFormat);
    }

    // 保存独立封面图片
    if (config.saveCover) {
      args.push('--save-cover');
    }

    // 保存 M3U8 播放列表
    if (config.savePlaylist) {
      args.push('--save-playlist');
    }

    // 覆盖已有文件
    if (config.overwrite) {
      args.push('--overwrite');
    }

    // 自定义二进制与密钥路径
    if (config.ffmpegPath && config.ffmpegPath.trim()) {
      args.push('--ffmpeg-path', config.ffmpegPath.trim());
    }
    if (config.nm3u8dlrePath && config.nm3u8dlrePath.trim()) {
      args.push('--nm3u8dlre-path', config.nm3u8dlrePath.trim());
    }
    if (config.wvdPath && config.wvdPath.trim()) {
      args.push('--wvd-path', config.wvdPath.trim());
    }

    return new Promise((resolve) => {
      // Windows 上若作为批处理启动需启用 shell，但使用安全数组传参
      const child = spawn('gamdl', args, {
        shell: process.platform === 'win32',
        env: { ...process.env, PYTHONIOENCODING: 'utf8' }
      });

      activeDownloads.set(task.id, child);

      let logs = '';
      const onData = (d) => {
        const text = d.toString();
        logs += text;
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', { id: task.id, text });
        }
      };

      child.stdout.on('data', onData);
      child.stderr.on('data', onData);

      child.on('error', (err) => {
        activeDownloads.delete(task.id);
        const msg = err.code === 'ENOENT' ? '未找到 gamdl，请确认是否已安装' : err.message;
        resolve({ success: false, msg });
      });

      child.on('close', (code) => {
        activeDownloads.delete(task.id);

        if (cancelledTasks.has(task.id)) {
          cancelledTasks.delete(task.id);
          resolve({ success: false, msg: '已手动终止' });
          return;
        }

        const lowerLogs = logs.toLowerCase();

        // 细化常见错误原因反馈
        let errorMsg = '下载失败';
        if (lowerLogs.includes('no active apple music subscription')) {
          errorMsg = '无有效订阅 (需要激活 Apple Music 会员)';
        } else if (lowerLogs.includes('gamdldependency') || lowerLogs.includes('not found') && (lowerLogs.includes('ffmpeg') || lowerLogs.includes('n_m3u8dl-re'))) {
          errorMsg = '缺少 ffmpeg 或 N_m3u8DL-RE 依赖';
        } else if (lowerLogs.includes('format not available') || lowerLogs.includes('not streamable')) {
          errorMsg = '当前曲目受地区版权限制或不可流式下载';
        } else if (lowerLogs.includes('decryption') || lowerLogs.includes('ckc error')) {
          errorMsg = '解密失败 (建议在设置中改用 aac-web 编码)';
        }

        // gamdl v3.x 成功判定: code === 0，或输出中包含明确的完成/已存在提示
        const ok = (code === 0 && !lowerLogs.includes('finished with 1 error') && !lowerLogs.includes('finished with 2 error'))
          || lowerLogs.includes('finished with 0 error(s)')
          || lowerLogs.includes('downloaded')
          || lowerLogs.includes('already exists')
          || lowerLogs.includes('mediafileexistserror');

        resolve({ success: ok, msg: ok ? '成功' : errorMsg });
      });
    });
  } catch (e) {
    return { success: false, msg: '启动异常: ' + (e.message || e) };
  }
});

// --- 取消下载任务 ---
ipcMain.handle('cancel-download', (event, taskId) => {
  cancelledTasks.add(taskId);
  const child = activeDownloads.get(taskId);
  if (child) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
      } else {
        child.kill('SIGKILL');
      }
    } catch (e) {
      console.error('Error killing process:', e);
    }
    activeDownloads.delete(taskId);
    return true;
  }
  return false;
});
