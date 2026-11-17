<template>
  <div v-if="store.authModalOpen" class="modal-backdrop" @click.self="close">
    <div class="modal-card" style="max-width: 620px">
      <div class="modal-header">
        <h3>Apple Music 账户凭证中心 (免 Python 原生安全登录)</h3>
        <button class="btn btn-icon btn-ghost" @click="close">
          <IconSymbol name="x" :size="18" />
        </button>
      </div>

      <div class="modal-body">
        <div class="cookie-status-banner" :class="{ ok: cookie.valid, warn: !cookie.valid }">
          <div class="cs-left">
            <IconSymbol :name="cookie.valid ? 'check' : 'key'" :size="20" />
            <div>
              <div class="cs-title">
                {{ cookie.valid ? '核心通行证 media-user-token 已就绪' : (cookie.expired ? '登录凭证已过期，请刷新' : '尚未配置有效的 Apple Music 凭证') }}
              </div>
              <div class="cs-sub">
                <template v-if="cookie.exists">
                  共 {{ cookie.count }} 条记录
                  <span v-if="expiryText"> · 有效期至 {{ expiryText }}</span>
                </template>
                <template v-else>
                  下载高品质音频需有效的 Apple Music 会员会话凭证
                </template>
              </div>
            </div>
          </div>

          <div v-if="cookie.exists" class="cs-actions">
            <button class="btn btn-sm" @click="handleExport">导出备份</button>
            <button class="btn btn-sm btn-danger" @click="handleClear">清除</button>
          </div>
        </div>

        <div class="pill-tabs" style="margin-bottom: 18px; width: 100%">
          <button class="pill-tab" style="flex:1; justify-content:center" :class="{ active: mode === 'browser' }" @click="mode = 'browser'">
            1. 内置安全窗口登录
          </button>
          <button class="pill-tab" style="flex:1; justify-content:center" :class="{ active: mode === 'file' }" @click="mode = 'file'">
            2. 导入 cookies.txt
          </button>
          <button class="pill-tab" style="flex:1; justify-content:center" :class="{ active: mode === 'paste' }" @click="mode = 'paste'">
            3. 粘贴 Token / 文本
          </button>
        </div>

        <!-- Mode 1: Native Electron Sandboxed BrowserWindow Login -->
        <div v-if="mode === 'browser'" class="auth-pane">
          <p class="pane-desc">
            无需安装外部浏览器或 Python 环境！点击下方按钮将唤起应用内置的沙箱隔离安全窗口，完成 Apple ID 登录与双重认证后，自动提取 <code>media-user-token</code> 并立即关闭窗口。
          </p>
          <div style="display: flex; gap: 10px">
            <button class="btn btn-primary" style="flex: 1; height: 42px" :disabled="loggingIn" @click="handleBrowserLogin">
              <IconSymbol name="key" :size="16" />
              <span>{{ loggingIn ? '正在等待登录与双重认证...' : '启动 Apple Music 内置安全登录' }}</span>
            </button>
            <button v-if="loggingIn" class="btn btn-danger" style="height: 42px" @click="handleCancelLogin">
              取消登录
            </button>
          </div>

          <div v-if="loginLogs.length > 0" class="login-log-box selectable">
            <div v-for="(l, i) in loginLogs" :key="i">{{ l }}</div>
          </div>
        </div>

        <!-- Mode 2: Import cookies.txt -->
        <div v-if="mode === 'file'" class="auth-pane">
          <p class="pane-desc">
            如果你已从外部浏览器导出了已登录 <code>music.apple.com</code> 的 Netscape 格式 <code>cookies.txt</code>，可直接导入校验使用。
          </p>
          <button class="btn btn-primary" style="width: 100%; height: 42px" @click="handleImportFile">
            <IconSymbol name="folder" :size="16" />
            <span>选择本地 cookies.txt 文件导入</span>
          </button>
        </div>

        <!-- Mode 3: Paste raw Netscape text or bare media-user-token -->
        <div v-if="mode === 'paste'" class="auth-pane">
          <p class="pane-desc">
            支持直接粘贴完整的 Netscape Cookie 文本，或直接粘贴浏览器开发者工具中的 <code>media-user-token</code> 值：
          </p>
          <textarea
            v-model="pastedText"
            rows="6"
            class="textarea-control"
            style="width: 100%; font-family: monospace; margin-bottom: 12px"
            placeholder="# Netscape HTTP Cookie File... 或直接粘贴 media-user-token 字符串"
          ></textarea>
          <button
            class="btn btn-primary"
            style="width: 100%"
            :disabled="!pastedText.trim()"
            @click="handleSavePasted"
          >
            验证并保存凭证
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import IconSymbol from './IconSymbol.vue';
import { store, refreshEnvironment, notify } from '../store/appStore';

const api = window.appleMusic || {};
const mode = ref('browser');
const loggingIn = ref(false);
const loginLogs = ref([]);
const pastedText = ref('');

const cookie = computed(() => store.env.cookie || {});
const expiryText = computed(() => {
  if (!cookie.value.expiresAt) return '';
  return new Date(cookie.value.expiresAt).toLocaleDateString('zh-CN');
});

let unsubLog = null;
onMounted(() => {
  if (api.onLoginLog) {
    unsubLog = api.onLoginLog(msg => loginLogs.value.push(msg));
  }
});
onBeforeUnmount(() => {
  if (unsubLog) unsubLog();
});

async function handleBrowserLogin() {
  loggingIn.value = true;
  loginLogs.value = ['正在打开内置隔离安全登录窗口...'];
  try {
    await api.runBrowserLogin();
    await refreshEnvironment(true);
    notify('Apple Music 登录凭证已自动捕获并保存！', 'success');
    close();
  } catch (err) {
    notify(err.message || '登录未完成', 'warning');
  } finally {
    loggingIn.value = false;
  }
}

function handleCancelLogin() {
  api.cancelLogin?.();
}

async function handleImportFile() {
  try {
    const filePath = await api.selectFile({
      title: '选择 Netscape 格式 cookies.txt',
      filters: [{ name: 'Cookies Text', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }]
    });
    if (!filePath) return;
    await api.importCookieFile(filePath);
    await refreshEnvironment(true);
    notify('外部 cookies.txt 导入验证成功！', 'success');
    close();
  } catch (err) {
    notify(err.message || '导入失败', 'danger');
  }
}

async function handleSavePasted() {
  try {
    await api.saveCookieContent(pastedText.value);
    pastedText.value = '';
    await refreshEnvironment(true);
    notify('凭证验证通过并已保存！', 'success');
    close();
  } catch (err) {
    notify(err.message || '凭证格式校验未通过', 'danger');
  }
}

async function handleExport() {
  try {
    const dest = await api.saveFileDialog({
      title: '导出备份 cookies.txt',
      defaultPath: 'apple_music_cookies.txt'
    });
    if (!dest) return;
    await api.exportCookieFile(dest);
    notify('Cookie 备份已成功导出', 'success');
  } catch (err) {
    notify(err.message || '导出失败', 'danger');
  }
}

async function handleClear() {
  await api.clearCookie();
  await refreshEnvironment(true);
  notify('已清除保存的登录凭证', 'info');
}

function close() {
  store.authModalOpen = false;
}
</script>

<style scoped>
.cookie-status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  margin-bottom: 18px;
  border: 1px solid var(--border-subtle);
}
.cookie-status-banner.ok {
  background: var(--success-soft);
  border-color: rgba(34, 197, 94, 0.3);
  color: var(--success);
}
.cookie-status-banner.warn {
  background: var(--warning-soft);
  border-color: rgba(245, 158, 11, 0.3);
  color: var(--warning);
}
.cs-left { display: flex; align-items: center; gap: 12px; }
.cs-title { font-weight: 700; font-size: 13.5px; }
.cs-sub { font-size: 12px; opacity: 0.88; margin-top: 2px; }
.cs-actions { display: flex; gap: 6px; }
.pane-desc { margin: 0 0 14px; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.pane-desc code { padding: 1px 5px; border-radius: 4px; background: var(--bg-elevated); color: var(--accent); }
.login-log-box {
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  background: #0a0b0f;
  color: #a5f3fc;
  font-family: Consolas, monospace;
  font-size: 12px;
  max-height: 140px;
  overflow-y: auto;
}
</style>
