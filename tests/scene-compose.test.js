import test from "node:test";
import assert from "node:assert/strict";
import { fitMapFrame, coverMapFrame, sceneRenderParams, composeRects, snapSceneViewportCenter } from "../src/world/scene-compose.js";

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
  const { rects } = composeRects(view, params.renderViewport, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
  close(rects[0].x, 500 - (5 / 360) * 1000 * 2 - 700);
});

test("un zoom ×2 double l'échelle de composition autour du centre", () => {
  const scene = { zoom: 1.5, centerLongitude: 0, centerLatitude: 0 };
  const view = { ...scene, zoom: 3 };
  const params = sceneRenderParams(scene, 1000, 500, 1.4);
  const { rects } = composeRects(view, params.renderViewport, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
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
  const { rects } = composeRects(view, params.renderViewport, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
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
  assert.ok(west.rects.some(rect => Math.abs(rect.x - (west.rects.at(-1).x - period)) < 1e-6));
  assert.equal(east.covered, true);
});

test("la couverture devient fausse dès qu'un bord de scène entre dans l'écran", () => {
  const scene = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };
  const params = sceneRenderParams(scene, 1000, 500, 1.4);
  const centered = composeRects(params.renderViewport, params.renderViewport, { w: params.Ws, h: params.Hs, f: params.f }, 1000, 500);
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

test("la marge d'overscan couvre les quatre directions aux zooms usuels", () => {
  for (const zoom of [1, 1.2, 2, 8, 35]) {
    const scene = { zoom, centerLongitude: 0, centerLatitude: 0 };
    const params = sceneRenderParams(scene, 1000, 500, 1.4);
    const size = { w: params.Ws, h: params.Hs, f: params.f };
    assert.equal(composeRects(scene, scene, size, 1000, 500).covered, true, `centré à zoom ${zoom}`);
    const lonStep = 360 * 0.05 / zoom;
    const latStep = 180 * 0.05 / zoom;
    for (const direction of [-1, 1]) {
      const horizontal = composeRects({ ...scene, centerLongitude: direction * lonStep }, params.renderViewport, size, 1000, 500);
      assert.equal(horizontal.covered, true, `longitude ${direction} à zoom ${zoom}`);
      if (zoom > 1.001) {
        const vertical = composeRects({ ...scene, centerLatitude: direction * latStep }, params.renderViewport, size, 1000, 500);
        assert.equal(vertical.covered, true, `latitude ${direction} à zoom ${zoom}`);
      }
    }
  }
});


test("un panoramique ne déclenche pas de reconstruction complète tant que le pointeur est maintenu", async () => {
  const { shouldRecenterScene } = await import("../src/world/scene-compose.js");
  assert.equal(shouldRecenterScene(false, true), false);
  assert.equal(shouldRecenterScene(true, true), false);
});

test("une scène incomplète est recalculée dès que le geste est terminé", async () => {
  const { shouldRecenterScene } = await import("../src/world/scene-compose.js");
  assert.equal(shouldRecenterScene(false, false), true);
  assert.equal(shouldRecenterScene(true, false), false);
});


test("le centre de scène est quantifié pour réutiliser le même rendu pendant les micro-déplacements", () => {
  const first = snapSceneViewportCenter({ zoom: 4, centerLongitude: 12.10, centerLatitude: 48.10 }, 2);
  const nearby = snapSceneViewportCenter({ zoom: 4, centerLongitude: 12.20, centerLatitude: 48.20 }, 2);
  const nextCell = snapSceneViewportCenter({ zoom: 4, centerLongitude: 12.30, centerLatitude: 48.30 }, 2);
  assert.deepEqual(first, nearby);
  assert.notDeepEqual(first, nextCell);
  assert.ok(Math.abs(first.centerLongitude - 12.10) <= 0.25);
  assert.ok(Math.abs(first.centerLatitude - 48.10) <= 0.25);
});


test("le cadre cartographique contient toujours le monde entier au ratio 2:1", () => {
  for (const [availableWidth, availableHeight] of [
    [1680, 700], [1083, 1042], [900, 900], [420, 900], [1920, 1080], [640, 320]
  ]) {
    const fitted = fitMapFrame(availableWidth, availableHeight, 2);
    assert.ok(fitted.width <= availableWidth, "la largeur ne dépasse pas le cadre");
    assert.ok(fitted.height <= availableHeight, "la hauteur ne dépasse pas le cadre");
    assert.equal(fitted.width / fitted.height, 2, "le ratio géographique reste 2:1");
    assert.ok(fitted.width > 0 && fitted.height > 0);
  }
});

test("le cadre étroit en hauteur réduit la largeur plutôt que de couper les pôles", () => {
  assert.deepEqual(fitMapFrame(1500, 500, 2), { width: 1000, height: 500 });
  assert.deepEqual(fitMapFrame(700, 900, 2), { width: 700, height: 350 });
});


test("le mode zoom couvre le cadre sans déformer le ratio géographique", () => {
  for (const [availableWidth, availableHeight] of [
    [1680, 700], [1083, 1042], [900, 900], [420, 900], [1920, 1080], [640, 320]
  ]) {
    const fitted = coverMapFrame(availableWidth, availableHeight, 2);
    assert.ok(fitted.width >= availableWidth, "la largeur couvre le cadre");
    assert.ok(fitted.height >= availableHeight, "la hauteur couvre le cadre");
    close(fitted.width / fitted.height, 2);
    assert.ok(fitted.width === availableWidth || fitted.height === availableHeight,
      "un axe reste exactement aligné sur le cadre");
  }
});

test("en zoom, un cadre moins large que 2:1 déborde horizontalement et remplit sa hauteur", () => {
  assert.deepEqual(coverMapFrame(1500, 900), { width: 1800, height: 900 });
  assert.deepEqual(coverMapFrame(700, 900), { width: 1800, height: 900 });
});

test("en zoom, un cadre plus large que 2:1 déborde verticalement et remplit sa largeur", () => {
  assert.deepEqual(coverMapFrame(1800, 700), { width: 1800, height: 900 });
});

test("la bitmap overscan compose selon sa densité pixel/degree sans double-échelle",()=>{
 const view={zoom:2,centerLongitude:0,centerLatitude:0};
 const params=sceneRenderParams(view,1000,500,1.4);
 const size={w:params.Ws,h:params.Hs,f:params.f};
 const result=composeRects(view,params.renderViewport,size,1000,500);
 assert.equal(result.rects.length,1);
 close(result.rects[0].w,params.Ws);
 close(result.rects[0].h,params.Hs);
 close(result.rects[0].x,-(params.Ws-1000)/2);
 close(result.rects[0].y,-(params.Hs-500)/2);
});
