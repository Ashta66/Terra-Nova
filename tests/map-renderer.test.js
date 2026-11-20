import test from "node:test";
import assert from "node:assert/strict";
import { renderWorldMap } from "../src/world/map-renderer.js";
import { buildGeoSpatialIndex, queryGeoSpatialIndex } from "../src/world/geo-spatial-index.js";
import { calculateHillshade, classifyLandform, terrainColorForElevation } from "../src/world/terrain.js";

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
    stroke: (...args) => calls.push(["stroke", ...args]),
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (...args) => calls.push(["putImageData", ...args.slice(1)])
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
    { type: "Feature", properties: { name: "Europe", kind: "continent", minZoom: 1 }, geometry: { type: "Point", coordinates: [-30, 65] } },
    { type: "Feature", properties: { name: "Paris", kind: "city", minZoom: 2 }, geometry: { type: "Point", coordinates: [2.35, 48.86] } }
  ] };
  const world = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, labels, viewport: { zoom: 1 } });
  assert.deepEqual(world.labelHits.map(label => label.name), ["Europe"]);
  const regional = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, labels, viewport: { zoom: 2, centerLatitude: 45 } });
  assert.ok(regional.labelHits.some(label => label.name === "Paris"));
  assert.ok(calls.some(call => call[0] === "strokeText" && call[1] === "Europe"));
});


import { createTerrainGrid, sampleElevation, drawTerrainRaster } from "../src/world/terrain.js";

test("la grille ETOPO lit les entiers signés little-endian et interpole les coordonnées", () => {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  [10, 20, 30, 40].forEach((value, index) => view.setInt16(index * 2, value, true));
  const grid = createTerrainGrid(bytes, 2, 2);
  assert.equal(grid.min, 10);
  assert.equal(grid.max, 40);
  assert.equal(sampleElevation(grid, -90, 45), 10);
  assert.equal(sampleElevation(grid, 90, -45), 40);
  assert.throws(() => createTerrainGrid(bytes, 3, 2), /taille du raster/);
});

test("le raster de terrain produit des pixels sans dépendre du DOM", () => {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  [-1000, 500, 1200, 3200].forEach((value, index) => view.setInt16(index * 2, value, true));
  const grid = createTerrainGrid(bytes, 2, 2);
  let image = null, placed = false;
  const context = {
    createImageData(width, height) { image = { width, height, data: new Uint8ClampedArray(width * height * 4) }; return image; },
    putImageData(value, x, y) { placed = value === image && x === 0 && y === 0; }
  };
  assert.equal(drawTerrainRaster(context, 4, 2, grid), true);
  assert.equal(placed, true);
  assert.equal(image.data.length, 32);
  assert.ok([...image.data].some(value => value > 0));
});


test("le relief ETOPO est actif en équirectangulaire et masqué sur les projections non prises en charge", () => {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  [-1000, 500, 1200, 3200].forEach((value, index) => view.setInt16(index * 2, value, true));
  const terrain = createTerrainGrid(bytes, 2, 2);
  const { canvas, calls } = createCanvas();
  const flat = renderWorldMap(canvas, land, { width: 4, height: 2, pixelRatio: 1, terrain });
  assert.equal(flat.terrainEnabled, true);
  assert.ok(calls.some(call => call[0] === "putImageData"));
  const globe = renderWorldMap(canvas, land, { width: 4, height: 2, pixelRatio: 1, terrain, projection: "orthographic" });
  assert.equal(globe.terrainEnabled, false);
});


test("la bathymétrie reste discrète et sans ombrage local marqué", () => {
  const deep = terrainColorForElevation(-6000, 1);
  const deepWithStrongRelief = terrainColorForElevation(-6000, 0.65);
  const shelf = terrainColorForElevation(-200, 1);
  const land = terrainColorForElevation(1800, 1);
  assert.ok(Math.max(...deepWithStrongRelief.map((channel, i) => Math.abs(channel - deep[i]))) <= 2);
  assert.ok(Math.max(...deep.map((channel, i) => Math.abs(channel - shelf[i]))) < 35);
  assert.ok(Math.max(...deep.map((channel, i) => Math.abs(channel - land[i]))) > 35);
});


test("le hillshade directionnel est neutre sur une surface plane et borné sur les pentes", () => {
  assert.equal(calculateHillshade(100, 100, 100, 100, 45), 1);
  const illuminatedSlope = calculateHillshade(0, 1800, 900, 0, 45);
  const oppositeSlope = calculateHillshade(1800, 0, 0, 900, 45);
  assert.ok(illuminatedSlope >= 0.84 && illuminatedSlope <= 1.16);
  assert.ok(oppositeSlope >= 0.84 && oppositeSlope <= 1.16);
  assert.notEqual(illuminatedSlope, oppositeSlope);
});


test("les classes de relief distinguent montagnes, plateaux, vallées et plaines", () => {
  assert.equal(classifyLandform(-2500, -2600, -2400, -2550, -2450, 35), "ocean");
  assert.equal(classifyLandform(3200, 0, 2600, 1800, 300, 45), "mountains");
  assert.equal(classifyLandform(1200, 1190, 1210, 1200, 1200, 30), "plateaus");
  assert.equal(classifyLandform(400, 700, 700, 700, 700, 40), "valleys");
  assert.equal(classifyLandform(100, 100, 100, 100, 100, 40), "plains");
});

test("les classes terrestres modulent discrètement la palette sans toucher la bathymétrie", () => {
  const base = terrainColorForElevation(300, 1);
  const plain = terrainColorForElevation(300, 1, "plains");
  const mountain = terrainColorForElevation(3000, 1, "mountains");
  const sea = terrainColorForElevation(-3000, 1, "ocean");
  assert.notDeepEqual(plain, base);
  assert.notDeepEqual(mountain, terrainColorForElevation(3000, 1));
  assert.deepEqual(sea, terrainColorForElevation(-3000, 1));
});


test("la qualité du raster peut être réduite pendant le glissement pour préserver la fluidité", () => {
  const grid = createTerrainGrid(new Uint8Array(8), 2, 2);
  let dimensions = null;
  const context = {
    createImageData(width, height) {
      dimensions = [width, height];
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData() {}
  };
  assert.equal(drawTerrainRaster(context, 1200, 600, grid, {}, 0.5), true);
  assert.deepEqual(dimensions, [256, 128]);
});

test("le rendu du terrain reste plafonné à 512 × 256 en qualité normale sur les grands écrans", () => {
  const grid = createTerrainGrid(new Uint8Array(8), 2, 2);
  let dimensions = null;
  const context = {
    createImageData(width, height) {
      dimensions = [width, height];
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData() {}
  };
  assert.equal(drawTerrainRaster(context, 1600, 900, grid), true);
  assert.deepEqual(dimensions, [455, 256]);
});


test("le moteur écarte les entités géographiques hors du viewport régional", async () => {
  const { selectVisibleFeatures } = await import("../src/world/map-renderer.js");
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "visible" }, geometry: { type: "Point", coordinates: [5, 5] } },
    { type: "Feature", properties: { name: "hors écran" }, geometry: { type: "Point", coordinates: [140, 40] } }
  ] };
  const visible = selectVisibleFeatures(collection, { zoom: 4, centerLongitude: 0, centerLatitude: 0 });
  assert.equal(visible.features.length, 1);
  assert.equal(visible.features[0].properties.name, "visible");
  assert.equal(selectVisibleFeatures(collection, { zoom: 1 }), collection);
});


test("l'index spatial construit des secteurs et retourne seulement les entités visibles", () => {
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "paris" }, geometry: { type: "Point", coordinates: [2.35, 48.86] } },
    { type: "Feature", properties: { id: "tokyo" }, geometry: { type: "Point", coordinates: [139.7, 35.6] } },
    { type: "Feature", properties: { id: "sydney" }, geometry: { type: "Point", coordinates: [151.2, -33.8] } }
  ] };
  const index = buildGeoSpatialIndex(collection, 10);
  const visible = queryGeoSpatialIndex(index, { zoom: 4, centerLongitude: 0, centerLatitude: 45 });
  assert.deepEqual(visible.features.map(feature => feature.properties.id), ["paris"]);
  assert.equal(queryGeoSpatialIndex(index, { zoom: 1 }), collection);
});

test("l'index spatial conserve les grandes géométries et les géométries sans coordonnées", () => {
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "world" }, geometry: { type: "Polygon", coordinates: [[[-179, -80], [179, -80], [179, 80], [-179, 80], [-179, -80]]] } },
    { type: "Feature", properties: { id: "empty" }, geometry: null }
  ] };
  const visible = queryGeoSpatialIndex(buildGeoSpatialIndex(collection), { zoom: 12, centerLongitude: 0, centerLatitude: 0 });
  assert.deepEqual(visible.features.map(feature => feature.properties.id), ["world", "empty"]);
});


test("les sélections spatiales sont réutilisées tant que le viewport reste dans les mêmes secteurs", () => {
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "a" }, geometry: { type: "Point", coordinates: [2, 48] } },
    { type: "Feature", properties: { id: "b" }, geometry: { type: "Point", coordinates: [25, 48] } },
    { type: "Feature", properties: { id: "c" }, geometry: { type: "Point", coordinates: [140, 35] } }
  ] };
  const index = buildGeoSpatialIndex(collection, 10);
  const first = queryGeoSpatialIndex(index, { zoom: 4, centerLongitude: 0, centerLatitude: 45 });
  const second = queryGeoSpatialIndex(index, { zoom: 4, centerLongitude: 1, centerLatitude: 46 });
  assert.strictEqual(second, first);
  assert.equal(index.queryCache.size, 1);
});

test("le cache des sélections spatiales reste borné", () => {
  const collection = { type: "FeatureCollection", features: Array.from({ length: 80 }, (_, i) => ({
    type: "Feature", properties: { id: i }, geometry: { type: "Point", coordinates: [-175 + i * 4.4, -80 + (i % 30) * 5.3] }
  })) };
  const index = buildGeoSpatialIndex(collection, 10);
  for (let longitude = -160; longitude <= 160; longitude += 10) {
    queryGeoSpatialIndex(index, { zoom: 5, centerLongitude: longitude, centerLatitude: 0 });
  }
  assert.ok(index.queryCache.size <= 48);
});
