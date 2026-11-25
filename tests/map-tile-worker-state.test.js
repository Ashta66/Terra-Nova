import test from "node:test";
import assert from "node:assert/strict";
import { isMapTileWorkerReplyCurrent, releaseMapTileWorkerReply } from "../src/world/map-tile-worker-state.js";

test("accepts only the active request for a tile", () => {
  const pending = new Map([["tile-a", 12]]);
  assert.equal(isMapTileWorkerReplyCurrent({ requestId: 12, tile: { key: "tile-a" } }, pending), true);
  assert.equal(isMapTileWorkerReplyCurrent({ requestId: 11, tile: { key: "tile-a" } }, pending), false);
  assert.equal(isMapTileWorkerReplyCurrent({ requestId: 12, tile: { key: "tile-b" } }, pending), false);
});
test("releases a matching reply exactly once", () => {
  const pending = new Map([["tile-a", 12]]);
  const reply = { requestId: 12, tile: { key: "tile-a" } };
  assert.equal(releaseMapTileWorkerReply(reply, pending), true);
  assert.equal(releaseMapTileWorkerReply(reply, pending), false);
  assert.equal(pending.size, 0);
});
test("a late reply cannot release a newer request for the same tile", () => {
  const pending = new Map([["tile-a", 22]]);
  assert.equal(releaseMapTileWorkerReply({ requestId: 12, tile: { key: "tile-a" } }, pending), false);
  assert.equal(pending.get("tile-a"), 22);
});
test("rejects malformed messages and request identifiers", () => {
  const pending = new Map([["tile-a", 1]]);
  for (const message of [null, {}, { requestId: 0, tile: { key: "tile-a" } },
    { requestId: 1.5, tile: { key: "tile-a" } }, { requestId: 1, tile: {} },
    { requestId: Number.MAX_SAFE_INTEGER + 1, tile: { key: "tile-a" } }]) {
    assert.equal(isMapTileWorkerReplyCurrent(message, pending), false);
    assert.equal(releaseMapTileWorkerReply(message, pending), false);
  }
  assert.equal(pending.get("tile-a"), 1);
});
test("rejects pending stores without a Map-like get method", () => {
  assert.equal(isMapTileWorkerReplyCurrent({ requestId: 1, tile: { key: "tile-a" } }, null), false);
  assert.equal(releaseMapTileWorkerReply({ requestId: 1, tile: { key: "tile-a" } }, {}), false);
});
