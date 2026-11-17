<template>
  <div v-if="store.logModal.open" class="modal-backdrop" @click.self="close">
    <div class="modal-card" style="max-width: 740px">
      <div class="modal-header">
        <div>
          <h3>内核实时终端日志 · {{ store.logModal.task?.title }}</h3>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px" class="ellipsis">
            {{ store.logModal.task?.url }}
          </div>
        </div>
        <button class="btn btn-icon btn-ghost" @click="close">
          <IconSymbol name="x" :size="18" />
        </button>
      </div>

      <div class="modal-body" style="background: #090b10; padding: 16px 20px">
        <div v-if="store.logModal.lines.length === 0" style="color: #64748b; font-family: monospace">
          等待任务输出日志...
        </div>
        <pre v-else class="term-pre selectable">{{ store.logModal.lines.join('\n') }}</pre>
      </div>

      <div class="modal-footer">
        <button class="btn btn-sm" @click="copyLogs">复制全部日志</button>
        <button class="btn btn-sm btn-primary" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import IconSymbol from './IconSymbol.vue';
import { store, notify } from '../store/appStore';

function copyLogs() {
  const txt = store.logModal.lines.join('\n');
  if (navigator.clipboard && txt) {
    navigator.clipboard.writeText(txt);
    notify('终端日志已复制到剪贴板', 'success');
  }
}

function close() {
  store.logModal.open = false;
}
</script>

<style scoped>
.term-pre {
  margin: 0;
  font-family: Consolas, "SFMono-Regular", Menlo, monospace;
  font-size: 12px;
  line-height: 1.65;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
