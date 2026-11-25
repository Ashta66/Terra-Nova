import test from "node:test";
import assert from "node:assert/strict";
import { createWebGLContextLifecycle, getCanvasBackingSize } from "../src/world/webgl-context-lifecycle.js";

function fakeCanvas() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); },
    dispatch(type, event = {}) { listeners.get(type)?.(event); }
  };
}

test("un contexte WebGL commence utilisable avec une génération stable", () => {
  const lifecycle = createWebGLContextLifecycle(fakeCanvas());
  assert.equal(lifecycle.lost, false);
  assert.equal(lifecycle.disposed, false);
  assert.equal(lifecycle.generation, 0);
  assert.equal(lifecycle.canRender(), true);
});
test("la perte du contexte est prévenue et invalide la génération", () => {
  const canvas = fakeCanvas();
  const lifecycle = createWebGLContextLifecycle(canvas);
  let prevented = 0;
  canvas.dispatch("webglcontextlost", { preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(lifecycle.lost, true);
  assert.equal(lifecycle.canRender(), false);
  assert.equal(lifecycle.generation, 1);
});
test("la restauration rend le contexte disponible et incrémente la génération", () => {
  const canvas = fakeCanvas();
  const lifecycle = createWebGLContextLifecycle(canvas);
  canvas.dispatch("webglcontextlost", { preventDefault() {} });
  canvas.dispatch("webglcontextrestored");
  assert.equal(lifecycle.lost, false);
  assert.equal(lifecycle.canRender(), true);
  assert.equal(lifecycle.generation, 2);
});
test("les événements dupliqués ne déclenchent pas deux transitions", () => {
  const canvas = fakeCanvas();
  const lifecycle = createWebGLContextLifecycle(canvas);
  canvas.dispatch("webglcontextlost", { preventDefault() {} });
  canvas.dispatch("webglcontextlost", { preventDefault() {} });
  canvas.dispatch("webglcontextrestored");
  canvas.dispatch("webglcontextrestored");
  assert.equal(lifecycle.generation, 2);
});
test("les callbacks sont isolés des erreurs applicatives", () => {
  const canvas = fakeCanvas();
  const lifecycle = createWebGLContextLifecycle(canvas, {
    onLost() { throw new Error("lost"); },
    onRestored() { throw new Error("restored"); }
  });
  assert.doesNotThrow(() => canvas.dispatch("webglcontextlost", { preventDefault() {} }));
  assert.doesNotThrow(() => canvas.dispatch("webglcontextrestored"));
  assert.equal(lifecycle.canRender(), true);
});
test("dispose retire les écouteurs et interdit tout rendu ultérieur", () => {
  const canvas = fakeCanvas();
  const lifecycle = createWebGLContextLifecycle(canvas);
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(canvas.listeners.size, 0);
  assert.equal(lifecycle.disposed, true);
  assert.equal(lifecycle.canRender(), false);
  canvas.dispatch("webglcontextlost", { preventDefault() {} });
  assert.equal(lifecycle.generation, 1);
});
test("un canvas sans API événementielle est refusé explicitement", () => {
  assert.throws(() => createWebGLContextLifecycle({}), TypeError);
});
test("la taille backing respecte le DPR demandé pour une surface standard", () => {
  assert.deepEqual(getCanvasBackingSize(800, 400, 1.5), {
    width: 1200, height: 600, pixelRatio: 1.5, valid: true
  });
});
test("la taille backing plafonne le DPR maximal", () => {
  const size = getCanvasBackingSize(800, 400, 3, { maxPixelRatio: 2 });
  assert.equal(size.width, 1600);
  assert.equal(size.height, 800);
  assert.equal(size.pixelRatio, 2);
});
test("la taille backing respecte le budget maximal de pixels", () => {
  const size = getCanvasBackingSize(4000, 3000, 2, { maxPixelRatio: 3, maxPixels: 6_000_000 });
  assert.ok(size.width * size.height <= 6_000_000);
  assert.ok(size.pixelRatio < 2);
});
test("les dimensions backing restent entières et au moins égales à un pixel", () => {
  const size = getCanvasBackingSize(0.2, 0.3, 1);
  assert.equal(Number.isInteger(size.width), true);
  assert.equal(Number.isInteger(size.height), true);
  assert.ok(size.width >= 1 && size.height >= 1);
});
test("les dimensions invalides produisent une surface neutre sûre", () => {
  assert.deepEqual(getCanvasBackingSize(Infinity, 300, 2), {
    width: 1, height: 1, pixelRatio: 1, valid: false
  });
});
test("un budget pixels nul ou négatif est rejeté sans division invalide", () => {
  assert.equal(getCanvasBackingSize(100, 100, 2, { maxPixels: 0 }).valid, false);
});
test("une surface très étroite reste bornée même avec un DPR extrême", () => {
  const size = getCanvasBackingSize(1, 100000, 8, { maxPixelRatio: 4, maxPixels: 100000 });
  assert.ok(size.width * size.height <= 100000);
  assert.ok(size.pixelRatio <= 4);
});
