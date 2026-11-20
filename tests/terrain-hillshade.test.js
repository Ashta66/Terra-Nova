import test from "node:test";
import assert from "node:assert/strict";
import { calculateHillshade, RELIEF_EXAGGERATION, terrainColorForElevation } from "../src/world/terrain.js";

test("le hillshade conserve une luminosité neutre sur une surface plane", () => {
  assert.equal(RELIEF_EXAGGERATION, 18);
  assert.equal(calculateHillshade(100, 100, 100, 100, 45), 1);
});

test("l'exagération par défaut vaut 18 et un réglage explicite est pris en compte", () => {
  const args = [0, 1200, 0, 0, 30, 1 / 6];
  assert.equal(calculateHillshade(...args), calculateHillshade(...args, 18));
  assert.notEqual(calculateHillshade(...args, 6), calculateHillshade(...args, 18));
});

test("les versants est-ouest et nord-sud produisent un contraste directionnel", () => {
  const eastFacing = calculateHillshade(-1800, 1800, 0, 0, 30);
  const westFacing = calculateHillshade(1800, -1800, 0, 0, 30);
  const northFacing = calculateHillshade(0, 0, 1800, -1800, 30);
  const southFacing = calculateHillshade(0, 0, -1800, 1800, 30);
  assert.ok(Math.abs(eastFacing - westFacing) > 0.02);
  assert.ok(Math.abs(northFacing - southFacing) > 0.02);
});

test("le hillshade reste borné pour les pentes extrêmes et les latitudes élevées", () => {
  for (const latitude of [-89, -60, 0, 60, 89]) {
    const shade = calculateHillshade(-12000, 12000, 12000, -12000, latitude);
    assert.ok(shade >= 0.48 && shade <= 1.52);
  }
});

test("la palette terrestre progresse vers la neige sans rupture à 2 000 m", () => {
  const at1999 = terrainColorForElevation(1999);
  const at2000 = terrainColorForElevation(2000);
  const at2600 = terrainColorForElevation(2600);
  const at4000 = terrainColorForElevation(4000);
  const luminance = color => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  assert.ok(Math.max(...at1999.map((v, i) => Math.abs(v - at2000[i]))) <= 1);
  assert.ok(luminance(at2000) < luminance(at2600));
  assert.ok(luminance(at2600) < luminance(at4000));
});
