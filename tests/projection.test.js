import test from "node:test";
import assert from "node:assert/strict";
import { projectCoordinate, projectEquirectangular, projectMercator, projectOrthographic } from "../src/world/projection.js";

test("équirectangulaire place les limites du monde aux bords du canevas", () => {
  assert.deepEqual(projectEquirectangular(-180, 90, 360, 180), { x: 0, y: 0 });
  assert.deepEqual(projectEquirectangular(180, -90, 360, 180), { x: 360, y: 180 });
});

test("Mercator borne les latitudes polaires pour éviter les infinis", () => {
  const point = projectMercator(0, 90, 800, 400);
  assert.ok(Number.isFinite(point.y));
  assert.ok(point.y >= 0 && point.y <= 400);
});

test("projection orthographique masque l'hémisphère arrière", () => {
  assert.equal(projectOrthographic(180, 0, 800, 600), null);
  assert.ok(projectOrthographic(0, 0, 800, 600));
});

test("le routeur de projection refuse une projection inconnue", () => {
  assert.throws(() => projectCoordinate([0, 0], 100, 100, "unknown"), /Projection inconnue/);
});
