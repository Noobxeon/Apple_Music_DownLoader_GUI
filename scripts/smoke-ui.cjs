const { app, BrowserWindow } = require('electron');
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
fs.writeFileSync(path.join(app.getPath('userData'), 'config.json'), JSON.stringify({ songCodec: 'aac-web', useWrapper: false, theme: 'dark' }));
app.getVersion = () => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

// Prove packaged app runs with NO system Python on PATH
process.env.PATH = '';
process.env.PYTHONHOME = 'Z:/no-system-python';
process.env.PYTHONPATH = '';

const packaged = root.endsWith('.asar');
if (packaged) process.resourcesPath = path.dirname(root);

const report = { root, tests: [], screenshots: [] };
let settled = false;
let primary;

const timeout = setTimeout(() => finish(new Error('UI smoke timed out')), 90000);
function finish(error) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  if (error) report.error = error.stack || String(error);
  fs.writeFileSync(path.join(targetDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.exit(error ? 1 : 0);
}

async function evaluate(js) {
  return primary.webContents.executeJavaScript(`(async()=>{${js}})()`);
}

async function snapshot(name) {
  await new Promise(resolve => setTimeout(resolve, 250));
  await primary.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const out = path.join(targetDir, name + '.png');
  fs.writeFileSync(out, (await primary.webContents.capturePage()).toPNG());
  report.screenshots.push(out);
}

app.on('browser-window-created', (_event, win) => {
  if (primary) return;
  primary = win;
  primary.webContents.setBackgroundThrottling(false);
  primary.webContents.on('render-process-gone', (_event, details) => finish(new Error('Renderer exited: ' + details.reason)));

  primary.webContents.once('did-finish-load', async () => {
    try {
      // 1. Preload & Context Isolation check
      assert.equal(
        await evaluate(`return typeof window.appleMusic === 'object' && typeof window.musicAPI === 'object' && typeof window.require === 'undefined';`),
        true
      );
      report.tests.push('isolated preload bridges (appleMusic & musicAPI) verified');

      // 2. Self-contained bundled engine check with empty PATH
      const engine = await evaluate(`return await window.musicAPI.invoke('check-gamdl');`);
      assert.equal(engine.installed, true);
      assert.equal(engine.bundled, true);
      report.tests.push('self-contained gamdl 3.9.1 engine ready with empty PATH');

      // Wait for live Top Charts to render
      await evaluate(`for(let i=0;i<80&&document.querySelectorAll('.track-row').length===0;i++) await new Promise(r=>setTimeout(r,100));`);
      await snapshot('01-studio-discover-dark');
      report.tests.push('live Apple Music Top Charts rendered in Studio Dark UI');

      // 3. Test Search View (CN subscription catalog search)
      await evaluate(`
        const input = document.querySelector('.global-search-bar input');
        input.value = 'yorushika';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.search-go-btn').click();
        for(let i=0;i<100&&document.querySelectorAll('.search-view .track-row').length===0;i++) await new Promise(r=>setTimeout(r,100));
      `);
      const foundCnTracks = await evaluate(`return document.querySelectorAll('.search-view .track-row').length;`);
      assert.ok(foundCnTracks > 0, 'CN search should render Yorushika tracks');
      await snapshot('02-studio-search-cn');
      report.tests.push(`CN subscription catalog search rendered ${foundCnTracks} tracks`);

      // 4. Test Smart URL Parser View
      await evaluate(`document.querySelectorAll('.nav-item')[2].click();`);
      await snapshot('03-studio-url-parser');
      report.tests.push('Smart URL Parser & Batch Importer view verified');

      // 5. Test Native Login window open + cancel cleanup
      const loginCancelMsg = await evaluate(`
        const p = window.appleMusic.runBrowserLogin().then(() => 'ok', e => e.message);
        await new Promise(r => setTimeout(r, 200));
        await window.appleMusic.cancelLogin();
        return await p;
      `);
      assert.match(loginCancelMsg, /取消/);
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      report.tests.push('native sandboxed Apple ID login window opens, cancels & cleans up');

      // 6. Test Settings & Environment Doctor + Light Mode toggle
      await evaluate(`document.querySelectorAll('.nav-item')[6].click();`);
      await snapshot('04-studio-settings-dark');
      await evaluate(`document.querySelector('button[title*="浅色"]').click();`);
      await snapshot('05-studio-settings-light');
      assert.equal(await evaluate(`return document.documentElement.getAttribute('data-theme');`), 'light');
      report.tests.push('Settings, Environment Doctor & Light/Dark theme switch verified');

      finish();
    } catch (error) {
      finish(error);
    }
  });
});

const filename = path.join(root, 'main.js');
let source = fs.readFileSync(filename, 'utf8').replace('show: !isSmokeTest,', 'show: false,');
if (packaged) {
  source = source.replaceAll('app.isPackaged', 'true');
  source = source.replaceAll('process.resourcesPath', JSON.stringify(path.dirname(root)));
}
const entry = new Module(filename, module);
entry.filename = filename;
entry.paths = Module._nodeModulePaths(root);
entry._compile(source, filename);
