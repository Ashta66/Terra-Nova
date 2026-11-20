import test from "node:test";
import assert from "node:assert/strict";
import { sceneRenderParams, composeRects } from "../src/world/scene-compose.js";

const close = (actual, expected, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `attendu ${expected}, reçu ${actual}`);

test("une vue identique à zoom 1 compose exactement le rectangle écran", () => {
  const view = { zoom: 1, centerLongitude: 0, centerLatitude: 0 };
  const params = sceneRenderParams(view, 1000, 500, 1.4);
  assert.equal(params.f, 1);
  assert.equal(params.Ws, 1000);
  assert.equal(params.Hs, 500);
  assert.deepEqual(params.renderViewport, view);
  const composed = composeRects(view, view, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  assert.deepEqual(composed.rects, [{ x: 0, y: 0, w: 1000, h: 500 }]);
  assert.equal(composed.covered, true);
});

test("un déplacement en longitude produit le décalage géographique attendu", () => {
  const scene = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };
  const view = { zoom: 2, centerLongitude: 5, centerLatitude: 0 };
  const params = sceneRenderParams(scene, 1000, 500, 1.4);
  const { rects } = composeRects(view, scene, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  close(rects[0].x, 500 - (5 / 360) * 1000 * 2 - 700);
});

test("un zoom ×2 double l'échelle de composition autour du centre", () => {
  const scene = { zoom: 1.5, centerLongitude: 0, centerLatitude: 0 };
  const view = { ...scene, zoom: 3 };
  const params = sceneRenderParams(scene, 1000, 500, 1.4);
  const { rects } = composeRects(view, scene, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  assert.equal(rects.length, 1);
  close(rects[0].w, params.Ws * 2);
  close(rects[0].h, params.Hs * 2);
  close(rects[0].x + rects[0].w / 2, 500);
  close(rects[0].y + rects[0].h / 2, 250);
});

test("le passage +179° vers −179° utilise le petit écart de 2°", () => {
  const scene = { zoom: 1.5, centerLongitude: 179, centerLatitude: 0 };
  const view = { zoom: 1.5, centerLongitude: -179, centerLatitude: 0 };
  const params = sceneRenderParams(scene, 1000, 500, 1.4);
  const { rects } = composeRects(view, scene, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  const expected = 500 + (-2 / 360) * 1000 * 1.5 - (params.Ws / 2);
  close(rects[0].x, expected);
  assert.ok(Math.abs(rects[0].x) < 1000, "le déplacement ne doit pas être calculé sur 358°");
});

test("une scène couvrant le monde répète le bitmap par périodes ±W×zoom", () => {
  const scene = { zoom: 1.2, centerLongitude: 0, centerLatitude: 0 };
  const params = sceneRenderParams(scene, 1000, 500, 1.4);
  const eastView = { ...scene, centerLongitude: 100 };
  const east = composeRects(eastView, scene, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  const period = 1000 * 1.2;
  assert.ok(east.rects.some(rect => Math.abs(rect.x - (east.rects[0].x + period)) < 1e-6));
  const westView = { ...scene, centerLongitude: -100 };
  const west = composeRects(westView, scene, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  assert.ok(west.rects.some(rect => Math.abs(rect.x - (west.rects[0].x - period)) < 1e-6));
  assert.equal(east.covered, true);
});

test("la couverture devient fausse dès qu'un bord de scène entre dans l'écran", () => {
  const scene = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };
  const params = sceneRenderParams(scene, 1000, 500, 1.4);
  const centered = composeRects(scene, scene, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  assert.equal(centered.covered, true);
  const moved = composeRects(
    { ...scene, centerLongitude: -100 },
    scene,
    { w: params.Ws, h: params.Hs, f: params.f },
    1000, 500
  );
  assert.equal(moved.covered, false);
});

test("le zoom de rendu reste supérieur ou égal à 1 et conserve l'échelle écran", () => {
  const view = { zoom: 1.2, centerLongitude: 14, centerLatitude: 8 };
  const params = sceneRenderParams(view, 1000, 500, 1.4);
  assert.equal(params.f, 1.2);
  close(params.renderViewport.zoom, 1);
  close(params.Ws * params.renderViewport.zoom, 1000 * view.zoom);
  const zoomed = sceneRenderParams({ ...view, zoom: 8 }, 1000, 500, 1.4);
  assert.ok(zoomed.renderViewport.zoom >= 1);
  close(zoomed.Ws * zoomed.renderViewport.zoom, 1000 * 8);
});
