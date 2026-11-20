import test from "node:test";
import assert from "node:assert/strict";
import { calculateZoomTilePlan } from "../src/world/terrain-preload-worker.js";

test("le worker prépare des tuiles pour les niveaux de zoom adjacents", () => {
  const plan = calculateZoomTilePlan({
    width: 720, height: 360, tileSize: 30,
    viewport: { zoom: 4, centerLongitude: 0, centerLatitude: 0 },
    padding: 0.2,
    zoomLevels: [2, 8]
  });
  assert.ok(plan.length > 0);
  assert.ok(plan.every(id => /^0\/\d+\/\d+$/.test(id)));
  assert.equal(new Set(plan).size, plan.length);
});

test("le worker gère l'antiméridien et ignore les niveaux invalides", () => {
  const plan = calculateZoomTilePlan({
    width: 720, height: 360, tileSize: 30,
    viewport: { zoom: 4, centerLongitude: 179, centerLatitude: 0 },
    padding: 0.2,
    zoomLevels: [4, 0, -1, Number.NaN, Infinity]
  });
  assert.ok(plan.length > 0);
  assert.ok(plan.every(id => Number(id.split("/")[1]) >= 0));
});

test("le worker renvoie une liste vide pour une grille invalide", () => {
  assert.deepEqual(calculateZoomTilePlan({ width: 0, height: 360, tileSize: 30 }), []);
});
