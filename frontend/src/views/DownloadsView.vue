<template>
  <div class="downloads-view">
    <div class="view-header">
      <div class="view-title-group">
        <h1>并发任务与历史中心</h1>
        <p>最大并发通道: {{ store.config.maxConcurrent }} 线程 · 自动队列调度与实时内核日志捕获</p>
      </div>

      <div class="header-btns">
        <button v-if="failedCount > 0" class="btn btn-sm" @click="handleRetryAll">
          <IconSymbol name="refresh" :size="13" /> 重试全部失败项 ({{ failedCount }})
        </button>
        <button v-if="finishedInQueueCount > 0" class="btn btn-sm" @click="handleClearFinished">
          清理已结束任务
        </button>
        <button v-if="activeCount > 0" class="btn btn-sm btn-danger" @click="handleCancelAll">
          全部终止
        </button>
        <button class="btn btn-sm btn-primary" @click="openOutputFolder">
          <IconSymbol name="folder" :size="14" /> 打开输出目录
        </button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card surface-card">
        <span class="kpi-label">下载中</span>
        <span class="kpi-val info">{{ downloadingCount }}</span>
      </div>
      <div class="kpi-card surface-card">
        <span class="kpi-label">排队等待</span>
        <span class="kpi-val warning">{{ queuedCount }}</span>
      </div>
      <div class="kpi-card surface-card">
        <span class="kpi-label">本次已完成</span>
        <span class="kpi-val success">{{ completedCount }}</span>
      </div>
      <div class="kpi-card surface-card">
        <span class="kpi-label">异常 / 已取消</span>
        <span class="kpi-val danger">{{ failedCount }}</span>
      </div>
    </div>

    <!-- Sub Tabs -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <div class="pill-tabs">
        <button class="pill-tab" :class="{ active: subTab === 'queue' }" @click="subTab = 'queue'">
          实时队列 ({{ store.queue.length }})
        </button>
        <button class="pill-tab" :class="{ active: subTab === 'history' }" @click="subTab = 'history'">
          持久化历史记录 ({{ store.history.length }})
        </button>
      </div>

      <button v-if="subTab === 'history' && store.history.length > 0" class="btn btn-sm btn-ghost" @click="handleClearHistory">
        <IconSymbol name="trash" :size="13" /> 清空历史归档
      </button>
    </div>

    <!-- Queue List -->
    <div v-if="subTab === 'queue'">
      <div v-if="store.queue.length === 0" class="empty-state surface-card">
        <div class="empty-state-icon"><IconSymbol name="download" :size="26" /></div>
        <h3>当前没有进行中的下载任务</h3>
        <p>前往【探索热榜】、【全能搜索】或【链接解析】添加歌曲、专辑或歌单。</p>
      </div>

      <div v-else class="task-stack">
        <div v-for="t in store.queue" :key="t.id" class="task-item surface-card">
          <img :src="t.cover || DEFAULT_COVER" class="task-cover" alt="" />

          <div class="task-center">
            <div class="task-top-row">
              <span class="task-title ellipsis" :title="t.title">{{ t.title }}</span>
              <span class="tag-badge neutral">{{ t.type }}</span>
              <span class="tag-badge accent">{{ (t.codec || 'aac-web').toUpperCase() }}</span>
              <span class="tag-badge" :class="statusBadgeClass(t.status)">
                {{ statusText(t.status) }}
              </span>
            </div>

            <div class="task-sub-row ellipsis">
              <span>{{ t.artist || t.url }}</span>
              <span class="task-prog-msg">{{ t.progText }}</span>
            </div>

            <div class="progress-track">
              <div
                class="progress-fill"
                :class="t.status"
                :style="{ width: `${t.status === 'completed' ? 100 : (t.percent || 0)}%` }"
              ></div>
            </div>
          </div>

          <div class="task-actions">
            <button class="btn btn-icon btn-sm" @click="openTaskLogModal(t)" title="查看内核实时日志">
              <IconSymbol name="terminal" :size="14" />
            </button>

            <button
              v-if="t.status === 'downloading' || t.status === 'queued'"
              class="btn btn-sm btn-danger"
              @click="cancelOne(t.id)"
            >
              取消
            </button>

            <button
              v-if="t.status === 'failed' || t.status === 'cancelled'"
              class="btn btn-sm"
              @click="retryOne(t.id)"
            >
              <IconSymbol name="refresh" :size="13" /> 重试
            </button>

            <button class="btn btn-icon btn-sm" @click="openDir(t.saveDir)" title="打开输出文件夹">
              <IconSymbol name="folder" :size="14" />
            </button>

            <button
              v-if="t.status !== 'downloading'"
              class="btn btn-icon btn-sm btn-ghost"
              @click="removeOne(t.id)"
              title="从队列移除"
            >
              <IconSymbol name="x" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Persistent History List -->
    <div v-else>
      <div v-if="store.history.length === 0" class="empty-state surface-card">
        <p>尚无历史下载记录</p>
      </div>

      <div v-else class="surface-card">
        <div class="track-head">
          <div style="flex: 3">任务标题</div>
          <div style="width: 90px">类型 / 编码</div>
          <div style="width: 110px">状态</div>
          <div style="width: 150px">完成时间</div>
          <div style="width: 120px; text-align: right">操作</div>
        </div>

        <div v-for="h in store.history" :key="h.id" class="track-row">
          <div style="flex: 3; display: flex; align-items: center; gap: 10px; min-width: 0">
            <img :src="h.cover || DEFAULT_COVER" style="width:36px;height:36px;border-radius:7px;object-fit:cover" alt="" />
            <div class="ellipsis">
              <div class="ellipsis" style="font-weight: 600">{{ h.title }}</div>
              <div class="ellipsis" style="font-size: 11.5px; color: var(--text-muted)">{{ h.artist || h.url }}</div>
            </div>
          </div>

          <div style="width: 90px; font-size: 12px; color: var(--text-secondary)">
            {{ h.type }} · {{ (h.codec || 'aac').toUpperCase() }}
          </div>

          <div style="width: 110px">
            <span class="tag-badge" :class="statusBadgeClass(h.status)">
              {{ statusText(h.status) }}
            </span>
          </div>

          <div style="width: 150px; font-size: 12px; color: var(--text-muted)">
            {{ formatTime(h.completedAt) }}
          </div>

          <div style="width: 120px; display: flex; justify-content: flex-end; gap: 6px">
            <button class="btn btn-sm" @click="enqueueDownload(h)" title="重新加入下载">重下</button>
            <button class="btn btn-icon btn-sm" @click="openDir(h.saveDir)" title="打开文件夹">
              <IconSymbol name="folder" :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import IconSymbol from '../components/IconSymbol.vue';
import {
  store,
  DEFAULT_COVER,
  openTaskLogModal,
  enqueueDownload,
  notify
} from '../store/appStore';

const api = window.appleMusic || {};
const subTab = ref('queue');

const downloadingCount = computed(() => store.queue.filter(t => t.status === 'downloading').length);
const queuedCount = computed(() => store.queue.filter(t => t.status === 'queued').length);
const completedCount = computed(() => store.queue.filter(t => t.status === 'completed').length);
const failedCount = computed(() => store.queue.filter(t => t.status === 'failed' || t.status === 'cancelled').length);
const activeCount = computed(() => downloadingCount.value + queuedCount.value);
const finishedInQueueCount = computed(() => completedCount.value + failedCount.value);

function statusText(st) {
  const m = {
    queued: '排队中',
    downloading: '下载中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return m[st] || st;
}

function statusBadgeClass(st) {
  if (st === 'completed') return 'success';
  if (st === 'downloading') return 'info';
  if (st === 'queued') return 'warning';
  return 'danger';
}

function formatTime(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function cancelOne(id) {
  api.cancelTask?.(id);
}
function retryOne(id) {
  api.retryTask?.(id);
}
function removeOne(id) {
  api.removeTask?.(id);
}
async function handleRetryAll() {
  const count = await api.retryAllFailed?.();
  if (count) notify(`已重新激活 ${count} 个任务`, 'info');
}
function handleClearFinished() {
  api.clearFinishedTasks?.();
}
function handleCancelAll() {
  api.cancelAllTasks?.();
  notify('已终止所有活动下载任务', 'warning');
}
async function handleClearHistory() {
  store.history = (await api.clearHistory?.()) || [];
  notify('历史归档已清空', 'info');
}
function openOutputFolder() {
  api.openFolder?.(store.config.downloadDir);
}
function openDir(dir) {
  api.openFolder?.(dir || store.config.downloadDir);
}
</script>

<style scoped>
.header-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 22px;
}

.kpi-card {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.kpi-val {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.kpi-val.info { color: var(--info); }
.kpi-val.warning { color: var(--warning); }
.kpi-val.success { color: var(--success); }
.kpi-val.danger { color: var(--danger); }

.task-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
}

.task-cover {
  width: 54px;
  height: 54px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}

.task-center {
  flex: 1;
  min-width: 0;
}

.task-top-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.task-title {
  font-weight: 700;
  font-size: 14px;
}

.task-sub-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 7px;
}

.task-prog-msg {
  color: var(--text-primary);
  font-weight: 600;
}

.progress-track {
  height: 5px;
  border-radius: 99px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 99px;
  background: var(--accent-gradient);
  transition: width 0.25s ease;
}
.progress-fill.completed {
  background: var(--success);
}
.progress-fill.failed,
.progress-fill.cancelled {
  background: var(--danger);
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
