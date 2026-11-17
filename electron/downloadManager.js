const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { engineArgs, buildDownloadArgs, checkWrapper, downloadResult } = require('../backend/engine');
const { hasValidToken } = require('../backend/cookies');

class DownloadQueueManager {
  constructor({ store, getRuntime, userDataPath, onUpdate, onTaskLog, onBatchComplete }) {
    this.store = store;
    this.getRuntime = getRuntime;
    this.userDataPath = userDataPath;
    this.onUpdate = onUpdate || (() => {});
    this.onTaskLog = onTaskLog || (() => {});
    this.onBatchComplete = onBatchComplete || (() => {});

    this.tasks = [];
    this.activeProcesses = new Map();
    this.cancelledIds = new Set();
    this._emitTimer = null;
  }

  getSnapshot() {
    return this.tasks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      cover: t.cover,
      type: t.type,
      url: t.url,
      saveDir: t.saveDir,
      codec: t.codec,
      status: t.status,
      percent: t.percent,
      progText: t.progText,
      albumProgress: t.albumProgress,
      currentTrack: t.currentTrack,
      speed: t.speed,
      msg: t.msg,
      createdAt: t.createdAt,
      completedAt: t.completedAt
    }));
  }

  getTaskLogs(taskId) {
    const t = this.tasks.find(x => x.id === taskId);
    return t ? t.logs : [];
  }

  _emitNow() {
    if (this._emitTimer) {
      clearTimeout(this._emitTimer);
      this._emitTimer = null;
    }
    this.onUpdate(this.getSnapshot());
  }

  _emitThrottled() {
    if (this._emitTimer) return;
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null;
      this.onUpdate(this.getSnapshot());
    }, 140);
  }

  enqueueTasks(items, overrides = {}) {
    const list = Array.isArray(items) ? items : [items];
    const cfg = this.store.getConfig();
    const saveDir = overrides.saveDir || cfg.downloadDir;
    const added = [];

    for (const item of list) {
      if (!item || !item.url) continue;
      const existingActive = this.tasks.find(
        t => t.url === item.url && (t.status === 'queued' || t.status === 'downloading')
      );
      if (existingActive) continue;

      const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const task = {
        id,
        title: item.title || '未命名音乐任务',
        artist: item.artist || '',
        album: item.album || '',
        cover: item.cover || '',
        type: item.type || '歌曲',
        url: item.url.trim(),
        saveDir,
        codec: overrides.codec || cfg.songCodec || 'aac-web',
        lyricsOnly: Boolean(overrides.lyricsOnly || cfg.syncedLyricsOnly),
        status: 'queued',
        percent: 0,
        progText: '排队等待中...',
        albumProgress: '',
        currentTrack: '',
        speed: '',
        msg: '',
        logs: [],
        createdAt: Date.now(),
        completedAt: null
      };
      this.tasks.unshift(task);
      added.push(task);
    }

    this._emitNow();
    this._pumpQueue();
    return added.map(t => t.id);
  }

  async _pumpQueue() {
    const cfg = this.store.getConfig();
    const maxConcurrent = Math.max(1, Math.min(5, Number(cfg.maxConcurrent) || 2));

    while (this.activeProcesses.size < maxConcurrent) {
      const nextTask = [...this.tasks].reverse().find(t => t.status === 'queued');
      if (!nextTask) break;
      this.activeProcesses.set(nextTask.id, null);
      this._runTask(nextTask).catch(err => {
        console.error('Unexpected task runner error:', err);
      });
    }
  }

  _appendLog(task, line) {
    task.logs.push(line);
    if (task.logs.length > 180) task.logs.shift();
    this.onTaskLog({ id: task.id, line });
  }

  _parseOutputChunk(task, rawChunk) {
    // eslint-disable-next-line no-control-regex
    const clean = rawChunk.replace(/\x1B\[[0-9;]*[mK]/g, '');
    const lines = clean.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);

    for (const line of lines) {
      this._appendLog(task, line);

      const trackMatch = line.match(/Track\s*(\d+)\s*\/\s*(\d+)/i);
      if (trackMatch) {
        const curr = parseInt(trackMatch[1], 10);
        const total = parseInt(trackMatch[2], 10);
        if (total > 0 && curr > 0) {
          task.albumProgress = `${Math.min(curr, total)}/${total}`;
          if (total > 1) {
            task.percent = Math.round(((curr - 1) / total) * 100);
          }
        }
      }

      const dlTitleMatch = line.match(/Downloading\s+"([^"]+)"/i);
      if (dlTitleMatch) {
        task.currentTrack = dlTitleMatch[1];
        const prefix = task.albumProgress ? `[${task.albumProgress}] ` : '';
        task.progText = `${prefix}正在下载: ${task.currentTrack}`;
      }

      const speedMatch = line.match(/at\s+([\d.]+\s*[KMG]i?B\/s)/i);
      if (speedMatch) {
        task.speed = speedMatch[1];
      }

      const pctMatch = line.match(/(\d+(?:\.\d+)?)%/);
      if (pctMatch) {
        const filePct = Math.min(100, parseFloat(pctMatch[1]));
        if (task.albumProgress) {
          const [cStr, tStr] = task.albumProgress.split('/');
          const c = parseInt(cStr, 10) || 1;
          const tot = parseInt(tStr, 10) || 1;
          task.percent = Math.min(99, Math.round((((c - 1) + filePct / 100) / tot) * 100));
          task.progText = `[${task.albumProgress}] ${task.currentTrack || ''} ${filePct.toFixed(1)}%`.trim();
        } else {
          task.percent = Math.round(filePct);
          task.progText = `${filePct.toFixed(1)}%${task.speed ? ' · ' + task.speed : ''}`;
        }
      } else if (/skipping.*(?:exists|mediafileexistserror)/i.test(line)) {
        task.progText = `${task.albumProgress ? `[${task.albumProgress}] ` : ''}已存在，自动跳过`;
      }
    }

    this._emitThrottled();
  }

  async _runTask(task) {
    this.cancelledIds.delete(task.id);
    const cfg = { ...this.store.getConfig() };
    if (cfg.useArchiveDb) {
      cfg.databasePath = this.store.archiveDbPath;
    }

    try {
      const args = buildDownloadArgs(cfg, task, this.store.cookiePath);
      args.unshift('--temp-path', path.join(this.userDataPath, 'temp', task.id));

      if (!cfg.useWrapper) {
        const cookieExists = fs.existsSync(this.store.cookiePath);
        const cookieValid = cookieExists && hasValidToken(fs.readFileSync(this.store.cookiePath, 'utf8'));
        if (!cookieValid) {
          throw new Error('未检测到有效登录凭证，请先登录或导入 Cookie');
        }
      }

      const runtime = await this.getRuntime(cfg);
      if (cfg.useWrapper) await checkWrapper(cfg);

      if (this.cancelledIds.has(task.id)) {
        this.activeProcesses.delete(task.id);
        this.cancelledIds.delete(task.id);
        task.status = 'cancelled';
        task.msg = '已手动取消';
        task.progText = '已取消';
        this._emitNow();
        this._pumpQueue();
        return;
      }

      fs.mkdirSync(task.saveDir || cfg.downloadDir, { recursive: true });

      task.status = 'downloading';
      task.percent = 2;
      task.progText = '正在连接 Apple Music 解析流媒体...';
      task.msg = '';
      this._emitNow();

      const fullArgs = engineArgs(runtime, args);
      this._appendLog(task, `$ ${runtime.command} ${fullArgs.join(' ')}`);

      await new Promise((resolve) => {
        const child = spawn(runtime.command, fullArgs, {
          shell: false,
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf8', PYTHONUTF8: '1' }
        });

        this.activeProcesses.set(task.id, child);
        if (child.stdin) child.stdin.end();

        let logs = '';
        const onData = (buf) => {
          const text = buf.toString('utf8');
          logs = (logs + text).slice(-262144);
          this._parseOutputChunk(task, text);
        };

        child.stdout.on('data', onData);
        child.stderr.on('data', onData);

        child.once('error', (err) => {
          this.activeProcesses.delete(task.id);
          task.status = 'failed';
          task.msg = `启动下载失败：${err.message}`;
          task.progText = task.msg;
          this._finishTaskRecord(task);
          resolve();
        });

        child.once('close', (code) => {
          this.activeProcesses.delete(task.id);
          const wasCancelled = this.cancelledIds.has(task.id);
          this.cancelledIds.delete(task.id);

          const res = downloadResult(code, logs, wasCancelled);
          if (wasCancelled) {
            task.status = 'cancelled';
            task.msg = '已手动终止';
            task.progText = '已取消';
            this._emitNow();
            resolve();
            return;
          }

          if (res.success) {
            task.status = 'completed';
            task.percent = 100;
            task.msg = '已完成';
            task.progText = task.albumProgress ? `全部完成 (${task.albumProgress})` : '100% · 下载完成';
          } else {
            task.status = 'failed';
            task.msg = res.msg;
            task.progText = res.msg;
          }

          this._finishTaskRecord(task);
          resolve();
        });
      });
    } catch (err) {
      this.activeProcesses.delete(task.id);
      task.status = 'failed';
      task.msg = err.message || '下载预检失败';
      task.progText = task.msg;
      this._finishTaskRecord(task);
    }

    this._pumpQueue();

    const anyRemaining = this.tasks.some(t => t.status === 'queued' || t.status === 'downloading');
    if (!anyRemaining && this.activeProcesses.size === 0) {
      this.onBatchComplete();
    }
  }

  _finishTaskRecord(task) {
    task.completedAt = Date.now();
    this.store.addHistoryEntry(task);
    this._emitNow();
  }

  _stopChild(child) {
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { shell: false, windowsHide: true });
      killer.on('error', () => child.kill());
    } else {
      child.kill('SIGTERM');
    }
  }

  cancelTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return false;

    if (task.status === 'queued') {
      task.status = 'cancelled';
      task.msg = '已从队列取消';
      task.progText = '已取消';
      this._emitNow();
      return true;
    }

    if (task.status === 'downloading' || this.activeProcesses.has(taskId)) {
      this.cancelledIds.add(taskId);
      const child = this.activeProcesses.get(taskId);
      if (child) this._stopChild(child);
      task.status = 'cancelled';
      task.msg = '已手动终止';
      task.progText = '已取消';
      this._emitNow();
      return true;
    }

    return false;
  }

  cancelAll() {
    for (const t of this.tasks) {
      if (t.status === 'queued' || t.status === 'downloading') {
        this.cancelTask(t.id);
      }
    }
    return true;
  }

  retryTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task || task.status === 'downloading' || task.status === 'queued') return false;
    task.status = 'queued';
    task.percent = 0;
    task.albumProgress = '';
    task.currentTrack = '';
    task.speed = '';
    task.msg = '';
    task.progText = '等待重新下载...';
    task.logs = [];
    this._emitNow();
    this._pumpQueue();
    return true;
  }

  retryAllFailed() {
    let count = 0;
    for (const t of this.tasks) {
      if (t.status === 'failed' || t.status === 'cancelled') {
        t.status = 'queued';
        t.percent = 0;
        t.msg = '';
        t.progText = '等待重新下载...';
        t.logs = [];
        count++;
      }
    }
    if (count > 0) {
      this._emitNow();
      this._pumpQueue();
    }
    return count;
  }

  removeTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task && (task.status === 'downloading' || task.status === 'queued')) {
      this.cancelTask(taskId);
    }
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this._emitNow();
    return true;
  }

  clearFinished() {
    this.tasks = this.tasks.filter(t => t.status === 'downloading' || t.status === 'queued');
    this._emitNow();
    return true;
  }
}

module.exports = { DownloadQueueManager };
