const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
const smokeArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--') && !arg.endsWith('smoke-ui.cjs'));
const root = path.resolve(smokeArgs[0] || path.join(__dirname, '..'));
const targetDir = path.resolve(smokeArgs[1] || path.join(__dirname, '../.build/ui-smoke'));
fs.mkdirSync(targetDir, { recursive: true });
app.setPath('userData', path.join(targetDir, 'profile'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
fs.writeFileSync(path.join(app.getPath('userData'), 'config.json'), JSON.stringify({ songCodec: 'aac-web', useWrapper: false }));
app.getVersion = () => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
process.env.PATH = '';
process.env.PYTHONHOME = 'Z:/no-system-python';
process.env.PYTHONPATH = '';
const packaged = root.endsWith('.asar');
if (packaged) process.resourcesPath = path.dirname(root);
const report = { root, tests: [], warnings: [] };
const pending = new Map();
let started = 0;
let settled = false;
let primary;
const timeout = setTimeout(() => finish(new Error('UI smoke timed out')), 110000);
function finish(error) {
  if (settled) return; settled = true; clearTimeout(timeout);
  if (error) report.error = error.stack || String(error);
  fs.writeFileSync(path.join(targetDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.exit(error ? 1 : 0);
}
async function evaluate(js) { return primary.webContents.executeJavaScript(`(async()=>{${js}})()`); }
async function snapshot(name) {
  await new Promise(resolve => setTimeout(resolve, 180));
  await primary.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(targetDir, name + '.png'), (await primary.webContents.capturePage()).toPNG());
}
const sleepCode = 'await new Promise(r=>setTimeout(r,100));';
function replaceHandler(name, handler) { ipcMain.removeHandler(name); ipcMain.handle(name, handler); }
app.on('browser-window-created', (_event, win) => {
  if (primary) return;
  primary = win;
  primary.webContents.setBackgroundThrottling(false);
  primary.webContents.on('render-process-gone', (_event, details) => finish(new Error('Renderer exited: ' + details.reason)));
  primary.webContents.once('did-finish-load', async () => {
    try {
      assert.equal(await evaluate(`return typeof window.musicAPI === 'object' && typeof window.require === 'undefined';`), true);
      const engine = await evaluate(`return await window.musicAPI.invoke('check-gamdl');`);
      assert.equal(engine.installed, true); assert.equal(engine.bundled, true);
      report.tests.push('packaged engine ready with no system Python; isolated preload');
      await evaluate(`for(let i=0;i<150&&!document.querySelector('.engine-state.ready');i++) await new Promise(r=>setTimeout(r,50));`);
      assert.equal(await evaluate(`return document.querySelector('.page-content').scrollWidth <= document.querySelector('.page-content').clientWidth;`), true);
      await snapshot('home');
      primary.setSize(1000, 700);
      await evaluate('await new Promise(r=>setTimeout(r,100));');
      assert.equal(await evaluate(`return document.querySelector('.workspace').scrollWidth <= document.querySelector('.workspace').clientWidth;`), true);
      await snapshot('home-compact'); primary.setSize(1280, 860);
      report.tests.push('home layout at 1280x860 and 1000x700');
      const result = await evaluate(`return await window.musicAPI.invoke('start-download-task',{id:'no_cookie',url:'https://music.apple.com/cn/song/test/123'});`);
      assert.equal(result.success, false); assert.match(result.msg, /凭证/);
      report.tests.push('real download handler rejects missing credentials');
      const loginCancellation = await evaluate(`const promise=window.musicAPI.invoke('run-login').then(()=>false,e=>e.message); await new Promise(r=>setTimeout(r,150)); await window.musicAPI.invoke('cancel-login'); return await promise;`);
      assert.match(loginCancellation, /取消/);
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      report.tests.push('real native login window opens, cancels and cleans up');
      const direct = await evaluate(`return await window.musicAPI.invoke('search-music',{term:'https://music.apple.com/cn/album/test-album/123?i=456&l=cn',country:'cn'});`);
      assert.equal(direct[0].isDirectUrl, true);
      report.tests.push('real direct-link parser');
      // External search is reported separately from deterministic offline checks.
      try {
        const liveSearch = await evaluate(`return await window.musicAPI.invoke('search-music',{term:'Taylor Swift',country:'us'});`);
        assert.ok(liveSearch.length > 0); report.tests.push('live Apple search: ' + liveSearch.length + ' results');
      } catch (error) { report.warnings.push('Live search unavailable: ' + error.message); }
      await evaluate(`document.querySelectorAll('.nav-item')[3].click(); ${sleepCode} const input=document.querySelector('input[aria-label="下载保存位置"]'); if(!input.value)throw Error('No default directory');`);
      await snapshot('settings');
      await evaluate(`document.querySelectorAll('.settings-nav button')[1].click(); ${sleepCode} document.querySelectorAll('.codec-option')[1].click(); ${sleepCode}`);
      assert.equal(await evaluate(`return document.querySelector('input[aria-label="连接 Wrapper v2"]').checked;`), true);
      await evaluate(`const save=[...document.querySelectorAll('.settings-save button')][0]; save.click(); ${sleepCode} const config=await window.musicAPI.invoke('get-config'); if(config.songCodec!=='alac'||!config.useWrapper)throw Error('Settings not saved');`);
      await snapshot('audio');
      primary.setSize(1000, 700);
      assert.equal(await evaluate(`return document.querySelector('.page-content').scrollWidth <= document.querySelector('.page-content').clientWidth;`), true);
      primary.setSize(1280, 860);
      report.tests.push('codec selection enables Wrapper; settings save through real IPC; compact settings layout');
      // Reset to standard audio and simulate only account + download results for queue UX.
      await evaluate(`const cfg=await window.musicAPI.invoke('get-config');cfg.songCodec='aac-web';cfg.useWrapper=false;await window.musicAPI.invoke('set-config',cfg);document.querySelectorAll('.codec-option')[0].click();const sw=document.querySelector('input[aria-label="连接 Wrapper v2"]');if(sw.checked)sw.click();document.querySelector('.settings-save button').click();${sleepCode}`);
      replaceHandler('run-login', async () => 'test login');
      replaceHandler('check-cookie', async () => ({ valid: true }));
      replaceHandler('start-download-task', (_event, task) => {
        started++;
        primary.webContents.send('download-progress', { id: task.id, text: 'Track 1/1 Downloading "Test track" 42.5%\n' });
        return new Promise(resolve => pending.set(task.id, resolve));
      });
      replaceHandler('cancel-download', async (_event, id) => { pending.get(id)?.({ success: false, msg: '已取消' }); pending.delete(id); return true; });
      await evaluate(`document.querySelector('.account-button').click();${sleepCode}document.querySelectorAll('.nav-item')[1].click();${sleepCode}const textarea=document.querySelector('textarea');textarea.value=['1','2','3','4','5'].map(n=>'https://music.apple.com/cn/album/test-album/'+n).join('\\n');textarea.dispatchEvent(new Event('input',{bubbles:true}));${sleepCode}document.querySelector('.link-footer button').click();${sleepCode}`);
      assert.equal(started, 2);
      assert.equal(await evaluate(`return document.querySelectorAll('.task-card').length;`), 5);
      await snapshot('downloads-active');
      report.tests.push('batch adds five tasks and starts exactly two');
      const first = pending.entries().next().value;
      pending.delete(first[0]); first[1]({ success: true, msg: '成功' });
      await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(started, 3);
      const second = pending.entries().next().value;
      pending.delete(second[0]); second[1]({ success: false, msg: '模拟网络中断，请重试' });
      await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(started, 4);
      await evaluate(`const card=[...document.querySelectorAll('.task-card')].find(el=>el.querySelector('.task-status.downloading'));card.querySelector('button[aria-label="取消任务"]').click();${sleepCode}`);
      assert.equal(started, 5);
      report.tests.push('success and error states; cancel releases slot; queued tasks resume');
      for (const [id, resolve] of pending) { pending.delete(id); resolve({ success: true, msg: '成功' }); }
      await new Promise(resolve => setTimeout(resolve, 150));
      const counts=await evaluate(`return {success:document.querySelectorAll('.task-status.success').length,error:document.querySelectorAll('.task-status.error').length,cancelled:document.querySelectorAll('.task-status.cancelled').length};`);
      assert.deepEqual(counts,{success:3,error:1,cancelled:1});
      await snapshot('downloads-complete');
      await evaluate(`document.querySelector('button[aria-label="重试任务"]').click();${sleepCode}`);
      assert.equal(started, 6);
      for (const [id, resolve] of pending) { pending.delete(id); resolve({ success: true, msg: '成功' }); }
      await new Promise(resolve => setTimeout(resolve, 150));
      report.tests.push('failed/cancelled tasks can retry');
      await evaluate(`document.querySelectorAll('.segmented button')[2].click();${sleepCode}if(!document.querySelectorAll('.task-card').length)throw Error('Filter failed');`);
      report.tests.push('download status filters');
      finish();
    } catch (error) { finish(error); }
  });
});
const filename = path.join(root, 'main.js');
let source = fs.readFileSync(filename, 'utf8').replaceAll('new BrowserWindow({', 'new BrowserWindow({ show: false,');
if (packaged) {
  source = source.replaceAll('app.isPackaged', 'true');
  source = source.replaceAll('process.resourcesPath', JSON.stringify(path.dirname(root)));
}
const entry = new Module(filename, module); entry.filename = filename; entry.paths = Module._nodeModulePaths(root); entry._compile(source, filename);
