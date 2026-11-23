import test from "node:test";
import assert from "node:assert/strict";
import { createMapFrameScheduler } from "../src/world/map-frame-scheduler.js";

function createFrameQueue() {
  let nextId = 0;
  const callbacks = new Map();
  const cancelled = [];
  return {
    callbacks, cancelled,
    request(callback) { const id = ++nextId; callbacks.set(id, callback); return id; },
    cancel(id) { cancelled.push(id); callbacks.delete(id); },
    flush(id) { const callback = callbacks.get(id); callbacks.delete(id); callback?.(); }
  };
}

test("plusieurs demandes de rendu sont regroupées dans une seule frame", () => {
  const queue = createFrameQueue();
  let renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, queue.request, queue.cancel);
  assert.equal(schedule(), true);
  assert.equal(schedule(), false);
  assert.equal(schedule(), false);
  assert.equal(queue.callbacks.size, 1);
  queue.flush(1);
  assert.equal(renders, 1);
  assert.equal(schedule.pending(), false);
});

test("une demande annulée ne déclenche aucun rendu", () => {
  const queue = createFrameQueue();
  let renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, queue.request, queue.cancel);
  schedule();
  assert.equal(schedule.cancel(), true);
  assert.equal(schedule.cancel(), false);
  assert.equal(queue.cancelled.length, 1);
  assert.equal(renders, 0);
});

test("dispose annule la frame en attente et interdit les nouvelles demandes", () => {
  const queue = createFrameQueue();
  let renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, queue.request, queue.cancel);
  schedule();
  schedule.dispose();
  assert.equal(schedule(), false);
  assert.equal(schedule.pending(), false);
  assert.equal(queue.callbacks.size, 0);
  assert.equal(renders, 0);
});

test("une frame déjà remise au navigateur ne rend plus après dispose", () => {
  const callbacks = [];
  let renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, callback => { callbacks.push(callback); return callbacks.length; });
  schedule();
  schedule.dispose();
  callbacks[0]();
  assert.equal(renders, 0);
});

test("le scheduler exige un callback de rendu et un ordonnanceur de frame", () => {
  assert.throws(() => createMapFrameScheduler(null, () => 1), /rendu/);
  assert.throws(() => createMapFrameScheduler(() => {}, null), /requestAnimationFrame/);
});
