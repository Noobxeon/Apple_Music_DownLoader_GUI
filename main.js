const { app, BrowserWindow, ipcMain, dialog, shell, net, protocol, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { engineRuntime, engineArgs, capture, musicUrl, checkWrapper, buildDownloadArgs, downloadResult } = require('./backend/engine');
const { validToken, toNetscape, hasValidToken, inspectCookieContent, normalizeCookieInput } = require('./backend/cookies');
const { searchCatalog } = require('./backend/search');

if (protocol && typeof protocol.registerSchemesAsPrivileged === 'function') {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'local-media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true
      }
    }
  ]);
}

const argvList = process.argv || [];
const diagnosticsMode = argvList.includes('--diagnostics');
const isSmokeTest = argvList.includes('--headless-smoke-test');

if (diagnosticsMode || isSmokeTest) {
  if (app.disableHardwareAcceleration) app.disableHardwareAcceleration();
  if (app.commandLine?.appendSwitch) app.commandLine.appendSwitch('disable-gpu');
}

let mainWindow = null;
let studioServices = null;

function runtimeOptions() {
  return app.isPackaged
    ? { packaged: true, resourcesPath: process.resourcesPath }
    : { enginePath: path.join(__dirname, 'vendor', 'gamdl-engine', 'gamdl-engine.exe') };
}
const getRuntime = config => engineRuntime(config, runtimeOptions());

const userDataPath = app.getPath('userData');
const downloadsRoot = (() => {
  try { return app.getPath('downloads'); } catch { return userDataPath; }
})();
const configPath = path.join(userDataPath, 'config.json');
const cookiePath = path.join(userDataPath, 'cookies.txt');

const DEFAULT_CONFIG = {
  downloadDir: path.join(downloadsRoot, 'Apple Music'),
  country: 'cn',
  theme: 'dark',
  maxConcurrent: 2,
  desktopNotification: true,
  useArchiveDb: false,
  songCodec: 'aac-web',
  musicVideoResolution: '1080p',
  musicVideoRemuxFormat: 'mp4',
  artistAutoSelect: 'top-songs',
  downloadMode: 'ytdlp',
  language: '',
  useWrapper: false,
  wrapperUrl: 'http://127.0.0.1',
  wrapperDecryptHost: '127.0.0.1',
  wrapperDecryptPort: 10020,
  syncedLyricsFormat: 'lrc',
  syncedLyricsOnly: false,
  coverFormat: 'jpg',
  coverSize: 1200,
  saveCover: false,
  savePlaylist: false,
  overwrite: false,
  useAlbumDate: false,
  albumFolderTemplate: '{album_artist}/{album}',
  singleDiscFileTemplate: '{track:02d} {title}',
  multiDiscFileTemplate: '{disc}-{track:02d} {title}',
  playlistFolderTemplate: 'Playlists/{playlist_title}',
  truncate: 60,
  pythonPath: '',
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
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (e) {
    console.error('Error saving config:', e);
    return null;
  }
}

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function getBackendDir() {
  return __dirname.includes('app.asar')
    ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'backend')
    : path.join(__dirname, 'backend');
}

function ensureStudioServices() {
  if (studioServices) return studioServices;
  const { AppStore } = require('./electron/store');
  const { AppleMusicCatalog } = require('./electron/appleApi');
  const { DownloadQueueManager } = require('./electron/downloadManager');
  const { LibraryManager } = require('./electron/libraryManager');

  const store = new AppStore(userDataPath, downloadsRoot);
  const fetchImpl = net && typeof net.fetch === 'function' ? net.fetch.bind(net) : global.fetch;
  const catalog = new AppleMusicCatalog(fetchImpl);
  const libraryManager = new LibraryManager(store, getRuntime, getBackendDir());
  const queueManager = new DownloadQueueManager({
    store,
    getRuntime,
    userDataPath,
    onUpdate: (snapshot) => send('queue-updated', snapshot),
    onTaskLog: (entry) => send('task-log', entry),
    onBatchComplete: () => {
      const cfg = store.getConfig();
      if (cfg.desktopNotification && Notification && Notification.isSupported && Notification.isSupported() && !isSmokeTest) {
        const count = queueManager.tasks.filter(t => t.status === 'completed').length;
        if (count > 0) {
          new Notification({
            title: 'Apple Music 下载任务完成',
            body: `队列中已完成 ${count} 项高品质音频/视频下载`
          }).show();
        }
      }
    }
  });

  studioServices = { store, catalog, libraryManager, queueManager };
  return studioServices;
}

function registerLocalMediaProtocol() {
  if (!protocol || typeof protocol.handle !== 'function') return;
  const { Readable } = require('stream');
  const mimeMap = {
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8'
  };

  protocol.handle('local-media', async (request) => {
    try {
      const u = new URL(request.url);
      const filePath = u.searchParams.get('path');
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not Found', { status: 404 });
      }
      const stat = fs.statSync(filePath);
      const total = stat.size;
      const mimeType = mimeMap[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? Math.min(total - 1, parseInt(match[2], 10)) : total - 1;
          const nodeStream = fs.createReadStream(filePath, { start, end });
          return new Response(Readable.toWeb(nodeStream), {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(end - start + 1),
              'Content-Type': mimeType
            }
          });
        }
      }

      const nodeStream = fs.createReadStream(filePath);
      return new Response(Readable.toWeb(nodeStream), {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(total),
          'Content-Type': mimeType
        }
      });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  });
}

const activeDownloads = new Map();
const cancelledTasks = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'build', 'icon.ico'),
    width: 1340,
    height: 880,
    minWidth: 1000,
    minHeight: 680,
    frame: false,
    show: !isSmokeTest,
    backgroundColor: '#0c0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());

  if (mainWindow.on) {
    mainWindow.on('maximize', () => send('win-maximized-changed', true));
    mainWindow.on('unmaximize', () => send('win-maximized-changed', false));
  }

  if (app.isPackaged || isSmokeTest) {
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  } else {
    if (process.env.MUSIC_DEV_URL === 'http://localhost:8080') {
      mainWindow.loadURL(process.env.MUSIC_DEV_URL);
    } else {
      mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
    }
  }

  if (isSmokeTest && mainWindow.webContents.on) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const checkJson = await mainWindow.webContents.executeJavaScript(
            `JSON.stringify({
              hasAppleMusic: typeof window.appleMusic === 'object',
              hasMusicAPI: typeof window.musicAPI === 'object',
              isolated: typeof window.require === 'undefined',
              mounted: Boolean(document.querySelector('.studio-shell')),
              navItems: document.querySelectorAll('.nav-item').length
            })`
          );
          console.log('SMOKE_TEST_RESULT:', checkJson);
          const parsed = JSON.parse(checkJson);
          if (parsed.hasAppleMusic && parsed.hasMusicAPI && parsed.isolated && parsed.mounted && parsed.navItems >= 6) {
            console.log('SMOKE_TEST_PASSED');
            app.exit(0);
          } else {
            console.error('SMOKE_TEST_FAILED');
            app.exit(1);
          }
        } catch (err) {
          console.error('SMOKE_TEST_ERROR:', err);
          app.exit(1);
        }
      }, 2000);
    });
  }
}

app.whenReady().then(async () => {
  if (diagnosticsMode) {
    try {
      const runtime = await getRuntime(loadConfig());
      const version = await capture(runtime.command, engineArgs(runtime, ['--version']));
      console.log(JSON.stringify({
        success: true,
        appVersion: app.getVersion ? app.getVersion() : '2.0.0',
        engineVersion: runtime.version,
        bundled: runtime.kind === 'bundled',
        executable: runtime.command,
        cli: version
      }));
      app.exit(0);
    } catch (error) {
      console.error(JSON.stringify({ success: false, error: error.message }));
      app.exit(1);
    }
    return;
  }

  registerLocalMediaProtocol();
  ensureStudioServices();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Window Controls ---
ipcMain.handle('win-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('win-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) { mainWindow.unmaximize(); return false; }
  mainWindow.maximize();
  return true;
});
ipcMain.handle('win-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle('win-is-maximized', () => (mainWindow && mainWindow.isMaximized ? mainWindow.isMaximized() : false));

// --- Config & Dialogs ---
ipcMain.handle('get-app-info', () => ({
  version: app.getVersion ? app.getVersion() : '2.0.0',
  packaged: Boolean(app.isPackaged),
  platform: process.platform
}));
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('set-config', (_e, config) => {
  const updated = saveConfig(config);
  if (studioServices && config && config.maxConcurrent !== undefined) {
    studioServices.queueManager._pumpQueue();
  }
  return updated;
});
ipcMain.handle('reset-config', () => ensureStudioServices().store.resetConfig());

ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return !canceled ? filePaths[0] : null;
});

ipcMain.handle('select-file', async (_e, options = {}) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    ...options
  });
  return !canceled ? filePaths[0] : null;
});

ipcMain.handle('save-file-dialog', async (_e, options = {}) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, options);
  return !canceled ? filePath : null;
});

ipcMain.handle('open-folder', async (_event, folder) => {
  const target = folder || loadConfig().downloadDir;
  if (!target) return { error: '请先选择保存目录' };
  if (target === loadConfig().downloadDir) fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(target)) return { error: '此目录不存在，请在设置中重新选择' };
  const error = await shell.openPath(target);
  return error ? { error } : { success: true };
});

ipcMain.handle('show-item-in-folder', (_e, filePath) => {
  if (filePath && fs.existsSync(filePath) && shell.showItemInFolder) {
    shell.showItemInFolder(filePath);
  }
});

ipcMain.handle('open-external', (_e, url) => {
  if (url && /^https?:\/\//i.test(url) && shell.openExternal) {
    shell.openExternal(url);
  }
});

// --- Cookie & Environment Inspection ---
function readCookieSummary() {
  try {
    if (!fs.existsSync(cookiePath)) {
      return { valid: false, exists: false, hasMediaToken: false, expired: false, count: 0, expiresAt: null, path: cookiePath };
    }
    const content = fs.readFileSync(cookiePath, 'utf8');
    return inspectCookieContent(content, cookiePath);
  } catch (e) {
    return { valid: false, exists: false, count: 0, path: cookiePath, error: e.message };
  }
}

ipcMain.handle('check-cookie', () => readCookieSummary());

ipcMain.handle('import-cookie-file', (_e, srcPath) => {
  if (!srcPath || !fs.existsSync(srcPath)) throw new Error('所选 Cookie 文件不存在');
  const raw = fs.readFileSync(srcPath, 'utf8');
  const normalized = normalizeCookieInput(raw);
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(cookiePath, normalized, { encoding: 'utf8', mode: 0o600 });
  return readCookieSummary();
});

ipcMain.handle('save-cookie-content', (_e, rawText) => {
  const normalized = normalizeCookieInput(rawText);
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(cookiePath, normalized, { encoding: 'utf8', mode: 0o600 });
  return readCookieSummary();
});

ipcMain.handle('export-cookie-file', (_e, destPath) => {
  if (!fs.existsSync(cookiePath)) throw new Error('当前尚无已保存的 Cookie 文件');
  fs.copyFileSync(cookiePath, destPath);
  return true;
});

ipcMain.handle('clear-cookie', () => {
  if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
  return readCookieSummary();
});

ipcMain.handle('check-gamdl', async () => {
  try {
    const runtime = await getRuntime(loadConfig());
    return { installed: true, version: `gamdl ${runtime.version}`, bundled: runtime.kind === 'bundled' };
  } catch (error) {
    return { installed: false, version: null, error: error.message };
  }
});

ipcMain.handle('check-environment', async (_event, config) => {
  const cfg = config || loadConfig();
  const checks = [];
  try {
    const runtime = await getRuntime(cfg);
    checks.push(`✓ ${runtime.kind === 'bundled' ? '内置独立引擎' : 'Python 开发环境'} gamdl ${runtime.version} 已就绪`);
  } catch (error) {
    checks.push(`✗ ${error.message}`);
  }
  for (const [name, command] of [
    ['FFmpeg (本地转码可选)', cfg.ffmpegPath || 'ffmpeg'],
    ['N_m3u8DL-RE (可选)', cfg.nm3u8dlrePath || 'N_m3u8DL-RE']
  ]) {
    try {
      await capture(command, [name.startsWith('FFmpeg') ? '-version' : '--version']);
      checks.push(`✓ ${name}`);
    } catch {
      checks.push(`— ${name} 未检测到；默认下载模式无需安装`);
    }
  }
  return checks.join('\n');
});

ipcMain.handle('check-studio-environment', async () => {
  const cfg = loadConfig();
  let gamdlInfo = { installed: false, version: null, bundled: false, command: null, error: null };
  try {
    const rt = await getRuntime(cfg);
    gamdlInfo = {
      installed: true,
      version: `v${rt.version}`,
      bundled: rt.kind === 'bundled',
      command: rt.command,
      error: null
    };
  } catch (err) {
    gamdlInfo.error = err.message;
  }

  const checkBin = async (cmd, flag) => {
    try {
      const out = await capture(cmd, [flag], 5000);
      const firstLine = (out.split(/\r?\n/)[0] || '').slice(0, 36);
      return { installed: true, version: firstLine };
    } catch {
      return { installed: false, version: null };
    }
  };

  const [ffmpeg, nm3u8dlre] = await Promise.all([
    checkBin((cfg.ffmpegPath || '').trim() || 'ffmpeg', '-version'),
    checkBin((cfg.nm3u8dlrePath || '').trim() || 'N_m3u8DL-RE', '--version')
  ]);

  return {
    gamdl: gamdlInfo,
    ffmpeg,
    nm3u8dlre,
    cookie: readCookieSummary()
  };
});

ipcMain.handle('check-wrapper', async (_event, config) => {
  try { return { success: true, msg: await checkWrapper(config || loadConfig()) }; }
  catch (error) { return { success: false, msg: error.message }; }
});

// --- Native Electron Sandboxed Apple ID Login (Zero Python / Playwright Required) ---
let cancelLogin = null;
function isApplePage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'apple.com' || url.hostname.endsWith('.apple.com'));
  } catch {
    return false;
  }
}

ipcMain.handle('run-login', () => {
  if (cancelLogin) throw new Error('登录窗口已打开，请在该窗口完成登录或取消');
  return new Promise((resolve, reject) => {
    let loginWindow;
    let poll;
    let timeout;
    let finished = false;
    let checking = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      clearTimeout(timeout);
      cancelLogin = null;
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.destroy();
      if (error) reject(error); else resolve('成功');
    };
    cancelLogin = () => finish(new Error('已取消登录'));
    try {
      loginWindow = new BrowserWindow({
        width: 1000,
        height: 760,
        parent: mainWindow,
        webPreferences: {
          partition: `apple-login-${Date.now()}`,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      });
      loginWindow.setMenuBarVisibility(false);
      loginWindow.on('closed', () => finish(new Error('登录窗口已关闭，未保存凭证')));
      loginWindow.webContents.on('will-navigate', (event, url) => {
        if (!isApplePage(url)) event.preventDefault();
      });
      loginWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isApplePage(url)) loginWindow.loadURL(url).catch(() => {});
        return { action: 'deny' };
      });
      loginWindow.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) send('login-log', '页面加载失败，请检查网络后在登录窗口重试。');
      });
      const browserSession = loginWindow.webContents.session;
      browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      poll = setInterval(async () => {
        if (finished || checking) return;
        checking = true;
        try {
          const cookies = await browserSession.cookies.get({});
          if (finished || !cookies.some(cookie => validToken(cookie))) return;
          fs.mkdirSync(userDataPath, { recursive: true });
          fs.writeFileSync(cookiePath, toNetscape(cookies), { encoding: 'utf8', mode: 0o600 });
          send('login-log', '已成功捕获并保存 media-user-token 登录凭证');
          finish();
        } catch (error) {
          finish(new Error(`保存登录凭证失败：${error.message}`));
        } finally {
          checking = false;
        }
      }, 1000);
      timeout = setTimeout(() => finish(new Error('登录超过 5 分钟，请检查网络后重试')), 5 * 60 * 1000);
      send('login-log', '请在打开的 Apple Music 安全窗口完成登录和双重认证（最多等待 5 分钟）');
      loginWindow.loadURL('https://music.apple.com/login').catch(() => {
        send('login-log', '无法打开 Apple Music，请检查网络或取消后重试。');
      });
    } catch (error) {
      finish(error);
    }
  });
});

ipcMain.handle('cancel-login', () => { if (cancelLogin) cancelLogin(); });

function stopChild(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { shell: false, windowsHide: true });
    killer.on('error', () => child.kill());
  } else {
    child.kill('SIGTERM');
  }
}

app.on('before-quit', () => {
  if (cancelLogin) cancelLogin();
  for (const [id, child] of activeDownloads) {
    cancelledTasks.add(id);
    if (child) stopChild(child);
  }
  if (studioServices) {
    studioServices.queueManager.cancelAll();
  }
});

// --- Legacy v1.3.1 Search & Single Task Handlers (Preserved for Test & Smoke Compatibility) ---
ipcMain.handle('search-music', async (_event, { term, country = 'cn' }) => {
  if (!term || !term.trim()) return [];
  const trimmed = term.trim();
  if (trimmed.includes('music.apple.com')) {
    try {
      const urlObj = new URL(musicUrl(trimmed));
      const parts = urlObj.pathname.split('/').filter(Boolean);
      let detectedType = '直链';
      let title = 'Apple Music 直链项目';
      const storefront = parts[0] || country;
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
        title,
        artist: `链接来源 (${storefront.toUpperCase()})`,
        album: detectedType,
        cover: '',
        url: trimmed,
        previewUrl: '',
        isDirectUrl: true
      }];
    } catch { /* fall through */ }
  }
  return searchCatalog(net.fetch.bind(net), trimmed, country || 'cn');
});

ipcMain.handle('start-download-task', async (_event, task) => {
  if (!task || typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(task.id) || activeDownloads.has(task.id)) {
    return { success: false, msg: '任务 ID 无效或已在运行' };
  }
  activeDownloads.set(task.id, null);
  cancelledTasks.delete(task.id);
  try {
    const config = { ...loadConfig(), ...(task.options || {}) };
    const args = buildDownloadArgs(config, task, cookiePath);
    args.unshift('--temp-path', path.join(userDataPath, 'temp', task.id));
    if (!config.useWrapper && (!fs.existsSync(cookiePath) || !hasValidToken(fs.readFileSync(cookiePath, 'utf8')))) {
      throw new Error('未检测到有效登录凭证，请先登录 Apple Music');
    }
    const runtime = await getRuntime(config);
    if (config.useWrapper) await checkWrapper(config);
    if (cancelledTasks.has(task.id)) return { success: false, msg: '已手动终止' };
    fs.mkdirSync(task.saveDir || config.downloadDir, { recursive: true });
    return await new Promise(resolve => {
      const child = spawn(runtime.command, engineArgs(runtime, args), {
        shell: false,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf8', PYTHONUTF8: '1' }
      });
      activeDownloads.set(task.id, child);
      child.stdin.end();
      let logs = '';
      const onData = data => {
        const text = data.toString('utf8');
        logs = (logs + text).slice(-262144);
        send('download-progress', { id: task.id, text });
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.once('error', error => resolve({ success: false, msg: `启动下载失败：${error.message}` }));
      child.once('close', code => resolve(downloadResult(code, logs, cancelledTasks.has(task.id))));
    });
  } catch (error) {
    return { success: false, msg: error.message };
  } finally {
    activeDownloads.delete(task.id);
    cancelledTasks.delete(task.id);
  }
});

ipcMain.handle('cancel-download', (_event, taskId) => {
  if (!activeDownloads.has(taskId)) return false;
  cancelledTasks.add(taskId);
  const child = activeDownloads.get(taskId);
  if (child) stopChild(child);
  return true;
});

// --- Studio v2.0 Extended Handlers ---
ipcMain.handle('get-top-charts', (_e, country) => ensureStudioServices().catalog.getTopCharts(country || loadConfig().country));
ipcMain.handle('studio-search-music', (_e, params) => ensureStudioServices().catalog.searchMusic(params));
ipcMain.handle('lookup-item', (_e, params) => ensureStudioServices().catalog.lookupItem(params));
ipcMain.handle('parse-apple-url', (_e, { url, country }) => ensureStudioServices().catalog.parseAppleUrl(url, country || loadConfig().country));

ipcMain.handle('get-queue', () => ensureStudioServices().queueManager.getSnapshot());
ipcMain.handle('enqueue-tasks', (_e, { items, overrides }) => ensureStudioServices().queueManager.enqueueTasks(items, overrides));
ipcMain.handle('cancel-task', (_e, taskId) => ensureStudioServices().queueManager.cancelTask(taskId));
ipcMain.handle('cancel-all-tasks', () => ensureStudioServices().queueManager.cancelAll());
ipcMain.handle('retry-task', (_e, taskId) => ensureStudioServices().queueManager.retryTask(taskId));
ipcMain.handle('retry-all-failed', () => ensureStudioServices().queueManager.retryAllFailed());
ipcMain.handle('remove-task', (_e, taskId) => ensureStudioServices().queueManager.removeTask(taskId));
ipcMain.handle('clear-finished-tasks', () => ensureStudioServices().queueManager.clearFinished());
ipcMain.handle('get-task-logs', (_e, taskId) => ensureStudioServices().queueManager.getTaskLogs(taskId));
ipcMain.handle('get-history', () => ensureStudioServices().store.getHistory());
ipcMain.handle('clear-history', () => ensureStudioServices().store.clearHistory());

ipcMain.handle('get-favorites', () => ensureStudioServices().store.getFavorites());
ipcMain.handle('toggle-favorite', (_e, item) => ensureStudioServices().store.toggleFavorite(item));
ipcMain.handle('remove-favorite', (_e, idOrUrl) => ensureStudioServices().store.removeFavorite(idOrUrl));

ipcMain.handle('scan-library', (_e, customDir) => ensureStudioServices().libraryManager.scanLibrary(customDir));
ipcMain.handle('get-local-lyrics', (_e, filePath) => ensureStudioServices().libraryManager.getLyricsForTrack(filePath));
ipcMain.handle('inspect-media-tags', (_e, filePath) => ensureStudioServices().libraryManager.inspectMediaTags(filePath));
ipcMain.handle('convert-audio', (_e, params) => ensureStudioServices().libraryManager.convertAudio(params));
ipcMain.handle('delete-local-file', (_e, filePath) => ensureStudioServices().libraryManager.deleteLocalFile(filePath));
