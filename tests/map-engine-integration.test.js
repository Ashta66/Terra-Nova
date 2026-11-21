import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainTileStore } from "../src/world/terrain-tiles.js";
import { calculateZoomTilePlan } from "../src/world/terrain-preload-worker.js";
import { createTerrainPreloadCoordinator } from "../src/world/terrain-preload-client.js";
import { getGeographicRendererPreference, resolveGeographicRendererMode } from "../src/world/geographic-renderer-mode.js";
import { buildGeographicLineMesh, buildGeographicPolygonMesh } from "../src/world/geographic-webgl.js";

function makeGrid() {
  return { width: 4, height: 2, values: new Int16Array([0, 10, 20, 30, 40, 50, 60, 70]) };
}

test("le store de terrain échantillonne bilinéairement et modifie la tuile source", () => {
  const store = createTerrainTileStore(makeGrid(), { tileSize: 2, maxTiles: 8, maxBytes: 1024 });
  assert.equal(store.sampleBilinear(0, 0), 35);
  assert.equal(store.setElevation(0, 0, 123), true);
  assert.equal(store.sample(0, 0), 123);
  assert.equal(store.revision, 1);
});

test("les modifications de terrain émettent un snapshot persistant et protègent les révisions récentes", () => {
  const snapshots = [];
  const store = createTerrainTileStore(makeGrid(), {
    tileSize: 2, maxTiles: 8, maxBytes: 1024,
    onTileChange: snapshot => snapshots.push(snapshot)
  });
  assert.equal(store.setElevation(0, 0, 123), true);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].id, "0/0/0");
  assert.equal(snapshots[0].revision, 1);
  assert.ok(snapshots[0].values instanceof Int16Array);
  assert.equal(store.cacheStats.dirtyTiles, 1);
  assert.equal(store.markPersisted(snapshots[0].id, 0), false);
  assert.equal(store.markPersisted(snapshots[0].id, 1), true);
  assert.equal(store.cacheStats.dirtyTiles, 0);
  assert.equal(store.setElevation(0, 0, 124), true);
  assert.equal(store.markPersisted(snapshots[0].id, 1), false);
  assert.equal(store.cacheStats.dirtyTiles, 1);
});

test("le store restaure une tuile modifiée avec sa révision", () => {
  const store = createTerrainTileStore(makeGrid(), { tileSize: 2, maxTiles: 8, maxBytes: 1024 });
  const restored = store.restoreTile({
    id: "0/0/0", x: 0, y: 0, width: 2, height: 2, revision: 7,
    values: new Int16Array([1, 2, 3, 4])
  });
  assert.equal(restored, true);
  assert.equal(store.getTile(0, 0).revision, 7);
  assert.equal(store.getTile(0, 0).values[1], 2);
});

test("le préchargement viewport conserve des identifiants uniques et valides", () => {
  const store = createTerrainTileStore(makeGrid(), { tileSize: 2, maxTiles: 8, maxBytes: 1024 });
  const ids = store.preloadViewport({ zoom: 1, centerLongitude: 0, centerLatitude: 0 }, { padding: 0.2 });
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^0\/\d+\/\d+$/.test(id)));
});

test("le planificateur de zoom prépare les tuiles voisines sans doublons", () => {
  const ids = calculateZoomTilePlan({
    width: 360, height: 180, tileSize: 60,
    viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 },
    zoomLevels: [1.5, 3], padding: 0.25
  });
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
});

test("le mode géographique respecte le forçage Canvas et le fallback", () => {
  assert.equal(getGeographicRendererPreference("?geographic-renderer=canvas"), "canvas");
  assert.equal(getGeographicRendererPreference("?geographic-renderer=webgl"), "webgl");
  assert.equal(getGeographicRendererPreference("?geographic-renderer=unknown"), "auto");
  assert.equal(resolveGeographicRendererMode("auto", false), "canvas-fallback");
  assert.equal(resolveGeographicRendererMode("canvas", true), "canvas");
});

test("les maillages géographiques gèrent l'antiméridien et les polygones simples", () => {
  const line = buildGeographicLineMesh({
    geometry: { type: "LineString", coordinates: [[179, 0], [-179, 1]] }
  });
  assert.equal(line.supported, true);
  assert.equal(line.positions.length, 4);
  assert.equal(line.positions[2], 181);

  const polygon = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [[
      [0, 0], [2, 0], [2, 2], [0, 2], [0, 0]
    ]] }
  });
  assert.equal(polygon.supported, true);
  assert.equal(polygon.triangleCount, 2);
});

test("les polygones avec trous restent explicitement au rendu Canvas", () => {
  const polygon = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]
    ] }
  });
  assert.equal(polygon.supported, false);
  assert.equal(polygon.reason, "polygon-holes-require-canvas");
});


test("le worker de préchargement ignore les réponses d'un viewport devenu obsolète", () => {
  const listeners = {};
  const sent = [];
  const fakeWorker = {
    addEventListener(type, callback) { listeners[type] = callback; },
    postMessage(message) { sent.push(message); },
    terminate() {}
  };
  const plans = [];
  const coordinator = createTerrainPreloadCoordinator({
    createWorker: () => fakeWorker,
    calculate: calculateZoomTilePlan
  });
  const input = {
    width: 360, height: 180, tileSize: 60,
    viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 },
    zoomLevels: [1.5, 3], padding: 0.25
  };
  const first = coordinator.request(input, ids => plans.push(["first", ids]));
  const second = coordinator.request({ ...input, viewport: { ...input.viewport, centerLongitude: 45 } },
    ids => plans.push(["second", ids]));
  listeners.message({ data: { requestId: first, tileIds: ["0/0/0"] } });
  assert.equal(plans.length, 0);
  listeners.message({ data: { requestId: second, tileIds: ["0/1/0"] } });
  assert.deepEqual(plans, [["second", ["0/1/0"]]]);
  assert.equal(sent.length, 2);
  coordinator.dispose();
});

test("le préchargement de terrain retombe sur le calcul local si Worker est indisponible", () => {
  const plans = [];
  const coordinator = createTerrainPreloadCoordinator({
    createWorker: () => null,
    calculate: input => ["fallback", String(input.viewport.zoom)]
  });
  const requestId = coordinator.request({ viewport: { zoom: 4 } },
    (ids, id) => plans.push({ ids, id }));
  assert.deepEqual(plans, [{ ids: ["fallback", "4"], id: requestId }]);
  assert.equal(coordinator.workerActive, false);
  coordinator.dispose();
});
