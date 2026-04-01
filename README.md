# 🎵 Apple Music Downloader GUI

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Electron](https://img.shields.io/badge/framework-Electron-blue.svg)
![Vue](https://img.shields.io/badge/frontend-Vue3-green.svg)
![Python](https://img.shields.io/badge/backend-Python-yellow.svg)

一个基于 Electron + Vue 3 开发的桌面端 Apple Music 音乐下载器。集成自动化登录、Cookie 嗅探与高质无损音频下载功能，旨在提供流畅、直观的下载体验。

---

### ✨ 主要特性

- 📁 **多源搜索**：基于 Apple Music 官方接口，支持高精度的单曲、专辑搜索。
- 🔓 **自动嗅探**：集成 Playwright 自动化环境，一键唤起登录界面，全自动捕获 Media-User-Token 等核心凭证。
- 🚀 **内核强劲**：底层调用优秀的 [gamdl](https://github.com/glomatico/gamdl) 下载引擎，支持多线程任务下载与封面元数据自动填充。
- 📦 **开箱即用**：支持打包为独立的 `.exe` 可执行文件。配置文件自动存放在系统 `AppData` 目录，确保在不同计算机上运行稳定。
- 🎨 **精美界面**：简约现代的 UI 设计，支持实时下载进度汇报与任务取消。

---

### 🛠️ 技术栈

- **桌面外壳**: [Electron 41.x](https://www.electronjs.org/)
- **前端界面**: [Vue 3](https://vuejs.org/) (组合式 API)
- **后端脚本**: [Python 3](https://www.python.org/) + [Playwright](https://playwright.dev/) + [gamdl](https://github.com/glomatico/gamdl)
- **打包工具**: [electron-builder](https://www.electron.build/)

---

### 📦 运行与打包

#### 1. 前提准备
- **Node.js**: 建议版本 v18+
- **Python**: 建议版本 3.8+
- 安装依赖库：
  ```bash
  pip install playwright gamdl
  playwright install chromium
  ```

#### 2. 本地开发
在项目根目录下：
```bash
# 安装生产环境依赖
npm install

# 启动 (会自动监听 8080 端口与 Electron 主进程)
npm start
```

#### 3. 编译打包 (生成 .exe)
我们已经将前端编译与 Electron 打包脚本深度整合，只需运行一次：
```bash
# 这一步会全自动完成 Vue 页面打包与跨平台安装包制作
npm run build
```
打包后的 `.exe` 安装程序将位于 `/release` 目录下。

---

### 🛡️ 免责声明

**本项目仅供学习、交流使用，严禁用于任何商业用途。**
使用者在下载音频时需自觉遵守相关法律法规。Apple Music 的版权归 Apple Inc. 所有，请尊重正版，鼓励购买 Apple Music 订阅服务。

---

### 🤝 贡献与支持
如果你发现了 Bug 或有任何改进建议，欢迎提交 Issue 或 Pull Request。

Made with ❤️ by [NBXW]
