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
    fill: (...args) => calls.push(["fill", ...args]),
    stroke: () => calls.push(["stroke"])
  };
  return { canvas: { clientWidth: 640, getContext: () => context }, calls };
}

test("le moteur dessine une FeatureCollection et retourne son thème", () => {
  const { canvas, calls } = createCanvas();
  const data = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] };
  const result = renderWorldMap(canvas, data, { width: 640, height: 320, year: 1444, pixelRatio: 1 });
  assert.equal(result.featureCount, 1);
  assert.equal(result.theme.id, "manuscript");
  assert.ok(calls.some(call => call[0] === "fillRect"));
  assert.ok(calls.some(call => call[0] === "fill" && call[1] === "evenodd"));
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
});
