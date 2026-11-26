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


test("un callback annulé devenu exécutable ne rend rien et ne libère pas la frame suivante", () => {
  const callbacks = [];
  const cancelled = [];
  let renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, callback => {
    callbacks.push(callback);
    return callbacks.length;
  }, id => cancelled.push(id));

  schedule();
  assert.equal(schedule.cancel(), true);
  schedule();
  callbacks[0]();
  assert.equal(schedule.pending(), true);
  assert.equal(renders, 0);
  callbacks[1]();
  assert.equal(schedule.pending(), false);
  assert.equal(renders, 1);
  assert.deepEqual(cancelled, [1]);
});

test("un rendu peut programmer explicitement la frame suivante sans être écrasé", () => {
  const queue = createFrameQueue();
  let renders = 0;
  let schedule;
  schedule = createMapFrameScheduler(() => {
    renders++;
    if (renders === 1) assert.equal(schedule(), true);
  }, queue.request, queue.cancel);

  schedule();
  queue.flush(1);
  assert.equal(schedule.pending(), true);
  assert.equal(queue.callbacks.size, 1);
  queue.flush(2);
  assert.equal(renders, 2);
  assert.equal(schedule.pending(), false);
});

test("dispose est idempotent et un callback tardif reste inoffensif", () => {
  const callbacks = [];
  let renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, callback => {
    callbacks.push(callback);
    return callbacks.length;
  });
  schedule();
  schedule.dispose();
  schedule.dispose();
  callbacks[0]();
  assert.equal(renders, 0);
  assert.equal(schedule(), false);
  assert.equal(schedule.pending(), false);
});

test("une frame annulée ne peut pas effacer un nouvel identifiant réutilisé", () => {
  const callbacks = [];
  let renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, callback => {
    callbacks.push(callback);
    return 7;
  }, () => {});
  schedule();
  schedule.cancel();
  schedule();
  callbacks[0]();
  assert.equal(schedule.pending(), true);
  callbacks[1]();
  assert.equal(renders, 1);
  assert.equal(schedule.pending(), false);
});
