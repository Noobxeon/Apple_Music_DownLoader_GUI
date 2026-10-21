const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { capture, musicUrl, wrapperSettings, checkWrapper, buildDownloadArgs, downloadResult } = require('../backend/engine');
const { validToken, toNetscape, hasValidToken } = require('../backend/cookies');

const config = { downloadDir: 'C:\\Music & files', songCodec: 'aac-web', syncedLyricsFormat: 'lrc' };
const task = { url: 'https://music.apple.com/cn/album/test/123?i=456&l=zh-CN' };
test('argument boundaries preserve Windows paths and URL ampersands without a shell', () => {
  const args = buildDownloadArgs(config, task, 'C:\\User data\\cookies.txt');
  assert.equal(args[args.length - 1], task.url);
  assert.equal(args[args.indexOf('--output-path') + 1], config.downloadDir);
  assert.equal(args[args.indexOf('--cookies-path') + 1], 'C:\\User data\\cookies.txt');
  assert.ok(args.includes('--no-config-file'));
});
test('only valid Apple Music HTTPS hosts can be downloaded', () => {
  for (const url of ['https://music.apple.com.evil.com/cn/song/a/1', 'https://evil.com/?music.apple.com',
    'file:///music.apple.com', '--help', 'https://user:pass@music.apple.com/cn/song/a/1', 'https://music.apple.com/login']) {
    assert.throws(() => musicUrl(url));
  }
});
test('ALAC requires wrapper and sends v2 flags without requiring cookies', () => {
  assert.throws(() => buildDownloadArgs({ ...config, songCodec: 'alac' }, task, 'cookies'), /Wrapper/);
  const args = buildDownloadArgs({ ...config, songCodec: 'alac', useWrapper: true,
    wrapperUrl: 'http://127.0.0.1:20020', wrapperDecryptPort: 10020 }, task, 'cookies');
  assert.ok(args.includes('--use-wrapper'));
  assert.ok(!args.includes('--cookies-path'));
  assert.equal(args[args.indexOf('--song-codec-priority') + 1], 'alac');
  assert.equal(args[args.indexOf('--wrapper-decrypt-port') + 1], '10020');
});
test('lyrics, attachments and custom dependencies reach the CLI', () => {
  const args = buildDownloadArgs({ ...config, syncedLyricsFormat: 'none', saveCover: true,
    savePlaylist: true, overwrite: true, ffmpegPath: 'C:\\ffmpeg path\\ffmpeg.exe' }, task, 'cookies');
  for (const flag of ['--no-synced-lyrics', '--save-cover', '--save-playlist', '--overwrite', '--ffmpeg-path']) assert.ok(args.includes(flag));
});
test('wrapper rejects invalid schemes and TCP ports', () => {
  assert.throws(() => wrapperSettings({ wrapperUrl: 'file:///etc/passwd' }));
  assert.throws(() => wrapperSettings({ wrapperUrl: 'http://u:p@localhost' }));
  assert.throws(() => wrapperSettings({ wrapperDecryptPort: 65536 }));
  assert.throws(() => wrapperSettings({ wrapperDecryptPort: 'bad' }));
});
test('failure cannot be turned into success by downloaded text or exit code zero', () => {
  for (const [code, logs] of [[0, 'No active Apple Music subscription'], [0, 'Downloaded\nFinished with 3 error(s)'],
    [1, 'Downloaded\nFinished with 0 error(s)'], [0, '[error] failed\nFinished with 0 error(s)'],
    [0, 'Traceback (most recent call last)'], [0, 'already exists'], [0, 'Skipping: Requested format is not available\nFinished with 0 error(s)'], [0, '[error  ] failure\nFinished with 0 error(s)']]) {
    assert.equal(downloadResult(code, logs).success, false);
  }
  assert.equal(downloadResult(0, 'Finished with 0 error(s)').success, true);
  assert.equal(downloadResult(0, 'Finished with 0 error(s)', true).success, false);
});
test('native cookie export preserves Netscape HttpOnly format and rejects expired or empty tokens', () => {
  const cookie = { domain: '.music.apple.com', name: 'media-user-token', value: 'fake-test-token',
    httpOnly: true, secure: true, expirationDate: Date.now() / 1000 + 1000 };
  assert.ok(hasValidToken(toNetscape([cookie])));
  assert.ok(toNetscape([cookie]).includes('#HttpOnly_.music.apple.com\tTRUE'));
  assert.equal(validToken({ ...cookie, value: '' }), false);
  assert.equal(validToken({ ...cookie, expirationDate: 1 }), false);
  assert.equal(validToken({ ...cookie, domain: '.evil.com' }), false);
  assert.equal(hasValidToken('# media-user-token\n'), false);
  assert.equal(hasValidToken('.music.apple.com\tTRUE\t/\tTRUE\t1\tmedia-user-token\tfake'), false);
  assert.throws(() => toNetscape([{ ...cookie, value: 'bad\nline' }]));
});
test('process errors and timeouts settle rather than hang', async () => {
  assert.equal(await capture(process.execPath, ['-e', 'console.log("ready")']), 'ready');
  await assert.rejects(capture('missing-program-for-test-abc', []));
  await assert.rejects(capture(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 150), /超时/);
});
test('wrapper preflight checks API, auth, runtime and TCP against local mock services', async t => {
  let me = { version: '0.0.2', auth: { state: 'authenticated' }, runtime: { playback_ready: true } };
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(me)); });
  const tcp = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); tcp.close(); });
  const cfg = { wrapperUrl: `http://127.0.0.1:${server.address().port}`, wrapperDecryptPort: tcp.address().port };
  assert.match(await checkWrapper(cfg), /HTTP.*TCP/);
  me = { ...me, auth: { state: 'logged_out' } };
  await assert.rejects(checkWrapper(cfg), /尚未登录/);
  me = { ...me, version: '0.0.1' };
  await assert.rejects(checkWrapper(cfg), /不兼容/);
  me = { version: '0.0.2', auth: { state: 'authenticated' }, runtime: { playback_ready: false } };
  await assert.rejects(checkWrapper(cfg), /播放/);
});
