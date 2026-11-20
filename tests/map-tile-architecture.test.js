import test from "node:test";
import assert from "node:assert/strict";
import { getMapTileLevel, getMapTileKey, getMapTileAncestors, getMapTilePyramidPlan, findAvailableTile } from "../src/world/map-tile-system.js";
import { createMapLayerFamilies, getChangedMapLayerFamilies } from "../src/world/map-layer-families.js";
import { createMapFrameScheduler } from "../src/world/map-frame-scheduler.js";
import { createMapTileCache } from "../src/world/map-tile-cache.js";

test("tile levels are stable, bounded and follow powers of two", () => {
  assert.equal(getMapTileLevel(1), 2); assert.equal(getMapTileLevel(2), 3);
  assert.equal(getMapTileLevel(20), 6); assert.equal(getMapTileLevel(1e6), 7);
});
test("tile keys wrap longitude and clamp latitude rows", () => {
  assert.equal(getMapTileKey(3, -1, 2), "3/7/2"); assert.equal(getMapTileKey(3, 8, 99), "3/0/7");
});
test("tile pyramid bounds work and wraps across the antimeridian", () => {
  const plan = getMapTilePyramidPlan({ zoom: 8, centerLongitude: 179, centerLatitude: 0 }, { overscan: 1.6, maxTiles: 20 });
  assert.ok(plan.tiles.length <= 20 && plan.tiles.length > 0);
  assert.ok(plan.tiles.every(tile => tile.ancestors.length === tile.z));
  assert.equal(plan.z, getMapTileLevel(8)); assert.ok(plan.tiles.some(tile => tile.x === 0));
});
test("parent tile is selected when a detailed child is not cached", () => {
  const tile = { z: 3, x: 5, y: 2 }, parents = getMapTileAncestors(tile);
  const fallback = findAvailableTile({ ...tile, key: getMapTileKey(tile.z, tile.x, tile.y), ancestors: parents }, key => key === parents[1].key);
  assert.equal(fallback.fallback, true); assert.equal(fallback.key, parents[1].key);
});
test("three layer families preserve references and isolate revisions", () => {
  const land = { features: [] }, borders = { features: [] }, events = { revision: 1 };
  const before = createMapLayerFamilies({ land, politicalBoundaries: borders, physicalWorld: events });
  const after = createMapLayerFamilies({ land, politicalBoundaries: { features: [] }, physicalWorld: events });
  assert.equal(before.physical.land, land); assert.deepEqual(getChangedMapLayerFamilies(before, after), ["political"]);
});
test("visual frame scheduler coalesces calls and supports cancellation", () => {
  const callbacks = new Map(); let next = 0, renders = 0;
  const schedule = createMapFrameScheduler(() => renders++, callback => { callbacks.set(++next, callback); return next; }, id => callbacks.delete(id));
  assert.equal(schedule(), true); assert.equal(schedule(), false);
  const [id, callback] = [...callbacks.entries()][0]; callbacks.delete(id); callback();
  assert.equal(renders, 1); schedule(); assert.equal(schedule.cancel(), true); assert.equal(callbacks.size, 0);
});
test("weighted tile cache evicts least recently used entries within byte budget", () => {
  const cache = createMapTileCache({ maxBytes: 8, maxEntries: 3 });
  cache.set("a", new Uint8Array(4)); cache.set("b", new Uint8Array(4)); cache.get("a"); cache.set("c", new Uint8Array(4));
  assert.equal(cache.get("b"), null); assert.ok(cache.get("a")); assert.equal(cache.stats().bytes, 8);
});
