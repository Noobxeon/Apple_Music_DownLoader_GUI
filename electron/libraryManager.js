const fs = require('fs');
const path = require('path');
const { capture } = require('../backend/engine');

const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.flac', '.wav', '.aac', '.ogg']);
const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.mkv']);
const LYRIC_EXTS = ['.lrc', '.ttml', '.srt'];
const COVER_NAMES = ['cover.jpg', 'cover.png', 'cover.jpeg', 'folder.jpg', 'folder.png'];

function toLocalMediaUrl(absPath) {
  if (!absPath) return '';
  return `local-media://stream?path=${encodeURIComponent(absPath)}`;
}

function parseLrcContent(rawText) {
  const lines = (rawText || '').split(/\r?\n/);
  const synced = [];
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const matches = [...line.matchAll(timeRegex)];
    if (matches.length === 0) continue;
    const text = line.replace(timeRegex, '').trim();
    for (const m of matches) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const msRaw = m[3] || '0';
      const frac = parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) / 1000;
      synced.push({
        time: +(mins * 60 + secs + frac).toFixed(2),
        text: text || '♪'
      });
    }
  }

  synced.sort((a, b) => a.time - b.time);
  return synced;
}

class LibraryManager {
  constructor(store, getRuntime, backendDir) {
    this.store = store;
    this.getRuntime = getRuntime;
    this.backendDir = backendDir;
  }

  scanLibrary(customDir) {
    const cfg = this.store.getConfig();
    const rootDir = customDir || cfg.downloadDir;
    if (!rootDir || !fs.existsSync(rootDir)) {
      return { rootDir, items: [], totalSize: 0 };
    }

    const items = [];
    let totalSize = 0;

    const walk = (dir, depth = 0) => {
      if (depth > 5 || items.length >= 1000) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      let folderCoverPath = '';
      for (const cname of COVER_NAMES) {
        const candidate = path.join(dir, cname);
        if (fs.existsSync(candidate)) {
          folderCoverPath = candidate;
          break;
        }
      }

      for (const entry of entries) {
        if (items.length >= 1000) break;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        const isAudio = AUDIO_EXTS.has(ext);
        const isVideo = VIDEO_EXTS.has(ext);
        if (!isAudio && !isVideo) continue;

        let stat;
        try { stat = fs.statSync(fullPath); } catch { continue; }

        totalSize += stat.size;
        const stem = path.basename(entry.name, ext);
        const relDir = path.relative(rootDir, dir);
        const parts = relDir && relDir !== '.' ? relDir.split(path.sep) : [];
        const artist = parts[0] || '本地曲库';
        const album = parts[1] || (parts[0] ? '单曲 / 精选' : '默认目录');
        const cleanTitle = stem.replace(/^(?:\d+-)?\d{1,3}\s+/, '').trim() || stem;

        let lyricPath = '';
        let lyricExt = '';
        for (const lExt of LYRIC_EXTS) {
          const lp = path.join(dir, `${stem}${lExt}`);
          if (fs.existsSync(lp)) {
            lyricPath = lp;
            lyricExt = lExt.slice(1).toUpperCase();
            break;
          }
        }

        items.push({
          id: `loc_${Buffer.from(fullPath).toString('base64').slice(0, 22)}_${stat.mtimeMs | 0}`,
          title: cleanTitle,
          fileName: entry.name,
          artist,
          album,
          ext: ext.slice(1).toUpperCase(),
          mediaKind: isVideo ? 'video' : 'audio',
          filePath: fullPath,
          dirPath: dir,
          streamUrl: toLocalMediaUrl(fullPath),
          cover: folderCoverPath ? toLocalMediaUrl(folderCoverPath) : '',
          hasLyrics: Boolean(lyricPath),
          lyricFormat: lyricExt,
          lyricPath,
          size: stat.size,
          mtime: stat.mtimeMs
        });
      }
    };

    walk(rootDir, 0);
    items.sort((a, b) => b.mtime - a.mtime);

    return { rootDir, items, totalSize };
  }

  async getLyricsForTrack(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return { found: false, format: '', raw: '', synced: [] };
    }
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const stem = path.basename(filePath, ext);

    for (const lExt of LYRIC_EXTS) {
      const candidate = path.join(dir, `${stem}${lExt}`);
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8');
        const synced = lExt === '.lrc' ? parseLrcContent(raw) : [];
        return { found: true, format: lExt.slice(1).toUpperCase(), raw, synced };
      }
    }

    const meta = await this.inspectMediaTags(filePath);
    if (meta && meta.embeddedLyrics) {
      return {
        found: true,
        format: '内嵌歌词',
        raw: meta.embeddedLyrics,
        synced: parseLrcContent(meta.embeddedLyrics)
      };
    }

    return { found: false, format: '', raw: '', synced: [] };
  }

  async inspectMediaTags(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: '文件不存在' };
    }
    try {
      const cfg = this.store.getConfig();
      const runtime = await this.getRuntime(cfg);
      let out;
      if (runtime.kind === 'bundled') {
        out = await capture(runtime.command, ['--gui-inspect-media', filePath], 12000);
      } else {
        const scriptPath = path.join(this.backendDir, 'media_inspector.py');
        out = await capture(runtime.command, [...runtime.prefix, scriptPath, filePath], 12000);
      }
      return JSON.parse(out);
    } catch (e) {
      return { ok: false, error: e.message || '读取标签数据失败' };
    }
  }

  async convertAudio({ filePath, targetFormat = 'mp3' }) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('源音频文件不存在');
    }

    const cfg = this.store.getConfig();
    const ffmpegCmd = (cfg.ffmpegPath && cfg.ffmpegPath.trim()) || 'ffmpeg';
    try {
      await capture(ffmpegCmd, ['-version'], 5000);
    } catch {
      throw new Error('未检测到 FFmpeg，请先安装 FFmpeg 或在【设置 -> 环境诊断】中配置 FFmpeg 路径');
    }

    const fmt = targetFormat.toLowerCase();
    const dir = path.dirname(filePath);
    const stem = path.basename(filePath, path.extname(filePath));
    const outPath = path.join(dir, `${stem}.${fmt}`);

    if (path.resolve(outPath) === path.resolve(filePath)) {
      throw new Error('目标格式与当前文件格式相同');
    }

    const codecArgsMap = {
      mp3: ['-c:a', 'libmp3lame', '-b:a', '320k', '-id3v2_version', '3'],
      flac: ['-c:a', 'flac'],
      wav: ['-c:a', 'pcm_s16le']
    };
    const codecArgs = codecArgsMap[fmt];
    if (!codecArgs) throw new Error(`不支持的目标转换格式: ${fmt}`);

    await capture(ffmpegCmd, ['-y', '-i', filePath, '-vn', '-map_metadata', '0', ...codecArgs, outPath], 180000);
    return { ok: true, outputPath: outPath, format: fmt.toUpperCase() };
  }

  deleteLocalFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }
}

module.exports = { LibraryManager, parseLrcContent, toLocalMediaUrl };
