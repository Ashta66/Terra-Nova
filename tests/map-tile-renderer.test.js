import test from "node:test";
import assert from "node:assert/strict";
import { getMapTileGeographicBounds, createPhysicalTileRenderOptions, getMapTileScreenRect } from "../src/world/map-tile-renderer.js";

test("physical tiles have stable geographic extents and centers", () => {
  const bounds = getMapTileGeographicBounds({ z: 2, x: 0, y: 0 });
  assert.deepEqual(bounds, { west: -180, east: -90, north: 90, south: 45, centerLongitude: -135, centerLatitude: 67.5, longitudeSpan: 90, latitudeSpan: 45 });
});
test("physical tile rendering is independent of political and dynamic overlays", () => {
  const layers = { land: { features: [] }, lakes: { features: [] }, territories: { features: [{ id: 1 }] }, physicalWorld: { revision: 4 } };
  const options = createPhysicalTileRenderOptions({ z: 3, x: 4, y: 2 }, layers);
  assert.equal(options.width, 512); assert.equal(options.height, 256);
  assert.equal(options.viewport.zoom, 8);
  assert.equal(options.viewport.centerLongitude, 22.5);
  assert.equal(options.viewport.centerLatitude, 33.75);
  assert.equal("territories" in options, false); assert.equal("physicalWorld" in options, false);
});
test("tile screen rectangles use the current viewport scale", () => {
  const rect = getMapTileScreenRect({ z: 2, x: 2, y: 1 }, { zoom: 2, centerLongitude: 0, centerLatitude: 0 }, 1000, 500);
  assert.equal(rect.width, 500); assert.equal(rect.height, 250);
  assert.equal(rect.x, 500); assert.equal(rect.y, 0);
});

import { collectMapTileRenderStack } from "../src/world/map-tile-renderer.js";

test("tile fallback stack draws cached ancestors before detailed children", () => {
  const plan = { tiles: [
    { z: 3, x: 2, y: 2, key: "3/2/2", ancestors: [
      { z: 2, x: 1, y: 1, key: "2/1/1" },
      { z: 1, x: 0, y: 0, key: "1/0/0" },
      { z: 0, x: 0, y: 0, key: "0/0/0" }
    ] },
    { z: 3, x: 3, y: 2, key: "3/3/2", ancestors: [
      { z: 2, x: 1, y: 1, key: "2/1/1" },
      { z: 1, x: 0, y: 0, key: "1/0/0" },
      { z: 0, x: 0, y: 0, key: "0/0/0" }
    ] }
  ] };
  const available = new Set(["0/0/0", "2/1/1", "3/2/2"]);
  const stack = collectMapTileRenderStack(plan, key => available.has(key));
  assert.deepEqual(stack.map(tile => tile.key), ["0/0/0", "2/1/1", "3/2/2"]);
  assert.equal(stack[0].fallback, true);
  assert.equal(stack[2].fallback, false);
});

import { normalizeMapRenderFamilies } from "../src/world/map-renderer.js";

test("map render families default to all layers and can isolate each family", () => {
  assert.deepEqual(normalizeMapRenderFamilies(), { physical: true, political: true, dynamic: true });
  assert.deepEqual(normalizeMapRenderFamilies({ physical: true, political: false, dynamic: false }), { physical: true, political: false, dynamic: false });
  assert.deepEqual(normalizeMapRenderFamilies({ physical: false, political: true, dynamic: false }), { physical: false, political: true, dynamic: false });
  assert.deepEqual(normalizeMapRenderFamilies({ physical: false, political: false, dynamic: true }), { physical: false, political: false, dynamic: true });
});
