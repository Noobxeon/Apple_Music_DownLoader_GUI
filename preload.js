const { contextBridge, ipcRenderer } = require('electron');
const channels = new Set(['get-app-info', 'get-config', 'set-config', 'select-folder', 'select-file', 'open-folder',
  'check-cookie', 'check-gamdl', 'check-environment', 'check-wrapper', 'run-login', 'cancel-login',
  'search-music', 'start-download-task', 'cancel-download']);
contextBridge.exposeInMainWorld('musicAPI', {
  invoke(channel, ...args) {
    if (!channels.has(channel)) throw new Error('不允许的操作');
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, callback) {
    if (!['download-progress', 'login-log'].includes(channel)) throw new Error('不允许的事件');
    const listener = (_event, data) => callback(null, data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
