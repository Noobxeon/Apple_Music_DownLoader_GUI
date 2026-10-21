# Apple Music Downloader v1.3.1 回归测试

日期：2026-10-21。

- 25/25 Node 测试通过，新增 Apple Music 曲库解析、地区保留、去重、响应格式错误、URL 过滤、重定向兼容与网络请求回归。
- 最终 `app.asar` 的 13 项界面烟测通过，无警告：包括中国大陆 Yorushika 命中与原始日文标题显示、美国搜索返回 196 个项目，以及原有登录取消、设置保存、队列并发/取消/重试/筛选。测试在正常 Windows 进程环境运行，未使用 `--no-sandbox` 参数。
- 冻结 `gamdl-engine.exe` 在无系统 Python 的环境通过 gamdl 原有 `_download_ytdlp_async` 启动真实 Windows 子进程，完成本地 HTTP 和两分片 HLS 下载；下载内容 SHA-256 为 `a1f259d4365ed4320c377ce26f5c8c56dcdc9a89e7b641bfd8eabfbbeac86654`，逐字节比对通过。
- 原生路径包含中文、日文和空格；引擎 UTF-8 输出正确。回归已加入打包前强制检查。
- 最终 `resources/engine/gamdl-engine.exe` 与真实下载通过的引擎 SHA-256 一致，且最终资源路径的引擎再跑 HTTP/HLS/UTF-8 探针通过。
- v1.3.1 NSIS 安装器在隔离目录安装退出码 0；安装后应用 `--diagnostics` 返回 1.3.1/内置 gamdl 3.9.1，退出码 0。安装后的引擎 HTTP/HLS/UTF-8 探针通过。
- 实际读取 Apple Music 中国大陆 `yorushika` 搜索页得到 42 个歌曲/专辑项目，包括 `1648877323`《だから僕は音楽を辞めた》，返回 `/cn/` 链接。相同关键词旧 iTunes 接口在 `cn` 返回 0 条，在 `us`/`jp` 返回结果，证实旧搜索源不能代表中国大陆 Apple Music 曲库。
- 使用应用已有的登录 Cookie 对用户反馈的歌曲 `1648877323` 执行真实 AAC 下载，日志以 `Finished with 0 error(s)` 结束，退出码为 0。生成 M4A 大小为 8,533,528 字节，Mutagen 验证时长 242.9606 秒、`mp4a.40.2`、256,000 bit/s，歌名《だから僕は音楽を辞めた》和歌手 Yorushika 标签正确。Electron 的结果判断也返回成功，UTF-8 日志包含完整日文标题，没有 worker 参数错误。
- 真实下载仅验证这一首 AAC 曲目；ALAC、批量长时间运行和其他账号/网络未因此得到验证。账号凭证和音乐文件均不包含在发行包及源码中。

以下保留 v1.3.0 历史验证记录。其引擎导入/CLI 测试没有覆盖真正的下载子进程，因此没有发现本次修复的冻结入口缺陷。

---

# Apple Music Downloader v1.3.0 测试报告

测试日期：2026-10-21  
平台：Windows 10 x64  
应用：Electron 41.10.7 + Vue 3  
内置下载引擎：gamdl 3.9.1（PyInstaller 独立运行时）

## 发布验收结果

| 项目 | 结果 | 覆盖内容 |
|---|---|---|
| Node 单元与集成测试 | 21/21 通过 | URL 与参数校验、Cookie、登录生命周期、Wrapper 预检、进程错误与超时、结果判断、双并发队列、取消与重试 |
| Vue lint | 通过 | 无 lint 错误 |
| production 前端构建 | 通过 | Vue production bundle 成功生成 |
| Git diff 格式检查 | 通过 | 无空白错误 |
| 独立引擎自检 | 通过 | gamdl、原生 `_ammuxer`、Crypto、pywidevine、pyplayready、yt-dlp、证书包均可导入 |
| 最终 `app.asar` UI 烟测 | 11/11 通过 | 首页、紧凑布局、preload 隔离、登录窗口、真实 Apple 搜索、链接解析、设置落盘、并发、取消、失败、重试、筛选 |
| NSIS 安装测试 | 通过 | 静默安装退出码 0；应用、卸载器、内置引擎齐全；安装后诊断返回 gamdl 3.9.1 |
| ZIP 便携包测试 | 通过 | 解压后应用和内置引擎齐全；诊断返回 gamdl 3.9.1 |

安装版和 ZIP 版的诊断均把 `PYTHONHOME`、`PYTHONPATH` 指向不存在的目录，仍识别到 `bundled: true` 和 gamdl 3.9.1，证明发行包不依赖用户安装 Python。自动化环境的虚拟显卡无法启动 Electron GPU 子进程，因此发布诊断和隐藏窗口 UI 烟测使用 Chromium 的无 GPU/无沙箱测试参数；应用本身仍保留正常 Electron 渲染设置。

## UI 烟测场景

1. 打包后的 preload 只暴露限定 API，renderer 无 Node `require`。
2. 1280×860 与 1000×700 两种窗口尺寸无横向溢出。
3. 缺少凭证时，真实下载 IPC 明确拒绝任务。
4. Electron 原生登录窗口可打开、取消并清理状态。
5. Apple Music 直链可解析。
6. Apple 搜索接口返回 157 条结果。
7. ALAC 选择会启用并说明 Wrapper，设置可通过真实 IPC 保存。
8. 一次加入 5 个任务时最多启动 2 个。
9. 成功、失败、取消都会释放队列槽位。
10. 失败或取消任务可以重试。
11. 下载状态筛选正常。

## 尚未声称通过的项目

测试环境没有维护者的 Apple ID、有效媒体授权或已部署的 Wrapper v2，因此没有执行真实歌曲下载、真实账号登录成功、ALAC 解密和长时间批量下载。发布前若要对这些能力作正式承诺，应使用维护者账号和独立 Linux Wrapper 环境做一次端到端验收。

Windows EXE 当前没有 Authenticode 代码签名。安装包可以使用，但部分电脑可能显示 SmartScreen 提示；正式公开发布建议使用维护者的代码签名证书签名。

## SHA-256

- `Apple-Music-Downloader-1.3.0-x64.exe`: `957D82065B99166B4DDAB417B85C4099A5ECF65C6276F892DF7139C7679BFD49`
- `Apple-Music-Downloader-1.3.0-x64.zip`: `0DDB2EF2F5D1F7483631666AF2EA8F920BF06A6847531B69AE4DF71B9505E28A`
