# AM Downloader · Apple Music 下载器

Windows x64 桌面客户端，基于 Electron + Vue 3 + [gamdl](https://github.com/glomatico/gamdl)。当前版本 **1.3.1**。

1.3.1 修复 Windows 冻结引擎下载时 `No such option '--multiprocessing-fork'`，统一日文/中文日志为 UTF-8，并将旧 iTunes Store 搜索替换为 Apple Music 实际曲库搜索，解决中国大陆能播放但搜不到的歌曲。构建前强制执行真实冻结子进程的本地 HTTP/HLS 下载回归。

## 下载即用

发行版包含完整的 Electron 浏览器、独立 Python 运行时、gamdl 3.9.1、原生音频模块和下载组件。**用户不需要安装 Python、gamdl、Node.js、Playwright、FFmpeg 或 N_m3u8DL-RE 才能使用默认下载流程。**

支持 Windows 10/11 64 位。

- **安装版 `.exe`**：运行安装程序，然后打开 AM Downloader。
- **免安装 `.zip`**：解压整个文件夹，再运行其中的 `Apple Music 下载器.exe`。不要只复制单个 exe，也不要直接在压缩包里运行。

首次使用：

1. 点击右上角“登录 Apple Music”，在 Apple 官方页面完成你自己的账号登录与双重认证。
2. 搜索歌曲、歌手或专辑，或进入“链接下载”粘贴分享链接。
3. 加入下载队列，在“下载列表”查看进度、取消或重试。
4. 点击“打开下载目录”查看文件；默认按歌手、专辑整理。

默认 AAC 标准音质为有损格式，最高约 256 kbps。需要有效的 Apple Music 订阅和可用网络；曲目须在账号地区可播放。安装包不包含他人的账号、订阅或 Cookie。

## ALAC 与 Wrapper

ALAC 无损模式需要独立运行并登录的 [Wrapper v2](https://github.com/glomatico/wrapper-v2)。该服务运行于 Linux 环境，要求使用者自行提供上游要求的 Apple 原生库，因此不属于本 Windows 安装包中的普通依赖。

进入“偏好设置 → 音质与服务”：

1. 选择 ALAC，程序会启用 Wrapper 连接选项。
2. 按上游说明部署并登录兼容服务，确认 API 版本 `0.0.2`、账号状态 `authenticated`、播放服务就绪。
3. 填入 HTTP 地址、TCP 主机与端口，点击“检查连接”，然后保存。

默认 HTTP 地址 `http://127.0.0.1`、TCP 主机 `127.0.0.1`、端口 `10020`；如果映射了不同 HTTP 端口，请填写完整地址，如 `http://127.0.0.1:20020`。

Wrapper 使用它自己的登录账号，无需客户端网页 Cookie。连接测试检查 API、账号/播放状态与 TCP 建连，不等同于实际 ALAC 下载成功。ALAC 不会自动降级为 AAC；实际位深、采样率及格式由音源和账号支持决定。

## 1.3.0 更新

- 内置独立下载引擎，发行版不再寻找系统 Python 或 PATH 中的 gamdl。
- 打包前强制自检，缺少内置引擎时拒绝构建发行版；提供 `--diagnostics` 离线诊断。
- 四个独立页面：发现音乐、链接下载、下载列表、偏好设置；默认音质、账号与运行状态清楚可见。
- 批量下载队列最多同时运行两个任务；等待任务可取消，失败和取消的任务可重试。
- 设置草稿与已保存设置分开；任务保留创建时的配置快照，后续设置只影响新任务。
- 临时文件放在用户目录，避免写入 Program Files；可选外部工具归入高级选项。
- 继续保留内置浏览器登录、Cookie 校验、隔离 preload、无 shell 参数传递及下载错误判断。

## 维护者构建

普通用户无需执行以下命令。构建环境需要 Node.js 22+ 和 Python 3.14 x64。本次构建使用 Node 24、Python 3.14.4、PyInstaller 6.22.3、Electron 41.10.7。

```powershell
py -3.14 -m venv .venv-build
.\.venv-build\Scripts\python.exe -m pip install -r backend/requirements-build-lock.txt
.\.venv-build\Scripts\python.exe scripts/build-engine.py
npm ci
npm --prefix frontend ci
npm test
npm --prefix frontend run lint -- --no-fix
npm run build
```

构建引擎产物在 `vendor/gamdl-engine/`，最终安装包和免安装 ZIP 在 `release/`。**`npm run build` 会先验证内置引擎存在且版本正确**，禁止发布只有界面没有运行时的包。

源码启动：`npm run build:frontend` 后 `npm start`。热更新时先运行 `npm --prefix frontend run serve`，另开终端设置 `$env:MUSIC_DEV_URL='http://localhost:8080'` 再 `npm start`。

```powershell
# 独立引擎自检
.\vendor\gamdl-engine\gamdl-engine.exe --gui-self-test
# 最终程序离线诊断
& '.\release\win-unpacked\Apple Music 下载器.exe' --diagnostics
# 隔离配置下的隐藏 UI 测试（需要正常 Windows 桌面环境）
.\node_modules\electron\dist\electron.exe scripts/smoke-ui.cjs
```

## 数据与许可

配置、凭证和临时数据位于 Electron `userData` 目录；Windows 通常为 `%APPDATA%/apple_music/`。升级不清空这些数据。免安装版只免安装软件，仍使用用户数据目录。

Cookie 是敏感凭证，不应放进 Git、发行包或 issue。测试只使用隔离配置和假账号状态，发行包不带测试凭证或下载文件。

第三方组件清单与许可保存在安装目录的 `resources/engine/third-party.json`、`resources/engine/licenses/`；Electron 许可随其运行时提供。本项目为独立客户端，与 Apple Inc. 无隶属关系。

详细验证范围见 `TEST-REPORT.md`；真实账号登录、完整歌曲下载和 ALAC 音质仍需使用者账号验收。
