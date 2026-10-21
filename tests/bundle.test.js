const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { engineRuntime, engineArgs } = require('../backend/engine');

test('packaged apps never fall back to the user Python installation', async () => {
  await assert.rejects(engineRuntime({ pythonPath: process.execPath }, { packaged: true, resourcesPath: '/missing-release-test-dir' }), /发行包缺少/);
  assert.deepEqual(engineArgs({ kind: 'bundled' }, ['--version']), ['--version']);
  assert.deepEqual(engineArgs({ kind: 'python', prefix: ['-3'] }, ['--version']), ['-3', '-u', '-m', 'gamdl', '--version']);
});

test('standalone engine works with empty PATH and invalid Python environment', { skip: !fs.existsSync(path.resolve(__dirname, '../vendor/gamdl-engine/gamdl-engine.exe')) }, async () => {
  const enginePath = path.resolve(__dirname, '../vendor/gamdl-engine/gamdl-engine.exe');
  const env = { ...process.env, PATH: '', PYTHONHOME: 'Z:/missing-python', PYTHONPATH: '', PYTHONNOUSERSITE: '1' };
  const invoke = args => execFileSync(enginePath, args, { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const report = JSON.parse(invoke(['--gui-self-test']));
  assert.equal(report.version, '3.9.1');
  assert.equal(report.native, true);
  assert.equal(report.frozen, true);
  assert.match(invoke(['--version']), /3\.9\.1/);
  for (const args of [
    ['--no-config-file', '--cookies-path', 'C:/test data/cookies.txt', '--song-codec-priority', 'aac-web', '--', 'https://music.apple.com/cn/song/a/123?i=1&l=cn'],
    ['--no-config-file', '--use-wrapper', '--wrapper-url', 'http://127.0.0.1:20020', '--wrapper-decrypt-port', '10020', '--song-codec-priority', 'alac', '--', 'https://music.apple.com/cn/album/a/123']
  ]) assert.equal(JSON.parse(invoke(['--gui-validate-args', JSON.stringify(args)])).valid, true);
  const runtime = await engineRuntime({ pythonPath: 'Z:/not-python.exe' }, { enginePath, packaged: true });
  assert.equal(runtime.kind, 'bundled');
});
