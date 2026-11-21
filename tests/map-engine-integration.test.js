import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainTileStore } from "../src/world/terrain-tiles.js";
import { calculateZoomTilePlan } from "../src/world/terrain-preload-worker.js";
import { createTerrainPreloadCoordinator } from "../src/world/terrain-preload-client.js";
import { getGeographicRendererPreference, resolveGeographicRendererMode } from "../src/world/geographic-renderer-mode.js";
import { buildGeographicLineMesh, buildGeographicPolygonMesh } from "../src/world/geographic-webgl.js";
import { buildLandClipPath } from "../src/world/map-renderer.js";
import { isSupportedGeographicBoundary, buildRibbonBuffer } from "../src/world/geographic-webgl-renderer.js";

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

test("les MultiPolygon simples restent éligibles au remplissage WebGL", () => {
  const mesh = buildGeographicPolygonMesh({
    geometry: { type: "MultiPolygon", coordinates: [
      [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
      [[[4, 0], [6, 0], [6, 2], [4, 2], [4, 0]]]
    ] }
  });
  assert.equal(mesh.supported, true);
  assert.equal(mesh.vertexCount, 8);
  assert.equal(mesh.triangleCount, 4);
});
test("les polygones traversant l’antiméridien restent au rendu Canvas", () => {
  const polygon = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [[
      [179, -2], [-179, -2], [-179, 2], [179, 2], [179, -2]
    ]] }
  });
  assert.equal(polygon.supported, false);
  assert.equal(polygon.reason, "antimeridian-requires-canvas");
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


test("les frontières politiques et administratives en LineString et MultiLineString sont compatibles WebGL", () => {
  const line = { geometry: { type: "LineString", coordinates: [[-5, 40], [2, 45], [8, 43]] } };
  const multiline = { geometry: { type: "MultiLineString", coordinates: [
    [[-5, 40], [2, 45]], [[8, 43], [12, 48]]
  ] } };
  const polygonBoundary = { geometry: { type: "MultiPolygon", coordinates: [
    [[[-5, 40], [2, 40], [2, 45], [-5, 45], [-5, 40]]]
  ] } };
  const unsupported = { geometry: { type: "GeometryCollection", geometries: [] } };
  assert.equal(isSupportedGeographicBoundary(line), true);
  assert.equal(isSupportedGeographicBoundary(multiline), true);
  assert.equal(isSupportedGeographicBoundary(polygonBoundary), true);
  assert.equal(isSupportedGeographicBoundary(unsupported), false);
});

test("les frontières traversant l'antiméridien restent au fallback Canvas", () => {
  const boundary = { geometry: { type: "MultiLineString", coordinates: [
    [[179, 10], [-179, 11]]
  ] } };
  assert.equal(isSupportedGeographicBoundary(boundary), false);
});

test("les anneaux de frontières polygonales ouverts sont fermés avant le rendu WebGL", () => {
  const boundary = { geometry: { type: "Polygon", coordinates: [[
    [-5, 40], [2, 40], [2, 45], [-5, 45]
  ]] } };
  assert.equal(isSupportedGeographicBoundary(boundary), true);
});

test("les frontières polygonales avec trous restent compatibles WebGL en rendu de contours", () => {
  const boundary = { geometry: { type: "Polygon", coordinates: [
    [[-5, 40], [5, 40], [5, 50], [-5, 50], [-5, 40]],
    [[-2, 43], [2, 43], [2, 47], [-2, 47], [-2, 43]]
  ] } };
  assert.equal(isSupportedGeographicBoundary(boundary), true);
});

test("les frontières aux coordonnées invalides restent au fallback Canvas", () => {
  const boundary = { geometry: { type: "LineString", coordinates: [[0, 0], [10, 95]] } };
  assert.equal(isSupportedGeographicBoundary(boundary), false);
});


test("le masque terrestre réutilise les Path2D projetés du remplissage", () => {
  const previousPath2D = globalThis.Path2D;
  class MockPath2D {
    static created = 0;
    constructor() { this.paths = []; this.commands = []; MockPath2D.created++; }
    addPath(path) { this.paths.push(path); }
    moveTo(x, y) { this.commands.push(["M", x, y]); }
    lineTo(x, y) { this.commands.push(["L", x, y]); }
    closePath() { this.commands.push(["Z"]); }
  }
  globalThis.Path2D = MockPath2D;
  try {
    const feature = { type: "Feature", geometry: { type: "Polygon", coordinates: [[
      [-10, -5], [10, -5], [10, 5], [-10, 5], [-10, -5]
    ]] } };
    const collection = { type: "FeatureCollection", features: [feature] };
    const projection = { type: "equirectangular", viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 } };
    const first = buildLandClipPath(collection, 800, 400, projection, { tolerance: 1, minRingArea: 0 });
    const second = buildLandClipPath(collection, 800, 400, projection, { tolerance: 1, minRingArea: 0 });
    assert.ok(first instanceof MockPath2D);
    assert.ok(second instanceof MockPath2D);
    assert.equal(first.paths.length, 1);
    assert.equal(second, first, "le masque composé doit être réutilisé pour la même cellule de vue");
    assert.equal(first.paths[0], second.paths[0]);
    assert.equal(MockPath2D.created, 2, "un masque composé et un chemin de feature suffisent");
    const alternateCollection = { ...collection, features: [feature] };
    const alternate = buildLandClipPath(alternateCollection, 800, 400, projection, { tolerance: 1, minRingArea: 0 });
    assert.notEqual(alternate, first, "des tableaux de features distincts ne doivent pas partager une entrée composée par erreur");
    const moved = buildLandClipPath(collection, 800, 400, {
      type: "equirectangular",
      viewport: { zoom: 2, centerLongitude: 2, centerLatitude: 0 }
    }, { tolerance: 1, minRingArea: 0 });
    assert.notEqual(moved, first, "un déplacement vers une autre cellule doit produire un masque distinct");
  } finally {
    if (previousPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previousPath2D;
  }
});


test("les buffers de lignes géographiques sont construits directement en Float32Array", () => {
  let uploaded = null;
  const buffer = {};
  const gl = {
    ARRAY_BUFFER: 1, STATIC_DRAW: 2,
    createBuffer: () => buffer,
    bindBuffer: () => {},
    bufferData: (_target, data) => { uploaded = data; },
    deleteBuffer: () => {}
  };
  const result = buildRibbonBuffer([new Float32Array([0, 0, 1, 0])], gl);
  assert.ok(result.positions instanceof Float32Array);
  assert.equal(result.positions, uploaded, "aucune conversion ou copie intermédiaire ne doit être nécessaire");
  assert.equal(result.vertexCount, 78, "six sommets de ruban et deux disques de jointure de 36 sommets");
  assert.equal(result.positions.length, result.vertexCount * 8);
  assert.equal(result.lineBuffer, buffer);
});

test("un groupe de segments vide ne crée aucun buffer GPU", () => {
  let created = false;
  const result = buildRibbonBuffer([new Float32Array()], {
    createBuffer() { created = true; }
  });
  assert.equal(created, false);
  assert.equal(result.vertexCount, 0);
  assert.equal(result.lineBuffer, null);
});


test("le renderer WebGL libère les buffers des couches retirées puis ceux restants à dispose", async () => {
  const { createGeographicWebGLRenderer } = await import("../src/world/geographic-webgl-renderer.js");
  let nextId = 0;
  const buffers = new Set();
  const deletedBuffers = new Set();
  const gl = {
    canvas: { width: 0, height: 0 },
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7, DYNAMIC_DRAW: 8,
    COLOR_BUFFER_BIT: 9, BLEND: 10, SRC_ALPHA: 11, ONE_MINUS_SRC_ALPHA: 12,
    FLOAT: 13, TRIANGLES: 14,
    createShader: () => ({ id: ++nextId }),
    shaderSource() {}, compileShader() {}, getShaderParameter: () => true, deleteShader() {},
    createProgram: () => ({ id: ++nextId }), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}),
    deleteProgram() {},
    createBuffer() { const buffer = { id: ++nextId }; buffers.add(buffer); return buffer; },
    deleteBuffer(buffer) { deletedBuffers.add(buffer); },
    bindBuffer() {}, bufferData() {},
    viewport() {}, clearColor() {}, clear() {}, enable() {}, blendFunc() {},
    useProgram() {}, uniform2f() {}, uniform1f() {}, uniform4fv() {},
    enableVertexAttribArray() {}, vertexAttribPointer() {}, drawArrays() {}, drawElements() {}
  };
  const renderer = createGeographicWebGLRenderer(gl);
  const coast = { geometry: { type: "LineString", coordinates: [[-5, 0], [5, 1]] } };
  renderer.renderLayers([{ key: "coast", type: "boundaries", features: [coast] }],
    100, 80, { zoom: 1, centerLongitude: 0, centerLatitude: 0 });
  assert.equal(buffers.size, 1, "un buffer de contour doit être créé");
  const staleBuffer = [...buffers][0];

  renderer.renderLayers([], 100, 80, { zoom: 1, centerLongitude: 0, centerLatitude: 0 });
  assert.equal(deletedBuffers.has(staleBuffer), true,
    "le buffer doit être libéré dès que sa couche disparaît");

  renderer.renderLayers([{ key: "coast", type: "boundaries", features: [coast] }],
    100, 80, { zoom: 1, centerLongitude: 0, centerLatitude: 0 });
  const activeBuffer = [...buffers].find(buffer => !deletedBuffers.has(buffer));
  assert.ok(activeBuffer, "la couche réintroduite doit recréer son buffer");
  renderer.dispose();
  assert.equal(deletedBuffers.has(activeBuffer), true,
    "dispose doit libérer les buffers encore actifs");
  renderer.renderLayers([], 100, 80);
  assert.equal(deletedBuffers.has(activeBuffer), true, "dispose est idempotent");
});
