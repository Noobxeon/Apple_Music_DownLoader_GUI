const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { PythonShell } = require('python-shell');
const { spawn } = require('child_process');

let mainWindow;
const configPath = path.join(__dirname, 'config.json');
const cookiePath = path.join(__dirname, 'cookies.txt');

// 保存正在运行的下载进程，方便随时击杀
const activeDownloads = new Map();

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1250, height: 850,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL('http://localhost:8080'); 
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// --- 基础配置与登录 ---
ipcMain.handle('get-config', () => {
  try { return fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : { downloadDir: '' }; } catch(e) { return { downloadDir: '' }; }
});
ipcMain.handle('set-config', (e, config) => fs.writeFileSync(configPath, JSON.stringify(config)));
ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return !canceled ? filePaths[0] : null;
});
ipcMain.handle('open-folder', (e, p) => p && shell.openPath(p));
ipcMain.handle('check-cookie', () => {
  try { return { valid: fs.existsSync(cookiePath) && fs.readFileSync(cookiePath, 'utf8').includes('media-user-token') }; } catch(e) { return { valid: false }; }
});
ipcMain.handle('run-login', async () => {
  return new Promise((resolve, reject) => {
    const scriptDir = path.join(__dirname, 'backend');
    const options = { mode: 'text', pythonOptions: ['-u'], scriptPath: scriptDir, cwd: scriptDir };
    PythonShell.run('cookie_helper.py', options).then(() => {
      const p1 = path.join(scriptDir, 'cookies.txt');
      if (fs.existsSync(p1)) fs.copyFileSync(p1, cookiePath);
      resolve('成功');
    }).catch(reject);
  });
});

// --- 搜索功能 (✅ 找回的双引擎精确搜索！) ---
ipcMain.handle('search-music', async (event, term) => {
  try {
    const encodedTerm = encodeURIComponent(term);
    
    // 强制分离搜歌曲和搜专辑，避免混入电台播客
    const [songRes, albumRes] = await Promise.all([
      net.fetch(`https://itunes.apple.com/search?term=${encodedTerm}&country=cn&entity=song&limit=200`),
      net.fetch(`https://itunes.apple.com/search?term=${encodedTerm}&country=cn&entity=album&limit=200`)
    ]);

    const songData = await songRes.json();
    const albumData = await albumRes.json();
    
    const combined = [...(songData.results || []), ...(albumData.results || [])];

    return combined.map(item => ({
      id: item.trackId || item.collectionId,
      type: item.wrapperType === 'track' ? '歌曲' : '专辑',
      title: item.trackName || item.collectionName,
      artist: item.artistName,
      album: item.collectionName,
      cover: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '400x400bb') : '',
      url: item.trackViewUrl || item.collectionViewUrl,
      previewUrl: item.previewUrl || ''
    }));
  } catch (e) { throw e; }
});

// --- 下载管理与进程终止 ---
ipcMain.handle('start-download-task', async (event, task) => {
  try {
    if (!fs.existsSync(cookiePath)) return { success: false, msg: '无凭证' };
    const command = `gamdl "${task.url}" --cookies-path "${cookiePath}" --output-path "${task.saveDir}" --album-folder-template "{album_artist}/{album}"`;
    
    return new Promise((resolve) => {
      const child = spawn(command, { shell: true, env: { ...process.env, PYTHONIOENCODING: 'utf8' } });
      
      activeDownloads.set(task.id, child);

      let logs = '';
      child.stdout.on('data', d => { 
        logs += d.toString();
        if(mainWindow) mainWindow.webContents.send('download-progress', { id: task.id, text: d.toString() }); 
      });
      child.stderr.on('data', d => { logs += d.toString(); });
      
      child.on('close', (code) => {
        activeDownloads.delete(task.id); 
        if (task.isCanceled) { resolve({ success: false, msg: '已手动终止' }); return; }
        const ok = code === 0 || logs.toLowerCase().includes('downloaded') || logs.toLowerCase().includes('exists');
        resolve({ success: ok, msg: ok ? '成功' : '下载失败' });
      });
    });
  } catch (e) { return { success: false, msg: '启动失败' }; }
});

ipcMain.handle('cancel-download', (event, taskId) => {
  const child = activeDownloads.get(taskId);
  if (child) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
    } else {
      child.kill('SIGKILL');
    }
    activeDownloads.delete(taskId);
    return true;
  }
  return false;
});