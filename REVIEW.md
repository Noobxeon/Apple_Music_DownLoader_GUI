# v1.3.1 用户反馈修复

- 冻结入口缺少 `multiprocessing.freeze_support()`，gamdl 的 yt-dlp worker 重启 EXE 时进入 Click 而被拒绝。入口现在先分流 worker，再导入 CLI；构建验收增加真实冻结 HTTP/HLS 子进程下载。
- 冻结 Python 启动时未按环境变量应用输出编码；stdout/stderr 现在显式配置 UTF-8，与 Electron 解码一致。
- 旧 iTunes Store 搜索不等于 Apple Music 订阅曲库。改为解析官方 Apple Music 搜索页的结构化数据，保持用户选择的地区与原始曲目 URL，并验证中国大陆 Yorushika 的目标歌曲。

# v1.3.0 完整发行版更新

本版将 Python 与 gamdl 冻结为独立 Windows 引擎，并通过 electron-builder extraResources 放入 `resources/engine/`。发行版优先且只使用内置引擎，包损坏时提示重新安装，不回退到系统 Python。

界面重构为四个独立页面；设置按下载偏好、音质与服务、运行状态、关于软件分组。默认下载路径不再暴露 Python 配置；ALAC 服务依赖在选择音质时说明。

新增两路并发队列、取消/重试状态机、任务配置快照、每任务用户目录临时文件、独立离线诊断和打包前校验。单元测试、独立引擎测试、隐藏窗口 UI 测试、真实搜索、最终程序诊断的结果见 `TEST-REPORT.md`。

以下为 v1.2.0 的历史代码审查，保留用于解释修复来源；其中“未打包 Python/引擎”的限制已在 v1.3.0 解决。Wrapper 服务仍由使用者单独部署。

---

# 代码审查与更新记录

审查日期：2026-10-21。项目基线 `08e72715de5bf883b5c354e4ba15979bc8ebf097`；上游 gamdl 检查到 `3.9.1`（源码 HEAD `bc3bcd25ed61dcdb78c28ffb0ef32053b618c7e3`，并核对 `3.9.1` tag 的 Wrapper API）。

## Issue 对应关系

[Issue #1](https://github.com/Noobxeon/Apple_Music_DownLoader_GUI/issues/1)：Release 登录一直“处理中”。评论反馈安装依赖并手动执行 Cookie Helper 后可用，随后提出 ALAC 和 Wrapper 集成需求。该 issue 没有提供复现日志；以下登录修复针对已证实的依赖设计缺陷，不把真实账号登录成功当作已验证事实。

## 审查发现及修复

| 级别 | 原位置与触发条件 | 影响 | 本版处理 |
|---|---|---|---|
| P1 | `main.js` 的 `run-login`、`backend/cookie_helper.py`：安装包调用系统 Python 和 Playwright，缺少依赖预检、显式取消入口及主进程截止时间 | EXE 用户无法打开浏览器，登录异常难定位 | 改为 Electron 原生 BrowserWindow + Cookie session；移除 PythonShell/Playwright 登录链路；添加提示、取消、5 分钟超时和全部退出路径清理 |
| P1 | `main.js` 的下载 `spawn` 在 Windows 设置 `shell: true` | 参数数组仍会交由 cmd 解释，URL 的 `&` 可截断参数，恶意输入存在命令执行风险 | 使用 `python -m gamdl`，始终 `shell: false`；校验 HTTPS Apple Music 主机与路径 |
| P1 | `main.js` 用 `downloaded` / `already exists` 或部分 error 数量判断成功 | 批量任务中前面成功、后面失败，甚至 3 个以上错误会误报成功；gamdl 早退可能仍返回 0 | 必须退出码为 0、存在 0-error 结束汇总且无明确错误；识别上游跳过下载的关键失败信息，添加任务日志 |
| P1 | `main.js` 对所有任务强制 Cookie、没有 Wrapper 参数；前端只提供 ALAC 下拉框 | 选中 ALAC 并不构成可用的无损链路，Wrapper 用户仍被 Cookie 拦截 | 固定 gamdl 3.9.1，传递 v2 HTTP/TCP 参数，检查 API 0.0.2、服务登录与播放状态；Wrapper 模式无需 Cookie；ALAC 缺少 Wrapper 时明确阻止 |
| P1 | `frontend/src/App.vue` 保存配置、重试时直接向 IPC 传 Vue Proxy | Electron structured clone 无法克隆响应式对象，可造成设置不保存、重试报错或界面卡在下载中 | IPC 前转普通 JSON 对象；下载和重试捕获 IPC 异常并结束任务状态 |
| P2 | `main.js` 使用 Node integration + 关闭 context isolation | renderer 代码拥有 Node 权限，扩大内容注入影响 | renderer sandbox、context isolation、禁用 Node；增加限定通道的 preload；阻止主窗口网页导航和弹窗 |
| P2 | Cookie 只按文本是否包含 token 名判断；检测中取消无占位，终止后立即重试复用 ID | 空/过期凭证被当作有效；可能残留下载进程或混淆旧新任务 | 解析 Netscape Cookie，检查域名、有效期和非空值；预检前占用任务 ID；取消后等原任务结束才能重试；退出清理进程树 |
| P2 | 使用任意系统 gamdl 及用户全局 gamdl 配置 | CLI/Wrapper 参数随版本漂移，独立运行时的配置可能触发隐藏交互 | 精确检查 3.9.1，使用同一 Python 检测和运行；传 `--no-config-file`，关闭子进程 stdin，提供环境检查 |

ALAC 连接能力是对外部 Wrapper 的客户端集成；本次没有将 Linux Wrapper、Docker 或 Apple 原生库打包为 Windows 服务。界面和 README 已明确这一边界，避免继续承诺安装 EXE 即能无损下载。

## 自动验证

- `npm test`：14 项通过，包含登录成功/取消/超时/关闭/写入失败、重复登录、Cookie 格式、进程预检取消、shell 关闭、错误汇总、Wrapper API/登录/播放/TCP 预检和 CLI 参数。
- `npm --prefix frontend run lint -- --no-fix`：通过。
- `npm --prefix frontend run build`：通过。
- `node --check`：主进程、preload 和引擎模块通过。
- Windows x64 NSIS 安装包构建通过（Electron 41.10.7、electron-builder 26.15.3）；未做证书签名。
- 源码与最终打包 `app.asar` 均在正常 Windows 环境通过隐藏窗口 UI 测试：实际 production 前端、preload 隔离、Wrapper/ALAC 设置保存、配置落盘及无横向溢出。测试仅在内存中调整主窗口为隐藏并直接加载 production 页面，使用独立测试配置。
- 在独立 Python 3.14 虚拟环境成功安装 gamdl 3.9.1 Windows wheel；真实 `python -m gamdl --version`、`--help`、Cookie 与 Wrapper 两种参数数组的 Click 解析均通过。
- 修复首次环境检测阻塞配置初始化导致的界面延迟与设置覆盖风险。

## 依赖审计及剩余限制

保留现有 Vue CLI 构建体系，执行兼容范围内依赖更新：Electron 从锁定的 41.0.3 更新到 41.10.7，electron-builder 更新到 26.15.3；移除运行时 python-shell。根依赖审计由 41 条（含 1 critical、27 high）降至 8 moderate，均在构建工具链；根 `npm audit --omit=dev` 为 0。前端仍有 Vue CLI/ESLint/PostCSS 等旧构建依赖告警（本次兼容更新后 43 条：19 high、24 moderate），没有执行会降级 Vue CLI 或跨主版本升级 ESLint 的 `--force` 修复。后续可单独迁移到 Vite/新版 ESLint，并重新验证构建。

没有真实 Apple ID 或已登录的 Wrapper，无法声称完成端到端登录、下载或 ALAC 音质验证。首次受限环境中的 Electron UI 测试触发了 GPU 子进程崩溃弹窗；清理测试进程后，在正常 Windows 执行环境使用默认渲染成功复测，未为发布版本关闭浏览器安全隔离。安装包也未做代码签名，发布前应使用维护者证书签名并实机验收。
