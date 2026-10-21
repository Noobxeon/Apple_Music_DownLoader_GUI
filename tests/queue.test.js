const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TaskQueue } = require('../frontend/src/taskQueue');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('batch tasks never exceed concurrency and later tasks start after completion', async () => {
  const started = [];
  const finish = new Map();
  const states = new Map();
  const queue = new TaskQueue({ run: task => { started.push(task.id); return new Promise(resolve => finish.set(task.id, resolve)); },
    cancel: async () => {}, update: (id, patch) => states.set(id, { ...states.get(id), ...patch }) });
  for (let i = 0; i < 5; i++) queue.add({ id: String(i) });
  await flush();
  assert.deepEqual(started, ['0', '1']);
  assert.equal(states.get('2').status, 'queued');
  finish.get('0')({ success: true, msg: '成功' });
  await flush();
  assert.deepEqual(started, ['0', '1', '2']);
  assert.equal(states.get('0').status, 'success');
  assert.equal(queue.running, 2);
});
test('cancelling queued tasks prevents any engine invocation and permits retry', async () => {
  const started = [];
  const queue = new TaskQueue({ concurrency: 1, run: task => { started.push(task.id); return new Promise(() => {}); }, cancel: async () => {}, update() {} });
  queue.add({ id: 'first' }); queue.add({ id: 'second' });
  await queue.cancel('second'); await flush();
  assert.deepEqual(started, ['first']);
  assert.equal(queue.entries.has('second'), false);
  assert.equal(queue.add({ id: 'second' }), true);
  assert.equal(queue.add({ id: 'second' }), false);
});
test('cancelling a running task holds its slot and cannot be overwritten by late success', async () => {
  const states = [];
  let finish;
  const cancelled = [];
  const queue = new TaskQueue({ run: () => new Promise(resolve => { finish = resolve; }), cancel: async id => cancelled.push(id), update: (_id, patch) => states.push(patch.status) });
  queue.add({ id: 'one' }); await flush();
  await queue.cancel('one');
  assert.equal(queue.running, 1);
  assert.equal(queue.add({ id: 'one' }), false);
  assert.deepEqual(cancelled, ['one']);
  finish({ success: true, msg: '成功' }); await flush();
  assert.equal(states.at(-1), 'cancelled');
  assert.equal(queue.running, 0);
  assert.equal(queue.add({ id: 'one' }), true);
});
test('instant cancellation before the next microtask never starts a process', async () => {
  let calls = 0;
  const queue = new TaskQueue({ run: async () => { calls++; return { success: true }; }, cancel: async () => {}, update() {} });
  queue.add({ id: 'one' }); await queue.cancel('one'); await flush();
  assert.equal(calls, 0);
});
test('an IPC rejection becomes an error and releases the slot for the next task', async () => {
  const states = new Map();
  const queue = new TaskQueue({ concurrency: 1, run: async task => { if (task.id === 'bad') throw new Error('IPC failed'); return { success: true, msg: 'ok' }; }, cancel: async () => {}, update: (id, patch) => states.set(id, patch) });
  queue.add({ id: 'bad' }); queue.add({ id: 'good' }); await flush(); await flush();
  assert.equal(states.get('bad').status, 'error');
  assert.equal(states.get('good').status, 'success');
  assert.equal(queue.running, 0);
});
