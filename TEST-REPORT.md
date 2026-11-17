# Apple Music Studio Downloader v2.0.0 测试验证报告

## 1. 单元与集成测试 (`npm test`)

共 **30/30** 项测试全部通过 (`fail 0`)：

- **自包含引擎隔离验证 (`tests/bundle.test.js`)**：
  - 打包态严禁回退至宿主系统 Python，强制校验内置 `gamdl-engine.exe` (`gamdl 3.9.1` + Rust `_ammuxer` 原生模块)。
  - 在清空 `PATH=""` 与伪造无效 `PYTHONHOME` 环境下，通过 `--gui-self-test`、`--gui-download-self-test`（多进程 Worker HTTP/HLS 下载与中日文 UTF-8 输出校验）以及 `--gui-validate-args` 参数边界校验。
- **参数构建与 Wrapper 预检 (`tests/engine.test.js`)**：
  - 验证无 Shell 参数边界安全、Apple Music 域名白名单、ALAC + Wrapper v2 (`API 0.0.2`) HTTP/TCP 握手检测、错误摘要精准判定。
- **主进程生命周期与沙箱登录 (`tests/main.test.js`)**：
  - 验证内置沙箱隔离登录窗口 (`contextIsolation: true, sandbox: true`) 免 Python 提取 `media-user-token`、取消/超时/关闭资源回收、预检阶段取消竞态保护。
- **并发队列调度 (`tests/queue.test.js`)**：
  - 验证并发上限严格受控、排队取消零进程启动、运行中取消槽位保护与异常恢复。
- **中国大陆真订阅曲库检索 (`tests/search.test.js`)**：
  - 验证直连 Apple Music 中国大陆订阅曲库解析（保留传统 iTunes Store 缺失的曲目如《だから僕は音楽を辞めた》`1648877323`）及跨区防重定向保护。
- **Studio v2.0 扩展套件 (`tests/studio_v2.test.js`)**：
  - 验证 `AppStore`（主题、并发配置、我的收藏、历史归档持久化）。
  - 验证三合一凭证中心（裸 `media-user-token` 自动封装 Netscape 格式及过期时间探测）。
  - 验证 `LibraryManager` 本地曲库扫描、`.lrc` 同步歌词时间轴解析，以及通过内置独立引擎 `--gui-inspect-media` 调用 `mutagen` 解析音频元数据标签。
  - 验证 `DownloadQueueManager` 实时曲目序号 `[X/Y]`、曲名、实时下载速率与百分比提取。
  - 验证 `AppleMusicCatalog` 全球实时榜单与国内高速 CDN 兜底机制。

## 2. 无环境桌面 UI 冒烟与视觉回归测试 (`npm run smoke:ui`)

在清空系统 `PATH`（模拟无 Python 纯净用户电脑）下启动真实 Electron 窗口并通过全部 **7 项** 端到端交互验证：

1. `preload.js` 双桥接隔离校验 (`window.appleMusic` & `window.musicAPI`，且渲染进程 `window.require === undefined`)。
2. 内置 `gamdl 3.9.1` 自包含引擎就绪状态指示灯校验。
3. Studio Dark 深色黑曜石主题下实时热歌榜与冠军专辑渲染 (`01-studio-discover-dark.png`)。
4. 中国大陆 (`CN`) 订阅曲库检索 `yorushika` 渲染单曲、专辑、MV、歌手四维结果及曲目时长 (`02-studio-search-cn.png`)。
5. 智能单链深度解析与批量多链/TXT 导入视图渲染 (`03-studio-url-parser.png`)。
6. 内置沙箱 Apple ID 登录窗口真实唤起、取消及窗口句柄清理验证。
7. 工作站五维参数设置、环境诊断中心及深浅双主题 (`dark` / `light`) 实时切换验证 (`04-studio-settings-dark.png`, `05-studio-settings-light.png`)。
