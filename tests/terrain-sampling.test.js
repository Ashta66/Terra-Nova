import test from "node:test";
import assert from "node:assert/strict";
import { sampleElevation } from "../src/world/terrain.js";

const spacing = 1 / 6;
const grid = {
  width: 4,
  height: 3,
  longitudeFirst: -179.99166666666667,
  latitudeFirst: 89.84166666666667,
  spacingDegrees: spacing,
  values: new Int16Array([
    10, 20, 30, 40,
    50, 60, 70, 80,
    90, 100, 110, 120
  ])
};

test("l'échantillonnage retrouve exactement les centres de pixels ETOPO", () => {
  assert.equal(sampleElevation(grid, grid.longitudeFirst, grid.latitudeFirst), 10);
  assert.equal(sampleElevation(grid, grid.longitudeFirst + spacing, grid.latitudeFirst), 20);
  assert.equal(sampleElevation(grid, grid.longitudeFirst, grid.latitudeFirst - spacing), 50);
});

test("l'interpolation bilinéaire se fait entre les vrais centres de pixels", () => {
  assert.equal(
    sampleElevation(grid, grid.longitudeFirst + spacing / 2, grid.latitudeFirst),
    15
  );
  assert.equal(
    sampleElevation(grid, grid.longitudeFirst, grid.latitudeFirst - spacing / 2),
    30
  );
});

test("la longitude s'enroule proprement à l'antiméridien", () => {
  assert.equal(
    sampleElevation(grid, grid.longitudeFirst + 4 * spacing, grid.latitudeFirst),
    10
  );
});
