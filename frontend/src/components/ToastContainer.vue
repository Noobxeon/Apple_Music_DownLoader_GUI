<template>
  <div class="toast-stack">
    <transition-group name="toast-anim">
      <div
        v-for="t in store.toasts"
        :key="t.id"
        class="toast-item"
        :class="t.type"
      >
        <IconSymbol
          :name="t.type === 'success' ? 'check' : (t.type === 'danger' || t.type === 'warning' ? 'info' : 'sparkles')"
          :size="15"
        />
        <span>{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import IconSymbol from './IconSymbol.vue';
import { store } from '../store/appStore';
</script>

<style scoped>
.toast-stack {
  position: fixed;
  top: 72px;
  right: 24px;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow-md);
  pointer-events: auto;
}

.toast-item.success {
  border-color: rgba(34, 197, 94, 0.4);
  color: var(--success);
}
.toast-item.warning {
  border-color: rgba(245, 158, 11, 0.4);
  color: var(--warning);
}
.toast-item.danger {
  border-color: rgba(239, 68, 68, 0.45);
  color: var(--danger);
}

.toast-anim-enter-active,
.toast-anim-leave-active {
  transition: all 0.22s ease;
}
.toast-anim-enter-from,
.toast-anim-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
