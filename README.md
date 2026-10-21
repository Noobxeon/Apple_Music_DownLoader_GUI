# 🎵 Apple Music Downloader GUI

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![Electron](https://img.shields.io/badge/framework-Electron_41.x-blue.svg)
![Vue](https://img.shields.io/badge/frontend-Vue3-green.svg)
![Python](https://img.shields.io/badge/backend-Python_3.10+-yellow.svg)
![gamdl](https://img.shields.io/badge/engine-gamdl_3.8+-red.svg)

基于 **Electron + Vue 3** 开发的高颜值桌面端 Apple Music 音乐下载器，全面升级对接 [glomatico/gamdl](https://github.com/glomatico/gamdl) 核心引擎，集成自动化凭证嗅探、多地区精准搜索、批量直链解析与高质量无损音频下载。

---

### ✨ 主要特性

- 🌐 **多地区 Storefront 切换**：内置中国 (CN)、美国 (US)、日本 (JP)、中国香港 (HK)、中国台湾 (TW)、英国 (GB) 地区切换，告别区域版权限制搜不到歌的问题。
- 🔗 **智能直链识别与批量下载**：
  - 在搜索栏直接粘贴任何 Apple Music 网页链接（单曲/专辑/歌单/MV），一键直接入库下载。
  - 专设 **批量直链下载面板**，支持同时粘贴多行链接批量并行解析与下载。
- 🔓 **自动化 Cookie 嗅探**：集成 Playwright 自动化环境，一键唤出 Apple 官方登录窗口，全自动抓取并转换 `media-user-token` 为标准 Netscape 格式，超时与异常自恢复。
- 🎛️ **高度可定制的音频引擎**：
  - **音频编码偏好**：支持自由选择 `aac-web` (推荐/最稳)、`aac`、`alac` (无损)、`atmos` (杜比全景声)、`ac3` 等。
  - **逐字歌词同步**：支持生成标准 `LRC`、精细逐字时轴 `TTML`、视频字幕 `SRT`，或按需关闭。
  - **元数据与附件**：支持下载独立高分辨率专辑封面图 (`--save-cover`)、自动导出 M3U8 播放列表 (`--save-playlist`)。
  - **自定义依赖路径**：支持指定本地 FFmpeg、N_m3u8DL-RE、Widevine (.wvd) 路径。
- 🛡️ **安全稳固进程调度**：修复了旧版本的 Shell 注入隐患，改用安全参数隔离派发；重构任务取消信号流，彻底解决进程残留与误报失败。
- 🎵 **内置试听播放器**：支持 30s 官方高清预览音频直接试听、进度拖拽与音量调节。
- 📦 **开箱即用与跨平台打包**：配置文件统一存放在系统 `AppData` 目录，支持通过 `npm run build` 一键打包生成独立的 Windows `.exe` 安装程序。

---

### 🛠️ 技术栈

- **桌面外壳**: [Electron 41.x](https://www.electronjs.org/)
- **前端界面**: [Vue 3](https://vuejs.org/)
- **后端脚本**: [Python 3.10+](https://www.python.org/) + [Playwright](https://playwright.dev/)
- **核心内核**: [glomatico/gamdl](https://github.com/glomatico/gamdl) (v3.8.x ~ v3.9.x)
- **打包工具**: [electron-builder](https://www.electron.build/)

---

### 📦 运行与打包

#### 1. 前提准备
- **Node.js**: v18+ (推荐 LTS)
- **Python**: v3.10+
- 安装 Python 依赖库与浏览器环境：
  ```bash
  pip install playwright gamdl
  playwright install chromium
  ```

#### 2. 本地开发
在项目根目录下：
```bash
# 1. 安装根目录与前端依赖
npm install
cd frontend && npm install && npm run build && cd ..

# 2. 启动桌面应用
npm start
```

#### 3. 编译打包 (生成 .exe)
已将前端构建与 electron-builder 打包深度联动：
```bash
npm run build
```
生成的安装程序文件将输出在 `/release` 目录下。

---

### 🛡️ 免责声明

**本项目仅供学习、交流与技术研究使用，严禁用于任何商业用途。**
使用者在下载音频时需自觉遵守相关法律法规。Apple Music 的版权归 Apple Inc. 及其合作版权方所有，请支持正版，订阅并使用 Apple Music 官方服务。

---

### 🤝 贡献与支持
如果你发现了 Bug 或有任何功能优化建议，欢迎提交 Issue 或 Pull Request！

Made with ❤️ by [NBXW]
