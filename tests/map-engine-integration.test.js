import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainTileStore } from "../src/world/terrain-tiles.js";
import { calculateZoomTilePlan } from "../src/world/terrain-preload-worker.js";
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
