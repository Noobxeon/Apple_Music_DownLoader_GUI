const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');

const ENGINE_VERSION = '3.9.1';
const WRAPPER_API_VERSION = '0.0.2';

function capture(command, args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf8', PYTHONUTF8: '1' } });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('运行环境检测超时')); }, timeout);
    child.stdout.on('data', d => { output = (output + d).slice(-32768); });
    child.stderr.on('data', d => { output = (output + d).slice(-32768); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(new Error(output || `进程退出 (${code})`));
    });
  });
}

async function findPython(config = {}) {
  const candidates = config.pythonPath ? [[config.pythonPath, []]] :
    (process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]]);
  for (const [command, prefix] of candidates) {
    try {
      await capture(command, [...prefix, '-c', 'import sys; assert sys.version_info >= (3,10); print(sys.version)']);
      return { command, prefix };
    } catch { /* Try the next interpreter. */ }
  }
  throw new Error('未找到 Python 3.10+，请安装 Python 或在设置中选择 python.exe。Apple ID 登录无需 Python。');
}

async function engineRuntime(config = {}, options = {}) {
  const bundled = options.enginePath || (options.resourcesPath && path.join(options.resourcesPath, 'engine', 'gamdl-engine.exe'));
  if (bundled && fs.existsSync(bundled)) {
    let report;
    try { report = JSON.parse(await capture(bundled, ['--gui-self-test'], 30000)); }
    catch { throw new Error('内置下载引擎启动失败，请重新解压完整程序，或重新安装。'); }
    if (report.version !== ENGINE_VERSION || !report.frozen || !report.native) {
      throw new Error('内置下载引擎不完整或版本不匹配，请重新安装完整发行包。');
    }
    return { command: bundled, prefix: [], version: report.version, kind: 'bundled' };
  }
  if (options.packaged) throw new Error('发行包缺少内置下载引擎，请重新下载完整程序。');
  const python = await findPython(config);
  let version;
  try {
    version = await capture(python.command, [...python.prefix, '-c',
      'import importlib.metadata; print(importlib.metadata.version("gamdl"))']);
  } catch {
    throw new Error(`此 Python 未安装 gamdl，请使用同一 Python 安装 gamdl==${ENGINE_VERSION}，然后重新检测。`);
  }
  if (version !== ENGINE_VERSION) throw new Error(`检测到 gamdl ${version}，本版需要 gamdl ${ENGINE_VERSION}（Wrapper v2 API ${WRAPPER_API_VERSION}）。请更新所选 Python 环境。`);
  // Import the CLI and native extension too: metadata alone does not prove a working installation.
  await capture(python.command, [...python.prefix, '-m', 'gamdl', '--version']);
  return { ...python, version, kind: 'python' };
}

function engineArgs(runtime, args) {
  return runtime.kind === 'bundled' ? args : [...runtime.prefix, '-u', '-m', 'gamdl', ...args];
}

function musicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'music.apple.com' || url.username || url.password || url.port) {
    throw new Error('请输入 https://music.apple.com/ 开头的有效链接');
  }
  if (!/^\/[a-z]{2}\/(album|song|playlist|music-video|artist)\//i.test(url.pathname)) {
    throw new Error('不支持此 Apple Music 链接类型');
  }
  return url.href;
}

function wrapperSettings(config) {
  const url = new URL(config.wrapperUrl || 'http://127.0.0.1');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Wrapper 地址必须为 HTTP/HTTPS 服务地址，不得包含账号密码或查询参数');
  }
  const host = (config.wrapperDecryptHost || '127.0.0.1').trim();
  const port = Number(config.wrapperDecryptPort || 10020);
  if (!host || /[\s/]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Wrapper TCP 主机或端口无效');
  }
  return { url: url.href.replace(/\/$/, ''), host, port };
}

function getJson(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const request = (url.startsWith('https:') ? https : http).get(url, response => {
      let body = '';
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 65536) request.destroy(new Error('Wrapper 响应过大'));
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`Wrapper HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Wrapper 返回的不是 JSON')); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Wrapper HTTP 连接超时')), timeout);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}

async function checkWrapper(config) {
  const settings = wrapperSettings(config);
  const me = await getJson(`${settings.url}/me`);
  if (me.version !== WRAPPER_API_VERSION) throw new Error(`Wrapper API 不兼容：需要 ${WRAPPER_API_VERSION}，检测到 ${me.version || '未知'}。请部署匹配的 wrapper-v2。`);
  if (me.auth?.state !== 'authenticated') throw new Error('Wrapper 尚未登录，请先在 Wrapper 服务端完成 Apple ID 登录和双重认证。');
  if (me.runtime?.playback_ready !== true) throw new Error('Wrapper 播放服务尚未就绪，请检查服务端运行环境');
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: settings.host, port: settings.port });
    const timer = setTimeout(() => socket.destroy(new Error('Wrapper TCP 连接超时')), 5000);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(); });
    socket.once('error', err => { clearTimeout(timer); reject(err); });
  });
  return 'Wrapper v2 已登录，HTTP 与 TCP 端口可连接（尚未验证实际下载）';
}

function buildDownloadArgs(config, task, cookiePath) {
  const url = musicUrl(task.url);
  const codec = config.songCodec || 'aac-web';
  if (!['aac-web', 'aac', 'alac', 'atmos', 'ac3'].includes(codec)) throw new Error('不支持的音频编码');
  if (codec === 'alac' && !config.useWrapper) throw new Error('ALAC 无损下载请先在设置中启用并连接 Wrapper v2。');
  const args = ['--no-config-file', '--output-path', task.saveDir || config.downloadDir,
    '--album-folder-template', '{album_artist}/{album}', '--song-codec-priority', codec];
  if (config.useWrapper) {
    const settings = wrapperSettings(config);
    args.push('--use-wrapper', '--wrapper-url', settings.url,
      '--wrapper-decrypt-host', settings.host, '--wrapper-decrypt-port', String(settings.port));
  } else args.push('--cookies-path', cookiePath);
  if (config.syncedLyricsFormat === 'none') args.push('--no-synced-lyrics');
  else if (config.syncedLyricsFormat) args.push('--synced-lyrics-format', config.syncedLyricsFormat);
  for (const [key, flag] of [['saveCover', '--save-cover'], ['savePlaylist', '--save-playlist'], ['overwrite', '--overwrite']]) {
    if (config[key]) args.push(flag);
  }
  for (const [key, flag] of [['ffmpegPath', '--ffmpeg-path'], ['nm3u8dlrePath', '--nm3u8dlre-path'], ['wvdPath', '--wvd-path']]) {
    if (config[key]?.trim()) args.push(flag, config[key].trim());
  }
  args.push('--', url);
  return args;
}

function downloadResult(code, logs, cancelled = false) {
  if (cancelled) return { success: false, msg: '已手动终止' };
  const clean = logs.replace(/\x1b\[[0-9;]*m/g, '');
  const summaries = [...clean.matchAll(/Finished with (\d+) error\(s\)/gi)];
  // gamdl can return exit code 0 after early failures; require its final summary.
  const success = code === 0 && summaries.length > 0 && summaries.every(m => Number(m[1]) === 0)
    && !/\[(?:error|critical)\s*\]|Traceback \(most recent call last\)|Required dependency not found|Requested format is not available|Media is not streamable|Decryption is not available|URL is not valid or supported/i.test(clean);
  let msg = '下载失败，请查看任务日志';
  if (/no active apple music subscription/i.test(clean)) msg = '账号无有效 Apple Music 订阅';
  else if (/not found|no such file/i.test(clean)) msg = '缺少文件或依赖，请检查环境与配置并查看日志';
  else if (/wrapper/i.test(clean)) msg = 'Wrapper 请求失败，请检查服务登录状态、API 版本与端口';
  return { success, msg: success ? '成功' : msg };
}

module.exports = { ENGINE_VERSION, capture, findPython, engineRuntime, engineArgs, musicUrl, wrapperSettings,
  checkWrapper, buildDownloadArgs, downloadResult };
