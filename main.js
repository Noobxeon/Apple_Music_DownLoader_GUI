const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { engineRuntime, engineArgs, capture, musicUrl, checkWrapper, buildDownloadArgs, downloadResult } = require('./backend/engine');
const { validToken, toNetscape, hasValidToken } = require('./backend/cookies');
const { searchCatalog } = require('./backend/search');

const diagnosticsMode = (process.argv || []).includes('--diagnostics');
if (diagnosticsMode) {
  if (app.disableHardwareAcceleration) app.disableHardwareAcceleration();
  if (app.commandLine?.appendSwitch) app.commandLine.appendSwitch('disable-gpu');
}

let mainWindow;
function runtimeOptions() {
  return app.isPackaged ? { packaged: true, resourcesPath: process.resourcesPath } :
    { enginePath: path.join(__dirname, 'vendor', 'gamdl-engine', 'gamdl-engine.exe') };
}
const getRuntime = config => engineRuntime(config, runtimeOptions());
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
  wvdPath: '',
  pythonPath: '',
  useWrapper: false,
  wrapperUrl: 'http://127.0.0.1',
  wrapperDecryptHost: '127.0.0.1',
  wrapperDecryptPort: 10020
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

// 保存正在运行的下载进程与已取消的任务ID集合
const activeDownloads = new Map();
const cancelledTasks = new Set();

function createWindow () {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'build', 'icon.ico'),
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
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

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  } else {
    if (process.env.MUSIC_DEV_URL === 'http://localhost:8080') mainWindow.loadURL(process.env.MUSIC_DEV_URL);
    else mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }
}

app.whenReady().then(async () => {
  if (!diagnosticsMode) return createWindow();
  try {
    const runtime = await getRuntime(loadConfig());
    const version = await capture(runtime.command, engineArgs(runtime, ['--version']));
    console.log(JSON.stringify({ success: true, appVersion: app.getVersion(), engineVersion: runtime.version,
      bundled: runtime.kind === 'bundled', executable: runtime.command, cli: version }));
    app.exit(0);
  } catch (error) { console.error(JSON.stringify({ success: false, error: error.message })); app.exit(1); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// --- 基础配置与凭证 ---
ipcMain.handle('get-app-info', () => ({ version: app.getVersion(), packaged: app.isPackaged, platform: process.platform }));
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

ipcMain.handle('open-folder', async (_event, folder) => {
  if (!folder) return { error: '请先选择保存目录' };
  if (folder === loadConfig().downloadDir) fs.mkdirSync(folder, { recursive: true });
  if (!fs.existsSync(folder)) return { error: '此目录不存在，请在设置中重新选择' };
  const error = await shell.openPath(folder);
  return error ? { error } : { success: true };
});

ipcMain.handle('check-cookie', () => {
  try {
    const exists = fs.existsSync(cookiePath);
    if (!exists) return { valid: false, path: cookiePath };
    const content = fs.readFileSync(cookiePath, 'utf8');
    const hasToken = hasValidToken(content);
    return { valid: hasToken, path: cookiePath };
  } catch(e) {
    return { valid: false, path: cookiePath, error: e.message };
  }
});

// Python is needed only by the download engine; login uses Electron's own browser.
ipcMain.handle('check-gamdl', async () => {
  try {
    const runtime = await getRuntime(loadConfig());
    return { installed: true, version: `gamdl ${runtime.version}`, bundled: runtime.kind === 'bundled' };
  } catch (error) { return { installed: false, version: null, error: error.message }; }
});
ipcMain.handle('check-environment', async (_event, config) => {
  const checks = [];
  try {
    const runtime = await getRuntime(config);
    checks.push(`✓ ${runtime.kind === 'bundled' ? '内置' : '开发环境'} gamdl ${runtime.version} 已就绪`);
  } catch (error) { checks.push(`✗ ${error.message}`); }
  for (const [name, command] of [['FFmpeg (可选)', config.ffmpegPath || 'ffmpeg'],
    ['N_m3u8DL-RE (可选)', config.nm3u8dlrePath || 'N_m3u8DL-RE']]) {
    try { await capture(command, [name.startsWith('FFmpeg') ? '-version' : '--version']); checks.push(`✓ ${name}`); }
    catch { checks.push(`— ${name} 未检测到；默认下载模式无需安装`); }
  }
  return checks.join('\n');
});
ipcMain.handle('check-wrapper', async (_event, config) => {
  try { return { success: true, msg: await checkWrapper(config) }; }
  catch (error) { return { success: false, msg: error.message }; }
});

let cancelLogin = null;
function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
}
function isApplePage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'apple.com' || url.hostname.endsWith('.apple.com')); }
  catch { return false; }
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
      loginWindow = new BrowserWindow({ width: 1000, height: 760, parent: mainWindow,
        webPreferences: { partition: `apple-login-${Date.now()}`, nodeIntegration: false,
          contextIsolation: true, sandbox: true } });
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
          send('login-log', '已保存登录凭证');
          finish();
        } catch (error) { finish(new Error(`保存登录凭证失败：${error.message}`)); }
        finally { checking = false; }
      }, 1000);
      timeout = setTimeout(() => finish(new Error('登录超过 5 分钟，请检查网络后重试')), 5 * 60 * 1000);
      send('login-log', '请在打开的 Apple Music 窗口完成登录和双重认证（最多等待 5 分钟）');
      loginWindow.loadURL('https://music.apple.com/login').catch(() => {
        send('login-log', '无法打开 Apple Music，请检查网络或取消后重试。');
      });
    } catch (error) { finish(error); }
  });
});
ipcMain.handle('cancel-login', () => { if (cancelLogin) cancelLogin(); });
app.on('before-quit', () => {
  if (cancelLogin) cancelLogin();
  for (const [id, child] of activeDownloads) { cancelledTasks.add(id); if (child) stopChild(child); }
});

// --- 音乐搜索 (支持多地区 Storefront 与直链识别) ---
ipcMain.handle('search-music', async (event, { term, country = 'cn' }) => {
  try {
    if (!term || !term.trim()) return [];
    const trimmed = term.trim();

    // 1. 如果用户输入的是直接的 Apple Music 链接
    if (trimmed.includes('music.apple.com')) {
      try {
        const urlObj = new URL(musicUrl(trimmed));
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

    return await searchCatalog(net.fetch.bind(net), trimmed, country || 'cn');
  } catch (e) {
    console.error('search-music error:', e);
    throw e;
  }
});

// --- Download lifecycle ---
function stopChild(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { shell: false, windowsHide: true });
    killer.on('error', () => child.kill());
  } else child.kill('SIGTERM');
}

ipcMain.handle('start-download-task', async (_event, task) => {
  if (!task || typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(task.id) || activeDownloads.has(task.id)) return { success: false, msg: '任务 ID 无效或已在运行' };
  // Reserve before asynchronous preflight so cancellation also works during checks.
  activeDownloads.set(task.id, null);
  cancelledTasks.delete(task.id);
  try {
    const config = { ...loadConfig(), ...(task.options || {}) };
    const args = buildDownloadArgs(config, task, cookiePath);
    // All mutable engine state stays in userData, never Program Files.
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
        shell: false, windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf8', PYTHONUTF8: '1' }
      });
      activeDownloads.set(task.id, child);
      // Never leave invisible CLI credential/selection prompts waiting for input.
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
