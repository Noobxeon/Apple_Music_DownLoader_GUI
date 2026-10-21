const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const realEngine = require('../backend/engine');

function harness(overrides = {}) {
  const handlers = new Map();
  const windows = [];
  const files = new Map();
  const timeouts = new Map();
  const intervals = new Map();
  const children = [];
  const app = new EventEmitter();
  app.getPath = () => '/test-data';
  app.whenReady = () => ({ then() {} });
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.session = {
        cookies: { get: async () => overrides.cookies || [] },
        setPermissionRequestHandler() {}
      };
      windows.push(this);
    }
    setMenuBarVisibility() {}
    loadURL() { return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  function spawn(command, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.pid = 123; child.kill = () => {};
    children.push({ child, command, args, options });
    return child;
  }
  const modules = {
    electron: { app, BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, dialog: {}, shell: {}, net: {} },
    fs: { existsSync: name => files.has(name), readFileSync: name => files.get(name),
      writeFileSync: (name, value) => { if (overrides.writeError) throw new Error('read-only'); files.set(name, value); }, mkdirSync() {} },
    path, child_process: { spawn },
    './backend/engine': { ...realEngine, engineRuntime: overrides.engineRuntime || (async () => ({ command: 'python.exe', prefix: [], version: '3.9.1' })) },
    './backend/cookies': require('../backend/cookies'),
    './backend/search': require('../backend/search')
  };
  const context = { require: name => { if (!(name in modules)) throw new Error(name); return modules[name]; },
    __dirname: '/app', console, process: { platform: 'win32', env: {} },
    setInterval: fn => { intervals.set(fn, fn); return fn; }, clearInterval: id => intervals.delete(id),
    setTimeout: (fn, ms) => { timeouts.set(fn, ms); return fn; }, clearTimeout: id => timeouts.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'), context);
  return { handlers, windows, files, timeouts, intervals, children };
}

test('native login needs no Python, exports cookies and cleans timers', async () => {
  const h = harness({ cookies: [{ domain: '.music.apple.com', name: 'media-user-token', value: 'test-only', secure: true }] });
  const login = h.handlers.get('run-login')();
  assert.equal(h.windows[0].options.webPreferences.nodeIntegration, false);
  assert.equal(h.windows[0].options.webPreferences.sandbox, true);
  await [...h.intervals.values()][0]();
  assert.equal(await login, '成功');
  assert.equal(h.files.size, 1);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.timeouts.size, 0);
  assert.ok(h.windows[0].destroyed);
});
test('login cancel, timeout and manual window close settle and permit retry', async () => {
  for (const action of ['cancel', 'timeout', 'close']) {
    const h = harness();
    const login = h.handlers.get('run-login')();
    const rejected = assert.rejects(login, /取消|超过|关闭/);
    assert.throws(() => h.handlers.get('run-login')(), /已打开/);
    if (action === 'cancel') h.handlers.get('cancel-login')();
    if (action === 'timeout') [...h.timeouts.keys()][0]();
    if (action === 'close') h.windows[0].destroy();
    await rejected;
    assert.equal(h.timeouts.size + h.intervals.size, 0);
    const retry = h.handlers.get('run-login')();
    const retryRejected = assert.rejects(retry, /取消/);
    h.handlers.get('cancel-login')();
    await retryRejected;
  }
});
test('cookie write error settles login rather than leaving processing state', async () => {
  const h = harness({ writeError: true, cookies: [{ domain: '.music.apple.com', name: 'media-user-token', value: 'test' }] });
  const login = h.handlers.get('run-login')();
  const rejected = assert.rejects(login, /保存登录凭证失败/);
  await [...h.intervals.values()][0]();
  await rejected;
  assert.equal(h.intervals.size, 0);
});
test('cancellation during engine preflight prevents spawning and duplicate task IDs', async () => {
  let release;
  const h = harness({ engineRuntime: () => new Promise(resolve => { release = resolve; }) });
  h.files.set(path.join('/test-data', 'cookies.txt'), '.music.apple.com\tTRUE\t/\tTRUE\t0\tmedia-user-token\ttest\n');
  const task = { id: 'one', url: 'https://music.apple.com/cn/song/a/123', saveDir: '/downloads' };
  const result = h.handlers.get('start-download-task')(null, task);
  assert.equal((await h.handlers.get('start-download-task')(null, task)).success, false);
  assert.equal(h.handlers.get('cancel-download')(null, 'one'), true);
  release({ command: 'python.exe', prefix: [] });
  assert.equal((await result).msg, '已手动终止');
  assert.equal(h.children.length, 0);
});
test('download process never uses shell and nonzero error summary fails', async () => {
  const h = harness();
  h.files.set(path.join('/test-data', 'cookies.txt'), '.music.apple.com\tTRUE\t/\tTRUE\t0\tmedia-user-token\ttest\n');
  const result = h.handlers.get('start-download-task')(null, { id: 'one', url: 'https://music.apple.com/cn/song/a/123?l=en&x=y', saveDir: '/downloads' });
  await new Promise(resolve => setImmediate(resolve));
  const { child, command, args, options } = h.children[0];
  assert.equal(options.shell, false);
  assert.equal(command, 'python.exe');
  assert.ok(args.includes('-m') && args.includes('gamdl'));
  assert.equal(child.stdin.writableEnded, true);
  child.stdout.write('Downloaded\nFinished with 3 error(s)');
  child.emit('close', 0);
  assert.equal((await result).success, false);
});
