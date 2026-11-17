<template>
  <div class="settings-view">
    <div class="view-header">
      <div class="view-title-group">
        <h1>工作站设置与环境诊断</h1>
        <p>内置独立 gamdl 3.9.1 引擎（免安装 Python）· 所有修改自动持久化保存</p>
      </div>

      <button class="btn btn-sm" @click="handleResetDefaults">恢复默认参数</button>
    </div>

    <div class="pill-tabs" style="margin-bottom: 22px">
      <button class="pill-tab" :class="{ active: store.settingsTab === 'general' }" @click="store.settingsTab = 'general'">
        常规与并发
      </button>
      <button class="pill-tab" :class="{ active: store.settingsTab === 'quality' }" @click="store.settingsTab = 'quality'">
        音质、Wrapper 与视频
      </button>
      <button class="pill-tab" :class="{ active: store.settingsTab === 'lyrics' }" @click="store.settingsTab = 'lyrics'">
        歌词与封面
      </button>
      <button class="pill-tab" :class="{ active: store.settingsTab === 'templates' }" @click="store.settingsTab = 'templates'">
        自定义命名模板
      </button>
      <button class="pill-tab" :class="{ active: store.settingsTab === 'doctor' }" @click="store.settingsTab = 'doctor'">
        <IconSymbol name="shield" :size="14" /> 环境诊断中心 (Doctor)
      </button>
    </div>

    <!-- Tab 1: General & Concurrency -->
    <div v-if="store.settingsTab === 'general'" class="surface-card settings-panel">
      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">默认音频下载目录</div>
          <div class="sr-desc">下载完成的无损曲目、专辑封面与同步歌词保存位置</div>
        </div>
        <div class="sr-control path-row">
          <input type="text" class="input-control" style="width: 320px" :value="cfg.downloadDir" readonly />
          <button class="btn btn-sm" @click="pickDownloadDir">浏览</button>
          <button class="btn btn-sm" @click="api.openFolder?.(cfg.downloadDir)">打开</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">界面视觉主题</div>
          <div class="sr-desc">支持深色黑曜石工作站外观与浅色简约外观实时切换</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.theme" @change="e => save({ theme: e.target.value })">
            <option value="dark">深色黑曜石 (Studio Dark)</option>
            <option value="light">浅色清爽 (macOS Light)</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">最大并发下载通道数</div>
          <div class="sr-desc">同时运行的 gamdl 下载任务数量（建议 2~3 线程兼顾速度与风控）</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.maxConcurrent" @change="e => save({ maxConcurrent: Number(e.target.value) })">
            <option :value="1">1 线程 (顺序稳健)</option>
            <option :value="2">2 线程 (推荐平衡)</option>
            <option :value="3">3 线程 (高速并发)</option>
            <option :value="4">4 线程</option>
            <option :value="5">5 线程 (极速)</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">SQLite 下载归档去重库 (--database-path)</div>
          <div class="sr-desc">启用后自动记录已下载曲目的 Apple Music ID，跨歌单/专辑自动跳过重复歌曲</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="cfg.useArchiveDb" @change="e => save({ useArchiveDb: e.target.checked })" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">覆盖同名已有文件 (--overwrite)</div>
          <div class="sr-desc">若目标路径已存在同名音频文件，强制重新下载并覆盖</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="cfg.overwrite" @change="e => save({ overwrite: e.target.checked })" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">队列完成系统桌面通知</div>
          <div class="sr-desc">当后台所有排队任务下载完成时发送操作系统级弹窗提醒</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="cfg.desktopNotification" @change="e => save({ desktopNotification: e.target.checked })" />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>

    <!-- Tab 2: Audio, Wrapper v2 & Video Quality -->
    <div v-else-if="store.settingsTab === 'quality'" class="surface-card settings-panel">
      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">音频编码优先级 (--song-codec-priority)</div>
          <div class="sr-desc">AAC-Web 无需额外服务开箱即用；选择 ALAC 真无损需启用下方 Wrapper v2 服务</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.songCodec" @change="onCodecChange">
            <option value="aac-web">AAC-Web (256kbps 官方网页流 · 开箱最稳)</option>
            <option value="aac-he-web">HE-AAC Web (高效编码)</option>
            <option value="aac">AAC (标准 256kbps)</option>
            <option value="alac">ALAC (Apple 真无损音频 · 需 Wrapper v2)</option>
            <option value="atmos">Dolby Atmos (杜比全景声)</option>
            <option value="ac3">AC3 (杜比数字环绕声)</option>
          </select>
        </div>
      </div>

      <!-- Wrapper v2 Configuration Block -->
      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">连接 Wrapper v2 解密服务 (--use-wrapper)</div>
          <div class="sr-desc">连接本地或局域网部署的 wrapper-v2 (API 0.0.2) 以解锁 ALAC 无损流</div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px">
          <button v-if="cfg.useWrapper" class="btn btn-sm" :disabled="checkingWrapper" @click="testWrapper">
            {{ checkingWrapper ? '检测中...' : '测试 Wrapper 连接' }}
          </button>
          <label class="switch">
            <input type="checkbox" :checked="cfg.useWrapper" @change="e => save({ useWrapper: e.target.checked })" />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <div v-if="cfg.useWrapper" class="wrapper-config-box">
        <div class="wrapper-field">
          <label>Wrapper HTTP 地址</label>
          <input type="text" class="input-control" :value="cfg.wrapperUrl" @change="e => save({ wrapperUrl: e.target.value.trim() })" placeholder="http://127.0.0.1:20020" />
        </div>
        <div class="wrapper-field">
          <label>TCP 解密主机</label>
          <input type="text" class="input-control" :value="cfg.wrapperDecryptHost" @change="e => save({ wrapperDecryptHost: e.target.value.trim() })" placeholder="127.0.0.1" />
        </div>
        <div class="wrapper-field" style="max-width: 130px">
          <label>TCP 端口</label>
          <input type="number" class="input-control" :value="cfg.wrapperDecryptPort" @change="e => save({ wrapperDecryptPort: Number(e.target.value) || 10020 })" />
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">MV 音乐视频最高分辨率 (--music-video-resolution)</div>
          <div class="sr-desc">下载 Apple Music 官方 MV 时的最高画质上限</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.musicVideoResolution" @change="e => save({ musicVideoResolution: e.target.value })">
            <option value="2160p">4K Ultra HD (2160p)</option>
            <option value="1440p">2K QHD (1440p)</option>
            <option value="1080p">Full HD (1080p · 推荐)</option>
            <option value="720p">HD (720p)</option>
            <option value="480p">SD (480p)</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">MV 视频封装容器 (--music-video-remux-format)</div>
          <div class="sr-desc">MP4 播放器通用性更好，M4V 更贴近 Apple 原生曲库规范</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.musicVideoRemuxFormat" @change="e => save({ musicVideoRemuxFormat: e.target.value })">
            <option value="mp4">MP4 (全平台通用)</option>
            <option value="m4v">M4V (Apple 原生容器)</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">歌手主页自动选择策略 (--artist-auto-select)</div>
          <div class="sr-desc">当直接下载歌手链接时自动拉取的作品分类</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.artistAutoSelect" @change="e => save({ artistAutoSelect: e.target.value })">
            <option value="top-songs">热门代表单曲 (top-songs)</option>
            <option value="main-albums">录音室专辑 (main-albums)</option>
            <option value="singles-eps">单曲与 EP (singles-eps)</option>
            <option value="all-albums">全部专辑合集 (all-albums)</option>
            <option value="music-videos">全部音乐视频 (music-videos)</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">底层流分片下载器 (--download-mode)</div>
          <div class="sr-desc">默认使用内置引擎集成的 yt-dlp，无需额外安装任何组件</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.downloadMode" @change="e => save({ downloadMode: e.target.value })">
            <option value="ytdlp">yt-dlp (内置集成 · 推荐)</option>
            <option value="nm3u8dlre">N_m3u8DL-RE (外部高速分片器)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Tab 3: Lyrics, Cover & Metadata -->
    <div v-else-if="store.settingsTab === 'lyrics'" class="surface-card settings-panel">
      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">同步歌词文件格式 (--synced-lyrics-format)</div>
          <div class="sr-desc">支持生成本地播放器通用的 LRC，或 Apple 原生逐字音节级 TTML</div>
        </div>
        <div class="sr-control">
          <select class="select-control" :value="cfg.syncedLyricsFormat" @change="e => save({ syncedLyricsFormat: e.target.value })">
            <option value="lrc">LRC (主流播放器与本软件内置歌词同步)</option>
            <option value="ttml">TTML (Apple 原生逐字精细时轴)</option>
            <option value="srt">SRT (视频字幕标准时轴)</option>
            <option value="none">不下载同步歌词文件</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">全局仅下载歌词模式 (--synced-lyrics-only)</div>
          <div class="sr-desc">开启后跳过音频流下载，仅为曲库快速补齐同步歌词文件</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="cfg.syncedLyricsOnly" @change="e => save({ syncedLyricsOnly: e.target.checked })" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">内嵌/独立封面图片格式与尺寸</div>
          <div class="sr-desc">设置封面图像格式及像素分辨率上限（最高支持 3000px 超清母版）</div>
        </div>
        <div class="sr-control" style="display: flex; gap: 8px">
          <select class="select-control" :value="cfg.coverFormat" @change="e => save({ coverFormat: e.target.value })">
            <option value="jpg">JPG (高兼容)</option>
            <option value="png">PNG (无损图像)</option>
            <option value="raw">RAW (原始文件)</option>
          </select>
          <select class="select-control" :value="cfg.coverSize" @change="e => save({ coverSize: Number(e.target.value) })">
            <option :value="1200">1200 x 1200 px</option>
            <option :value="2000">2000 x 2000 px</option>
            <option :value="3000">3000 x 3000 px (超清母版)</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">额外导出独立专辑封面文件 (--save-cover)</div>
          <div class="sr-desc">除内嵌至 M4A 标签外，在专辑文件夹内额外保存 cover.jpg / cover.png</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="cfg.saveCover" @change="e => save({ saveCover: e.target.checked })" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">自动导出 M3U8 歌单索引 (--save-playlist)</div>
          <div class="sr-desc">下载歌单时自动生成相对路径 .m3u8 播放列表文件</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="cfg.savePlaylist" @change="e => save({ savePlaylist: e.target.checked })" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">曲目使用专辑发行日期 (--use-album-date)</div>
          <div class="sr-desc">统一写入整张专辑首发日期，避免单曲先发导致播放器年份拆散</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="cfg.useAlbumDate" @change="e => save({ useAlbumDate: e.target.checked })" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">元数据语言偏好 (--language)</div>
          <div class="sr-desc">可强制指定内嵌标签语言，如 zh-Hans-CN、en-US、ja-JP（留空自动跟随区域）</div>
        </div>
        <div class="sr-control">
          <input
            type="text"
            class="input-control"
            style="width: 180px"
            placeholder="默认跟随区域"
            :value="cfg.language"
            @change="e => save({ language: e.target.value.trim() })"
          />
        </div>
      </div>
    </div>

    <!-- Tab 4: Naming Templates -->
    <div v-else-if="store.settingsTab === 'templates'" class="surface-card settings-panel">
      <div class="template-presets">
        <span style="font-size: 12.5px; color: var(--text-secondary)">一键套用商用整理预设:</span>
        <button class="btn btn-sm" @click="applyPreset('standard')">歌手 / 专辑 / 01 歌名</button>
        <button class="btn btn-sm" @click="applyPreset('artistTitle')">歌手 / 专辑 / 歌手 - 歌名</button>
        <button class="btn btn-sm" @click="applyPreset('flat')">平铺单目录 (歌手 - 歌名)</button>
      </div>

      <div class="preview-banner">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px">实时输出路径预览:</div>
        <code class="selectable">{{ liveTemplatePreview }}</code>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">专辑文件夹模板 (--album-folder-template)</div>
          <div class="sr-desc">可用变量: {album_artist}, {artist}, {album}, {date}</div>
        </div>
        <input
          type="text"
          class="input-control"
          style="width: 300px"
          :value="cfg.albumFolderTemplate"
          @input="e => save({ albumFolderTemplate: e.target.value })"
        />
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">单碟文件名模板 (--single-disc-file-template)</div>
          <div class="sr-desc">可用变量: {track:02d}, {title}, {artist}, {album}</div>
        </div>
        <input
          type="text"
          class="input-control"
          style="width: 300px"
          :value="cfg.singleDiscFileTemplate"
          @input="e => save({ singleDiscFileTemplate: e.target.value })"
        />
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">多碟文件名模板 (--multi-disc-file-template)</div>
          <div class="sr-desc">多 CD 专辑时自动启用，支持 {disc}-{track:02d} {title}</div>
        </div>
        <input
          type="text"
          class="input-control"
          style="width: 300px"
          :value="cfg.multiDiscFileTemplate"
          @input="e => save({ multiDiscFileTemplate: e.target.value })"
        />
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">歌单文件夹模板 (--playlist-folder-template)</div>
          <div class="sr-desc">可用变量: {playlist_title}, {playlist_artist}</div>
        </div>
        <input
          type="text"
          class="input-control"
          style="width: 300px"
          :value="cfg.playlistFolderTemplate"
          @input="e => save({ playlistFolderTemplate: e.target.value })"
        />
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-title">文件名最大字符截断长度 (--truncate)</div>
          <div class="sr-desc">防止超长歌名在 Windows 文件系统下超出路径长度限制</div>
        </div>
        <input
          type="number"
          min="20"
          max="180"
          class="input-control"
          style="width: 110px"
          :value="cfg.truncate"
          @change="e => save({ truncate: Number(e.target.value) || 60 })"
        />
      </div>
    </div>

    <!-- Tab 5: Environment Doctor -->
    <div v-else-if="store.settingsTab === 'doctor'">
      <div class="doctor-grid">
        <div class="doc-card surface-card">
          <div class="doc-head">
            <span class="doc-name">核心下载与混流引擎 (gamdl)</span>
            <span class="tag-badge" :class="env.gamdl.installed ? 'success' : 'danger'">
              {{ env.gamdl.installed ? `${env.gamdl.version} · ${env.gamdl.bundled ? '内置独立引擎' : 'Python 环境'}` : '异常' }}
            </span>
          </div>
          <p class="doc-sub ellipsis">
            {{ env.gamdl.installed ? (env.gamdl.bundled ? '已内置完整自包含引擎与 Rust ammuxer，无需安装 Python' : env.gamdl.command) : (env.gamdl.error || '未检测到引擎') }}
          </p>
        </div>

        <div class="doc-card surface-card">
          <div class="doc-head">
            <span class="doc-name">Apple Music 会话凭证</span>
            <span class="tag-badge" :class="env.cookie.valid ? 'success' : 'warning'">
              {{ env.cookie.valid ? `有效 (${env.cookie.count} 项)` : '待登录/导入' }}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px">
            <span class="doc-sub">内置沙箱登录免外部浏览器依赖</span>
            <button class="btn btn-sm" @click="store.authModalOpen = true">打开凭证中心</button>
          </div>
        </div>

        <div class="doc-card surface-card">
          <div class="doc-head">
            <span class="doc-name">FFmpeg 本地无损转码器 (可选)</span>
            <span class="tag-badge" :class="env.ffmpeg.installed ? 'success' : 'neutral'">
              {{ env.ffmpeg.installed ? '已就绪' : '未配置 (默认下载无需)' }}
            </span>
          </div>
          <p class="doc-sub ellipsis">{{ env.ffmpeg.version || '安装配置后可在【本地音乐库】一键转 MP3/FLAC/WAV' }}</p>
        </div>

        <div class="doc-card surface-card">
          <div class="doc-head">
            <span class="doc-name">N_m3u8DL-RE 极速分片器 (可选)</span>
            <span class="tag-badge" :class="env.nm3u8dlre.installed ? 'success' : 'neutral'">
              {{ env.nm3u8dlre.installed ? '已就绪' : '未配置 (默认使用内置 yt-dlp)' }}
            </span>
          </div>
          <p class="doc-sub ellipsis">{{ env.nm3u8dlre.version || '仅在切换至 nm3u8dlre 分片模式时需要' }}</p>
        </div>
      </div>

      <!-- Custom Binary Paths -->
      <div class="surface-card settings-panel">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
          <h3 style="margin: 0; font-size: 15px">可选外部工具与密钥路径指定</h3>
          <button class="btn btn-sm" :disabled="env.loading" @click="refreshEnvironment(true)">
            <IconSymbol name="refresh" :size="13" /> 重新执行环境体检
          </button>
        </div>

        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-title">自定义 FFmpeg 路径 (--ffmpeg-path)</div>
            <div class="sr-desc">指定本地 ffmpeg.exe 以激活【本地音乐库】中的 MP3/FLAC/WAV 格式转换器</div>
          </div>
          <div class="sr-control path-row">
            <input type="text" class="input-control" style="width: 280px" :value="cfg.ffmpegPath" placeholder="自动使用系统 PATH" @change="e => save({ ffmpegPath: e.target.value })" />
            <button class="btn btn-sm" @click="pickBinary('ffmpegPath')">选择</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-title">自定义 N_m3u8DL-RE 路径 (--nm3u8dlre-path)</div>
            <div class="sr-desc">配合 N_m3u8DL-RE 分片引擎模式使用</div>
          </div>
          <div class="sr-control path-row">
            <input type="text" class="input-control" style="width: 280px" :value="cfg.nm3u8dlrePath" placeholder="自动使用系统 PATH" @change="e => save({ nm3u8dlrePath: e.target.value })" />
            <button class="btn btn-sm" @click="pickBinary('nm3u8dlrePath')">选择</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-title">Widevine 设备密钥文件 (--wvd-path)</div>
            <div class="sr-desc">可选自定义 .wvd 设备文件（留空使用内置密钥）</div>
          </div>
          <div class="sr-control path-row">
            <input type="text" class="input-control" style="width: 280px" :value="cfg.wvdPath" placeholder="默认使用内置密钥" @change="e => save({ wvdPath: e.target.value })" />
            <button class="btn btn-sm" @click="pickBinary('wvdPath')">选择</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import IconSymbol from '../components/IconSymbol.vue';
import { store, updateConfig, refreshEnvironment, notify } from '../store/appStore';

const api = window.appleMusic || {};
const cfg = computed(() => store.config);
const env = computed(() => store.env);
const checkingWrapper = ref(false);

async function save(partial) {
  await updateConfig(partial);
  if (
    partial.pythonPath !== undefined ||
    partial.ffmpegPath !== undefined ||
    partial.nm3u8dlrePath !== undefined
  ) {
    refreshEnvironment(true);
  }
}

async function onCodecChange(e) {
  const nextCodec = e.target.value;
  const patch = { songCodec: nextCodec };
  if (nextCodec === 'alac' && !cfg.value.useWrapper) {
    patch.useWrapper = true;
    notify('ALAC 无损编码已自动开启 Wrapper v2 选项，请确认本地 Wrapper 服务已启动', 'info', 4000);
  }
  await save(patch);
}

async function testWrapper() {
  checkingWrapper.value = true;
  try {
    const res = await api.checkWrapper?.(cfg.value);
    if (res?.success) {
      notify(res.msg, 'success', 4000);
    } else {
      notify(res?.msg || 'Wrapper 连接测试未通过', 'danger', 4500);
    }
  } finally {
    checkingWrapper.value = false;
  }
}

async function pickDownloadDir() {
  const dir = await api.selectFolder?.();
  if (dir) {
    await save({ downloadDir: dir });
    notify('下载保存目录已更新', 'success');
  }
}

async function pickBinary(key) {
  const fp = await api.selectFile?.();
  if (fp) {
    await save({ [key]: fp });
    notify('依赖路径已保存并重新校验', 'success');
  }
}

function applyPreset(name) {
  if (name === 'standard') {
    save({
      albumFolderTemplate: '{album_artist}/{album}',
      singleDiscFileTemplate: '{track:02d} {title}',
      multiDiscFileTemplate: '{disc}-{track:02d} {title}'
    });
  } else if (name === 'artistTitle') {
    save({
      albumFolderTemplate: '{album_artist}/{album}',
      singleDiscFileTemplate: '{artist} - {title}',
      multiDiscFileTemplate: '{disc}-{track:02d} {artist} - {title}'
    });
  } else if (name === 'flat') {
    save({
      albumFolderTemplate: '',
      singleDiscFileTemplate: '{artist} - {title}',
      multiDiscFileTemplate: '{artist} - {title}'
    });
  }
  notify('已应用目录命名模板预设', 'success');
}

const liveTemplatePreview = computed(() => {
  const replaceVars = (tpl) =>
    (tpl || '')
      .replace(/\{album_artist\}/g, 'Yorushika')
      .replace(/\{artist\}/g, 'Yorushika')
      .replace(/\{album\}/g, 'だから僕は音楽を辞めた')
      .replace(/\{date\}/g, '2019')
      .replace(/\{track:02d\}/g, '14')
      .replace(/\{track\}/g, '14')
      .replace(/\{disc\}/g, '1')
      .replace(/\{title\}/g, 'だから僕は音楽を辞めた');

  const folder = replaceVars(cfg.value.albumFolderTemplate);
  const file = replaceVars(cfg.value.singleDiscFileTemplate) + '.m4a';
  const base = cfg.value.downloadDir || 'D:\\Downloads\\Apple Music';
  return [base, folder, file].filter(Boolean).join('\\').replace(/\//g, '\\');
});

async function handleResetDefaults() {
  const def = await api.resetConfig?.();
  if (def) {
    Object.assign(store.config, def);
    notify('已恢复所有出厂默认配置', 'info');
  }
}
</script>

<style scoped>
.settings-panel { padding: 10px 22px; }
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.setting-row:last-child { border-bottom: none; }
.sr-info { flex: 1; }
.sr-title { font-weight: 700; font-size: 14px; margin-bottom: 3px; }
.sr-desc { font-size: 12px; color: var(--text-secondary); }
.path-row { display: flex; align-items: center; gap: 8px; }

.wrapper-config-box {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 8px;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
}
.wrapper-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.wrapper-field label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.template-presets {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0 8px;
}
.preview-banner {
  margin: 8px 0 6px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
}
.preview-banner code {
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}
.doctor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 18px;
}
.doc-card { padding: 16px 20px; }
.doc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.doc-name { font-weight: 700; font-size: 14px; }
.doc-sub { margin: 0; font-size: 12px; color: var(--text-secondary); }
</style>
