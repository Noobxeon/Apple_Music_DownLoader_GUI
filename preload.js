const { contextBridge, ipcRenderer } = require('electron');

const legacyChannels = new Set([
  'get-app-info',
  'get-config',
  'set-config',
  'select-folder',
  'select-file',
  'open-folder',
  'check-cookie',
  'check-gamdl',
  'check-environment',
  'check-wrapper',
  'run-login',
  'cancel-login',
  'search-music',
  'start-download-task',
  'cancel-download'
]);

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Preserve v1.3.1 musicAPI bridge for backward compatibility & smoke harnesses
contextBridge.exposeInMainWorld('musicAPI', {
  invoke(channel, ...args) {
    if (!legacyChannels.has(channel)) throw new Error('不允许的操作');
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, callback) {
    if (!['download-progress', 'login-log'].includes(channel)) throw new Error('不允许的事件');
    const listener = (_event, data) => callback(null, data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});

// Expose full Studio v2.0 typed API bridge
contextBridge.exposeInMainWorld('appleMusic', {
  minimizeWindow: () => ipcRenderer.invoke('win-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('win-maximize'),
  closeWindow: () => ipcRenderer.invoke('win-close'),
  isWindowMaximized: () => ipcRenderer.invoke('win-is-maximized'),
  onWindowMaximized: (cb) => subscribe('win-maximized-changed', cb),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (partial) => ipcRenderer.invoke('set-config', partial),
  resetConfig: () => ipcRenderer.invoke('reset-config'),

  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  openFolder: (dirPath) => ipcRenderer.invoke('open-folder', dirPath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  checkEnvironment: (forceRefresh = false) => ipcRenderer.invoke('check-studio-environment', forceRefresh),
  checkWrapper: (cfg) => ipcRenderer.invoke('check-wrapper', cfg),
  checkCookie: () => ipcRenderer.invoke('check-cookie'),
  runBrowserLogin: () => ipcRenderer.invoke('run-login'),
  cancelLogin: () => ipcRenderer.invoke('cancel-login'),
  importCookieFile: (filePath) => ipcRenderer.invoke('import-cookie-file', filePath),
  saveCookieContent: (rawText) => ipcRenderer.invoke('save-cookie-content', rawText),
  exportCookieFile: (destPath) => ipcRenderer.invoke('export-cookie-file', destPath),
  clearCookie: () => ipcRenderer.invoke('clear-cookie'),
  onLoginLog: (cb) => subscribe('login-log', cb),

  getTopCharts: (country) => ipcRenderer.invoke('get-top-charts', country),
  searchMusic: (params) => ipcRenderer.invoke('studio-search-music', params),
  lookupItem: (params) => ipcRenderer.invoke('lookup-item', params),
  parseAppleUrl: (params) => ipcRenderer.invoke('parse-apple-url', params),

  getQueue: () => ipcRenderer.invoke('get-queue'),
  enqueueTasks: (payload) => ipcRenderer.invoke('enqueue-tasks', payload),
  cancelTask: (taskId) => ipcRenderer.invoke('cancel-task', taskId),
  cancelAllTasks: () => ipcRenderer.invoke('cancel-all-tasks'),
  retryTask: (taskId) => ipcRenderer.invoke('retry-task', taskId),
  retryAllFailed: () => ipcRenderer.invoke('retry-all-failed'),
  removeTask: (taskId) => ipcRenderer.invoke('remove-task', taskId),
  clearFinishedTasks: () => ipcRenderer.invoke('clear-finished-tasks'),
  getTaskLogs: (taskId) => ipcRenderer.invoke('get-task-logs', taskId),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  onQueueUpdate: (cb) => subscribe('queue-updated', cb),
  onTaskLog: (cb) => subscribe('task-log', cb),

  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  toggleFavorite: (item) => ipcRenderer.invoke('toggle-favorite', item),
  removeFavorite: (idOrUrl) => ipcRenderer.invoke('remove-favorite', idOrUrl),

  scanLibrary: (customDir) => ipcRenderer.invoke('scan-library', customDir),
  getLocalLyrics: (filePath) => ipcRenderer.invoke('get-local-lyrics', filePath),
  inspectMediaTags: (filePath) => ipcRenderer.invoke('inspect-media-tags', filePath),
  convertAudio: (params) => ipcRenderer.invoke('convert-audio', params),
  deleteLocalFile: (filePath) => ipcRenderer.invoke('delete-local-file', filePath)
});
