import test from "node:test";
import assert from "node:assert/strict";
import * as terrain from "../src/world/terrain.js";
const { sampleElevation } = terrain;

function terrainSnowElevationForPixel(...args) {
  assert.equal(typeof terrain.terrainSnowElevationForPixel, "function", "le détecteur de pics doit être exporté");
  return terrain.terrainSnowElevationForPixel(...args);
}

function createDegreeGrid(fill = 1000) {
  const values = new Int16Array(360 * 180);
  values.fill(fill);
  return {
    width: 360,
    height: 180,
    longitudeFirst: -179.5,
    latitudeFirst: 89.5,
    longitudeSpacingDegrees: 1,
    latitudeSpacingDegrees: 1,
    values
  };
}

test("un pic montagneux étroit est détecté dans l'emprise d'un pixel éloigné", () => {
  const mountainGrid = createDegreeGrid(1000);
  mountainGrid.values[90 * mountainGrid.width + 180] = 5000;

  assert.ok(sampleElevation(mountainGrid, 0, 0) < 4000);
  assert.equal(terrainSnowElevationForPixel(mountainGrid, 0, 0, 1), 5000);
});

test("un haut plateau uniforme n'est pas blanchi comme un pic isolé", () => {
  const plateauGrid = createDegreeGrid(4200);

  assert.equal(sampleElevation(plateauGrid, 0, 0), 4200);
  assert.equal(terrainSnowElevationForPixel(plateauGrid, 0, 0, 1), 4200);
});

test("une zone polaire déjà enneigée conserve son altitude de couleur", () => {
  const polarGrid = createDegreeGrid(5000);

  assert.equal(terrainSnowElevationForPixel(polarGrid, 0, -89.5, 1), 5000);
});


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
