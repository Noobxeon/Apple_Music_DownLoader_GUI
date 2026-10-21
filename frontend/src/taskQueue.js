// The queue owns concurrency; the view receives immutable patches by task ID.
class TaskQueue {
  constructor({ run, cancel, update, concurrency = 2 }) {
    this.run = run;
    this.cancelProcess = cancel;
    this.update = update;
    this.concurrency = concurrency;
    this.entries = new Map();
    this.pending = [];
    this.running = 0;
  }

  add(task) {
    if (this.entries.has(task.id)) return false;
    this.entries.set(task.id, { task, state: 'queued', cancelled: false });
    this.pending.push(task.id);
    this.update(task.id, { status: 'queued', msg: '等待下载', percent: 0 });
    this.drain();
    return true;
  }

  async cancel(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.cancelled = true;
    if (entry.state === 'queued') {
      this.entries.delete(id);
      this.pending = this.pending.filter(key => key !== id);
      this.update(id, { status: 'cancelled', msg: '已取消' });
    } else {
      this.update(id, { status: 'cancelling', msg: '正在取消…' });
      try { await this.cancelProcess(id); } catch { /* Running IPC still determines completion. */ }
    }
  }

  drain() {
    while (this.running < this.concurrency && this.pending.length) {
      const id = this.pending.shift();
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.state = 'running';
      this.running += 1;
      this.update(id, { status: 'downloading', msg: '正在解析音乐…' });
      Promise.resolve().then(() => entry.cancelled ? { success: false, msg: '已取消' } : this.run(entry.task)).then(result => {
        entry.result = { status: result.success ? 'success' : 'error', msg: result.msg,
          ...(result.success ? { percent: 100 } : {}) };
      }).catch(error => {
        entry.result = { status: 'error', msg: error.message || '下载中断，请重试' };
      }).finally(() => {
        this.entries.delete(id);
        this.running -= 1;
        this.update(id, entry.cancelled ? { status: 'cancelled', msg: '已取消' } : entry.result);
        this.drain();
      });
    }
  }
}

module.exports = { TaskQueue };
