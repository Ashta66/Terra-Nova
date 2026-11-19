import test from "node:test";
import assert from "node:assert/strict";
import { renderWorldMap } from "../src/world/map-renderer.js";

function createCanvas() {
  const calls = [];
  const context = {
    setTransform: (...args) => calls.push(["setTransform", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    closePath: () => calls.push(["closePath"]),
    arc: (...args) => calls.push(["arc", ...args]),
    fillText: (...args) => calls.push(["fillText", ...args]),
    strokeText: (...args) => calls.push(["strokeText", ...args]),
    measureText: (text) => ({ width: String(text).length * 6 }),
    fill: (...args) => calls.push(["fill", ...args]),
    clip: (...args) => calls.push(["clip", ...args]),
    stroke: (...args) => calls.push(["stroke", ...args])
  };
  return { canvas: { clientWidth: 640, getContext: () => context }, calls };
}

const land = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] };

test("le moteur dessine une FeatureCollection et retourne son thème", () => {
  const { canvas, calls } = createCanvas();
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, year: 1444, pixelRatio: 1 });
  assert.equal(result.featureCount, 1);
  assert.equal(result.landCount, 1);
  assert.equal(result.theme.id, "manuscript");
  assert.ok(calls.some(call => call[0] === "fillRect"));
  assert.ok(calls.some(call => call[0] === "fill" && call[1] === "evenodd"));
  assert.ok(calls.some(call => call[0] === "clip" && call[1] === "evenodd"));
});

test("le moteur dessine les lacs et les cours d'eau comme des couches distinctes", () => {
  const { canvas } = createCanvas();
  const lakes = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] } }] };
  const rivers = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [5, 5], [10, 4]] } }] };
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, lakes, rivers });
  assert.equal(result.lakeCount, 1);
  assert.equal(result.riverCount, 1);
});

test("le moteur dessine les zones glaciaires et les repères de relief", () => {
  const { canvas, calls } = createCanvas();
  const glaciers = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] } }] };
  const elevationPoints = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Everest", kind: "mountain", elevation_m: 8848 }, geometry: { type: "Point", coordinates: [86.9, 28] } },
    { type: "Feature", properties: { name: "Dépression", kind: "depression", elevation_m: -154 }, geometry: { type: "Point", coordinates: [89, 42] } }
  ] };
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, glaciers, elevationPoints });
  assert.equal(result.glacierCount, 1);
  assert.equal(result.elevationPointCount, 2);
  assert.ok(calls.some(call => call[0] === "arc"));
  assert.ok(calls.some(call => call[0] === "fillText" && call[1] === "Everest"));
});

test("le moteur rejette une entrée qui n'est pas une FeatureCollection", () => {
  const { canvas } = createCanvas();
  assert.throws(() => renderWorldMap(canvas, { type: "Topology", arcs: [] }), /FeatureCollection/);
});

test("le moteur ignore les géométries nulles sans interrompre le rendu", () => {
  const { canvas } = createCanvas();
  const data = { type: "FeatureCollection", features: [{ type: "Feature", geometry: null }] };
  const result = renderWorldMap(canvas, data, { width: 640, height: 320, pixelRatio: 1 });
  assert.equal(result.featureCount, 1);
  assert.equal(result.landCount, 0);
});

test("les labels géographiques apparaissent selon le niveau de zoom", () => {
  const { canvas, calls } = createCanvas();
  const labels = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Europe", kind: "continent", minZoom: 1 }, geometry: { type: "Point", coordinates: [15, 45] } },
    { type: "Feature", properties: { name: "Paris", kind: "city", minZoom: 2 }, geometry: { type: "Point", coordinates: [2.35, 48.86] } }
  ] };
  const world = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, labels, viewport: { zoom: 1 } });
  assert.deepEqual(world.labelHits.map(label => label.name), ["Europe"]);
  const regional = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, labels, viewport: { zoom: 2 } });
  assert.ok(regional.labelHits.some(label => label.name === "Paris"));
  assert.ok(calls.some(call => call[0] === "strokeText" && call[1] === "Europe"));
});
