import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMapTileWorkQueue, takeNextMapTileWork, getMapTileWorkQueueStats } from "../src/world/map-tile-work-queue.js";

test("queue follows the visible plan priority and removes obsolete work", () => {
  const old = [{ key: "old" }];
  const plan = [{ key: "center" }, { key: "near" }, { key: "edge" }];
  const queue = reconcileMapTileWorkQueue(plan, old);
  assert.deepEqual(queue.map(tile => tile.key), ["center", "near", "edge"]);
});
test("queue reconciliation deduplicates and skips cached or already pending tiles", () => {
  const plan = [{ key: "a" }, { key: "b" }, { key: "a" }, { key: "c" }];
  const queue = reconcileMapTileWorkQueue(plan, [], key => key === "b", key => key === "c");
  assert.deepEqual(queue.map(tile => tile.key), ["a"]);
});
test("taking work skips entries that became cached or pending after reconciliation", () => {
  const queue = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const next = takeNextMapTileWork(queue, key => key === "a", key => key === "b");
  assert.equal(next.key, "c");
  assert.equal(queue.length, 0);
});
test("taking work returns null for malformed or exhausted queues", () => {
  assert.equal(takeNextMapTileWork(null), null);
  assert.equal(takeNextMapTileWork([{ key: "" }, null]), null);
});
test("queue diagnostics report queued and in-flight work independently", () => {
  assert.deepEqual(getMapTileWorkQueueStats([{ key: "a" }, { key: "b" }], new Map([["c", 3]])), {
    queued: 2, pending: 1
  });
  assert.deepEqual(getMapTileWorkQueueStats(null, null), { queued: 0, pending: 0 });
});
