# Apple Music Studio Downloader v2.0

![Version](https://img.shields.io/badge/version-2.0.0-FA243C.svg)
![Electron](https://img.shields.io/badge/Electron-41.x-2B2E3A.svg)
![Vue](https://img.shields.io/badge/Vue-3_Composition_API-42B883.svg)
![Engine](https://img.shields.io/badge/Bundled_Engine-gamdl_3.9.1-FA243C.svg)

基于 **Electron 41 + Vue 3 (Composition API)** 全面重构的专业级桌面端 Apple Music 下载工作站。**Windows 发行版已内置完整的独立 `gamdl 3.9.1` 下载与混流引擎（含原生 Rust `_ammuxer` 扩展），开箱即用，无需用户安装 Python 或外部浏览器驱动！**

---

## v2.0 全新重构亮点

### 1. 全新 Studio 双主题工作站视觉设计
- **定制无边框桌面交互**：集成全局快捷键检索栏 (`Ctrl+K`)、多国曲库秒切胶囊、凭证健康指示灯与窗口控制按钮。
- **双色主题无缝切换**：默认搭载 **深色黑曜石 (Studio Dark)** 沉浸式毛玻璃视觉，同时支持一键切换 **浅色清爽 (macOS Light)** 外观。
- **沙箱与隔离安全架构**：全面启用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 及自定义 `local-media://` 流媒体协议（支持 `HTTP 206 Range` 拖拽定位）。

### 2. 全球实时榜单、真曲库四维搜索与专辑点选
- **Apple Music 实时热榜 (Explore & Charts)**：启动即呈现官方实时热歌榜 Top 50 与热门专辑榜 Top 25，支持一键试听全榜或批量下载 Top 10。
- **中国大陆真订阅曲库 + 四维检索**：直连 Apple Music 订阅曲库检索（彻底解决传统 iTunes Store 接口遗漏中国大陆订阅曲目的痛点），同时并行检索 **单曲、专辑、MV 音乐视频、歌手主页**，支持列表复选框多选批量下载。
- **专辑详情与单链深度预解析**：点击任意专辑或粘贴 Apple Music 链接即可预览高清封面与全部曲目清单，自由勾选单曲或整张下载；支持批量粘贴链接或导入 `.txt` 链接清单。

### 3. 商用级并发队列中心与全量 gamdl 3.9.1 参数
- **多线程并发队列调度**：支持 `1~5` 线程并发控制、任务进度条与实时网速解析、**单任务实时终端日志查看器**、一键重试全部失败项、系统桌面通知以及持久化历史归档记录。
- **全维度音质、Wrapper v2 与歌词配置**：
  - 编码优先级：`aac-web`（256kbps 开箱即用）、`aac-he-web`、`aac`、`alac`（连接 Wrapper v2 解锁真无损）、`atmos`（杜比全景声）、`ac3`。
  - MV 视频画质：最高支持 `4K Ultra HD (2160p)` 与 `MP4 / M4V` 封装容器。
  - 逐字同步歌词：支持 `LRC`、`TTML`（Apple 逐字音节级时轴）、`SRT`，以及 **仅下载歌词模式 (`--synced-lyrics-only`)**。
  - 进阶特性：SQLite 历史去重归档库 (`--database-path`)、最高 `3000x3000` 母版封面保存、M3U8 歌单导出、自定义目录/文件名命名模板与实时路径预览。

### 4. 本地音乐库、同步滚动歌词与无损格式转码
- **本地原声播放与 LRC 同步滚动**：自动扫描下载目录，底部毛玻璃播放器支持完整播放本地音频，并自动加载 `.lrc` 歌词逐行高亮滚动、点击歌词跳转播放位置。
- **内置无损音频流与内嵌标签检验器**：直接调用内置独立引擎的 `mutagen` 模块解析音频采样率 (kHz)、位深 (bit)、码率 (kbps)、编码规格与内嵌封面原子标签。
- **内置 FFmpeg 格式转换器**：支持在本地音乐库将已下载音频一键或批量无损转码为 **MP3 (320kbps) / FLAC / WAV** 并完整保留元数据。

### 5. 免外部依赖三合一凭证中心
- **内置沙箱安全窗口登录**：直接在应用内打开隔离的 Apple Music 官方登录窗口完成登录与双重认证，自动捕获 `media-user-token`（无需安装 Python 或 Playwright）。
- **导入 / 粘贴 / 备份**：同时支持导入外部 Netscape `cookies.txt`、直接粘贴 `media-user-token` 字符串自动封装校验，以及一键导出凭证备份。

---

## 快速使用（普通用户）

1. 前往 [Releases](https://github.com/Noobxeon/Apple_Music_DownLoader_GUI/releases) 下载最新版本的 `Apple-Music-Downloader-2.0.0-x64.exe` 安装包（或便携版 `.zip` 完整解压）。
2. 启动软件，点击右上角 **登录凭证** -> **启动 Apple Music 内置安全登录** 完成账号登录。
3. 在【探索热榜】、【全能搜索】或【链接解析与批量】中点击下载即可（默认 `AAC-Web` 流程已内置全部依赖，无需安装 Python；如需本地转码 MP3/FLAC 可按需配置 FFmpeg）。

---

## 开发者构建指南

```bash
# 1. 构建内置自包含 Python 引擎 (gamdl 3.9.1 + PyInstaller)
python -m venv .venv-build
.venv-build\Scripts\pip install -r backend\requirements-build.txt
.venv-build\Scripts\python scripts\build-engine.py

# 2. 安装前端与 Electron 依赖并构建前端
npm install
cd frontend && npm install && npm run lint && npm run build && cd ..

# 3. 运行全部单元/集成测试与无环境 UI 冒烟测试
npm test
npm run smoke:ui

# 4. 打包生成 Windows NSIS 安装包与便携 ZIP 包
npm run build
```

---

## 免责声明

**本项目仅供个人学习、技术研究与交流使用，严禁用于任何商业及非法传播用途。**
音频及 MV 内容版权归 Apple Inc. 及对应唱片公司所有，请尊重正版音乐并订阅官方 Apple Music 服务。

Windows 发行包未做商业 Authenticode 代码签名，首次安装如遇 SmartScreen 提示请选择“更多信息 -> 仍要运行”。
