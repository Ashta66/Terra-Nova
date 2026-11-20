import test from "node:test";
import assert from "node:assert/strict";
import { renderWorldMap, buildTerritoryLabels, territoryColor } from "../src/world/map-renderer.js";
import { isNonStateHistoricalRegion, selectHistoricalPoliticalTerritories } from "../src/world/historical-boundaries.js";
import { buildGeoSpatialIndex, queryGeoSpatialIndex, selectGeoSpatialFeatures as selectVisibleFeatures } from "../src/world/geo-spatial-index.js";
import { calculateHillshade, classifyLandform, terrainColorForElevation } from "../src/world/terrain.js";

function createCanvas() {
  const calls = [];
  const context = {
    setTransform: (...args) => calls.push(["setTransform", ...args]),
    setLineDash: (...args) => calls.push(["setLineDash", ...args]),
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


test("les labels proches évitent les collisions tout en gardant la priorité des continents", () => {
  const { canvas } = createCanvas();
  const labels = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Ville A", kind: "city", minZoom: 2 }, geometry: { type: "Point", coordinates: [0, 0] } },
    { type: "Feature", properties: { name: "Continent", kind: "continent", minZoom: 1 }, geometry: { type: "Point", coordinates: [0.1, 0] } },
    { type: "Feature", properties: { name: "Ville B", kind: "city", minZoom: 2 }, geometry: { type: "Point", coordinates: [0.2, 0] } }
  ] };
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1, labels,
    viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 }
  });
  assert.equal(result.labelHits[0].name, "Continent");
  for (let i = 0; i < result.labelHits.length; i++) {
    for (let j = i + 1; j < result.labelHits.length; j++) {
      const a = result.labelHits[i].bounds, b = result.labelHits[j].bounds;
      const overlaps = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
      assert.equal(overlaps, false);
    }
  }
});


test("le canvas ne réalloue pas son bitmap quand ses dimensions restent identiques", () => {
  const { canvas } = createCanvas();
  let widthWrites = 0;
  let heightWrites = 0;
  let storedWidth = 0;
  let storedHeight = 0;
  Object.defineProperty(canvas, "width", {
    configurable: true,
    get: () => storedWidth,
    set: value => { widthWrites++; storedWidth = value; }
  });
  Object.defineProperty(canvas, "height", {
    configurable: true,
    get: () => storedHeight,
    set: value => { heightWrites++; storedHeight = value; }
  });

  renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 });
  assert.equal(widthWrites, 1);
  assert.equal(heightWrites, 1);
  renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 });
  assert.equal(widthWrites, 1);
  assert.equal(heightWrites, 1);

  renderWorldMap(canvas, land, { width: 800, height: 400, pixelRatio: 1 });
  assert.equal(widthWrites, 2);
  assert.equal(heightWrites, 2);
});


test("les chemins Path2D sont réutilisés pour un viewport identique et invalidés au déplacement", () => {
  const previous = globalThis.Path2D;
  let constructions = 0;
  class FakePath2D {
    constructor() { constructions++; }
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  globalThis.Path2D = FakePath2D;
  try {
    const { canvas } = createCanvas();
    renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 2, centerLongitude: 4, centerLatitude: 5 } });
    assert.equal(constructions, 2);
    renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 2, centerLongitude: 4, centerLatitude: 5 } });
    assert.equal(constructions, 2);
    // Une boucle complète de 360° présente exactement le même cadrage.
    renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 2, centerLongitude: 364, centerLatitude: 5 } });
    assert.equal(constructions, 2);
    renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 2, centerLongitude: 5, centerLatitude: 5 } });
    assert.equal(constructions, 4);
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});


test("les chemins des rivières Path2D sont réutilisés entre deux rendus identiques", () => {
  const previous = globalThis.Path2D;
  let constructions = 0;
  class FakePath2D {
    constructor() { constructions++; }
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  globalThis.Path2D = FakePath2D;
  try {
    const rivers = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: [[-5, 0], [0, 5], [5, 0]] } }
    ] };
    const { canvas, calls } = createCanvas();
    const options = { width: 640, height: 320, pixelRatio: 1, rivers, viewport: { zoom: 3, centerLongitude: 0, centerLatitude: 0 } };
    const first = renderWorldMap(canvas, land, options);
    assert.equal(first.riverCount, 1);
    assert.equal(constructions, 3);
    renderWorldMap(canvas, land, options);
    assert.equal(constructions, 3);
    assert.ok(calls.some(call => call[0] === "stroke" && call[1] instanceof FakePath2D));
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});


test("un MultiLineString conserve le nombre de segments hydrographiques avec Path2D", () => {
  const previous = globalThis.Path2D;
  class FakePath2D {
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  globalThis.Path2D = FakePath2D;
  try {
    const rivers = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "MultiLineString", coordinates: [
        [[-20, 0], [-10, 5]], [[10, 5], [20, 0]], [[30, 0], [35, 2]]
      ] } }
    ] };
    const { canvas } = createCanvas();
    const result = renderWorldMap(canvas, land, {
      width: 640, height: 320, pixelRatio: 1, rivers,
      viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 }
    });
    assert.equal(result.riverCount, 3);
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});


test("le préchargement prépare les sélections des secteurs voisins sans modifier la collection", async () => {
  const { prefetchGeoSpatialFeatures } = await import("../src/world/geo-spatial-index.js");
  const collection = { type: "FeatureCollection", features: Array.from({ length: 12 }, (_, index) => ({
    type: "Feature", properties: { id: index },
    geometry: { type: "Point", coordinates: [-150 + index * 25, 0] }
  })) };
  const originalFeatures = collection.features;
  const prepared = prefetchGeoSpatialFeatures(collection, { zoom: 3, centerLongitude: 0, centerLatitude: 0 }, 1);
  assert.ok(prepared > 0);
  assert.equal(collection.features, originalFeatures);
  assert.equal(prefetchGeoSpatialFeatures(collection, { zoom: 1, centerLongitude: 0, centerLatitude: 0 }), 0);
});


test("le cache spatial LRU reste borné à 48 requêtes et peut être vidé", async () => {
  const { selectGeoSpatialFeatures, getGeoSpatialIndexStats, clearGeoSpatialQueryCache } =
    await import("../src/world/geo-spatial-index.js");
  const collection = { type: "FeatureCollection", features: Array.from({ length: 30 }, (_, index) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [-170 + index * 11, -60 + (index % 10) * 12] }
  })) };
  for (let i = 0; i < 100; i++) {
    selectGeoSpatialFeatures(collection, { zoom: 5, centerLongitude: -170 + i * 3.4, centerLatitude: -70 + (i % 35) * 4 });
  }
  const stats = getGeoSpatialIndexStats(collection);
  assert.equal(stats.indexed, true);
  assert.equal(stats.maxCachedQueries, 48);
  assert.ok(stats.cachedQueries <= 48);
  assert.equal(clearGeoSpatialQueryCache(collection), true);
  assert.equal(getGeoSpatialIndexStats(collection).cachedQueries, 0);
});

test("les tracés qui traversent l'antiméridien suivent le court chemin au bord du planisphère", () => {
  const previous = globalThis.Path2D;
  const paths = [];
  class FakePath2D {
    constructor() { this.commands = []; paths.push(this); }
    moveTo(x, y) { this.commands.push(["moveTo", x, y]); }
    lineTo(x, y) { this.commands.push(["lineTo", x, y]); }
    closePath() { this.commands.push(["closePath"]); }
  }
  globalThis.Path2D = FakePath2D;
  try {
    const { canvas } = createCanvas();
    const rivers = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: [[179, 0], [-179, 0]] } }
    ] };
    renderWorldMap(canvas, { type: "FeatureCollection", features: [] }, {
      width: 640, height: 320, pixelRatio: 1, rivers,
      viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 }
    });
    const riverPath = paths.find(path => path.commands.some(command => command[0] === "lineTo"));
    const points = riverPath.commands.filter(command => command[0] === "moveTo" || command[0] === "lineTo");
    assert.equal(points.length, 2);
    assert.ok(Math.abs(points[1][1] - points[0][1]) < 5);
    assert.ok(points.every(point => point[1] > 630));
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});


test("le cache Path2D applique une limite globale même avec de nombreuses entités", async () => {
  const previous = globalThis.Path2D;
  let constructions = 0;
  class FakePath2D {
    constructor() { constructions++; }
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  globalThis.Path2D = FakePath2D;
  try {
    const { getProjectedPathCacheStats } = await import("../src/world/map-renderer.js");
    const collection = { type: "FeatureCollection", features: Array.from({ length: 540 }, (_, index) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[
        [index % 360 - 180, 0], [index % 360 - 178.5, 0],
        [index % 360 - 178.5, 1.5], [index % 360 - 180, 0]
      ]] }
    })) };
    const { canvas } = createCanvas();
    const result = renderWorldMap(canvas, collection, { width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 } });
    const stats = getProjectedPathCacheStats();
    assert.equal(result.landCount, 540);
    assert.ok(constructions >= 512, `Path2D créés : ${constructions}`);
    assert.ok(stats.cachedPaths <= 512);
    assert.equal(stats.maxCachedPaths, 512);
    assert.ok(stats.cachedVertices <= stats.maxCachedVertices);
    assert.equal(stats.maxCachedVertices, 250_000);
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});


test("les tuiles vectorielles sont stables, dédupliquées et cycliques à l'antiméridien", async () => {
  const {
    getGeoSpatialTilePlan, getGeoSpatialIndexStats, prefetchGeoSpatialFeatures
  } = await import("../src/world/geo-spatial-index.js");
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "alaska" }, geometry: { type: "Point", coordinates: [179, 55] } },
    { type: "Feature", properties: { id: "russia" }, geometry: { type: "Point", coordinates: [-179, 55] } },
    { type: "Feature", properties: { id: "paris" }, geometry: { type: "Point", coordinates: [2, 48] } }
  ] };
  const index = buildGeoSpatialIndex(collection, 10);
  const view = queryGeoSpatialIndex(index, { zoom: 8, centerLongitude: 180, centerLatitude: 55 });
  assert.deepEqual(view.features.map(feature => feature.properties.id), ["alaska", "russia"]);
  const plan = getGeoSpatialTilePlan(collection, { zoom: 8, centerLongitude: 180, centerLatitude: 55 });
  assert.ok(plan.visibleTileCount > 0);
  assert.ok(plan.tileKeys.some(key => key.startsWith("0:")) || plan.tileKeys.some(key => key.startsWith("35:")));
  assert.ok(prefetchGeoSpatialFeatures(collection, { zoom: 8, centerLongitude: 179, centerLatitude: 55 }) > 0);
  const stats = getGeoSpatialIndexStats(collection);
  assert.ok(stats.cachedTiles > 0);
  assert.ok(stats.cachedTiles <= stats.maxCachedTiles);
  assert.equal(stats.maxCachedTiles, 96);
});

test("le cache des tuiles vectorielles reste borné et peut être vidé", async () => {
  const { getGeoSpatialIndexStats, clearGeoSpatialQueryCache } = await import("../src/world/geo-spatial-index.js");
  const collection = { type: "FeatureCollection", features: Array.from({ length: 180 }, (_, i) => ({
    type: "Feature", properties: { id: i }, geometry: { type: "Point", coordinates: [-179 + i * 2, -80 + (i % 30) * 5] }
  })) };
  const { selectGeoSpatialFeatures } = await import("../src/world/geo-spatial-index.js");
  selectGeoSpatialFeatures(collection, { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  const stats = getGeoSpatialIndexStats(collection);
  assert.ok(stats.cachedTiles <= 96);
  assert.ok(stats.cachedQueries <= 48);
  assert.equal(clearGeoSpatialQueryCache(collection), true);
  assert.equal(getGeoSpatialIndexStats(collection).cachedTiles, 0);
});


test("les rivières traversant l'antiméridien restent continues sans Path2D", () => {
  const previous = globalThis.Path2D;
  try {
    delete globalThis.Path2D;
    const { canvas, calls } = createCanvas();
    const rivers = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: [[179, 0], [-179, 0]] } }
    ] };
    renderWorldMap(canvas, { type: "FeatureCollection", features: [] }, {
      width: 640, height: 320, pixelRatio: 1, rivers,
      viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 }
    });
    const points = calls.filter(call => call[0] === "moveTo" || call[0] === "lineTo");
    const riverPoints = points.slice(-2);
    assert.equal(riverPoints.length, 2);
    assert.ok(Math.abs(riverPoints[1][1] - riverPoints[0][1]) < 5);
    assert.ok(riverPoints.every(point => point[1] > 630));
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});

test("la simplification des côtes adapte le niveau de détail au zoom", async () => {
  const { getCoastSimplificationProfile } = await import("../src/world/map-renderer.js");
  const world = getCoastSimplificationProfile(1);
  const regional = getCoastSimplificationProfile(3);
  const close = getCoastSimplificationProfile(12);
  assert.deepEqual(world, { tolerance: 1.2, minRingArea: 2 });
  assert.deepEqual(regional, { tolerance: 1.5, minRingArea: 2.8 });
  assert.deepEqual(close, { tolerance: 2.3, minRingArea: 5.5 });
  assert.deepEqual(getCoastSimplificationProfile(7), { tolerance: 1.9, minRingArea: 4 });
  assert.ok(world.tolerance < regional.tolerance && regional.tolerance < close.tolerance);
  assert.ok(world.minRingArea < regional.minRingArea && regional.minRingArea < close.minRingArea);
});

import { selectHistoricalSnapshot, historicalPolygonsToBoundaries } from "../src/world/historical-boundaries.js";

test("la sélection historique choisit le cliché temporel le plus proche sans interpolation", () => {
  const years = [{ year: 1400, filename: "world_1400.geojson" }, { year: 1500, filename: "world_1500.geojson" }];
  assert.equal(selectHistoricalSnapshot(1444, years).year, 1400);
  assert.equal(selectHistoricalSnapshot(1480, years).year, 1500);
});

test("les contours côtiers seuls ne sont pas confondus avec des frontières politiques", () => {
  const source = { type: "FeatureCollection", features: [{
    type: "Feature", properties: { NAME: "Corsica", BORDERPRECISION: 2 },
    geometry: { type: "Polygon", coordinates: [[[8, 41], [9, 41], [9, 43], [8, 41]]] }
  }] };
  const result = historicalPolygonsToBoundaries(source);
  assert.equal(result.features.length, 0);
});

test("les frontières politiques et administratives sont rendues comme deux couches distinctes", () => {
  const { canvas, calls } = createCanvas();
  const politicalBoundaries = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { BORDERPRECISION: 3 }, geometry: { type: "LineString", coordinates: [[0, 0], [5, 5]] } }
  ] };
  const administrativeBoundaries = { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "LineString", coordinates: [[1, 0], [6, 5]] } }
  ] };
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1,
    politicalBoundaries, administrativeBoundaries
  });
  assert.equal(result.politicalBoundaryCount, 2);
  assert.equal(result.administrativeBoundaryCount, 1);
  assert.ok(calls.some(call => call[0] === "setLineDash" && call[1].length === 0));
  assert.ok(calls.some(call => call[0] === "setLineDash" && call[1].length === 2));
});

test("les frontières historiques ne conservent que les segments partagés entre territoires", () => {
  const source = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { NAME: "Ouest", BORDERPRECISION: 3 }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } },
    { type: "Feature", properties: { NAME: "Est", BORDERPRECISION: 2 }, geometry: { type: "Polygon", coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] } }
  ] };
  const result = historicalPolygonsToBoundaries(source);
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.NAME, "Ouest");
  assert.equal(result.features[0].geometry.coordinates.length, 1);
  assert.deepEqual(result.features[0].geometry.coordinates[0], [[1, 0], [1, 1]]);
});

test("les noms des pays sont générés depuis les polygones territoriaux", () => {
  const territories = { type: "FeatureCollection", features: [{
    type: "Feature", properties: { ADMIN: "Testland" },
    geometry: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] }
  }] };
  const labels = buildTerritoryLabels(territories);
  assert.equal(labels.features.length, 1);
  assert.equal(labels.features[0].properties.name, "Testland");
  assert.equal(labels.features[0].properties.kind, "country");
  assert.ok(Math.abs(labels.features[0].geometry.coordinates[0] - 2) < 0.01);
  assert.ok(Math.abs(labels.features[0].geometry.coordinates[1] - 2) < 0.01);
});

test("les provinces reçoivent des labels à partir de leurs lignes administratives", () => {
  const provinces = { type: "FeatureCollection", features: [{
    type: "Feature", properties: { name: "Province test" },
    geometry: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] }
  }] };
  const labels = buildTerritoryLabels(null, provinces);
  assert.equal(labels.features.length, 1);
  assert.equal(labels.features[0].properties.kind, "province");
  assert.equal(labels.features[0].properties.name, "Province test");
});


test("la France reçoit un bleu roi dans la palette politique", () => {
  assert.equal(territoryColor({ type: "Feature", properties: { ADMIN: "France", ADM0_A3: "FRA" } }), "#3159A6");
});

test("les autres pays reçoivent une couleur stable distincte du bleu roi français", () => {
  const feature = { type: "Feature", properties: { ADMIN: "Spain", ADM0_A3: "ESP" } };
  assert.equal(territoryColor(feature), territoryColor(feature));
  assert.notEqual(territoryColor(feature), "#3159A6");
});


test("les sociétés sans État ne sont pas colorées comme des pays souverains", () => {
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { NAME: "France" }, geometry: { type: "Polygon", coordinates: [] } },
    { type: "Feature", properties: { NAME: "Amazon hunter-gatherers" }, geometry: { type: "Polygon", coordinates: [] } },
    { type: "Feature", properties: { NAME: "North American Pacific foraging, hunting and fishing peoples" }, geometry: { type: "Polygon", coordinates: [] } },
    { type: "Feature", properties: { NAME: "Castile" }, geometry: { type: "Polygon", coordinates: [] } }
  ] };
  assert.equal(isNonStateHistoricalRegion(collection.features[1]), true);
  assert.equal(isNonStateHistoricalRegion(collection.features[2]), true);
  assert.deepEqual(selectHistoricalPoliticalTerritories(collection).features.map(feature => feature.properties.NAME), ["France", "Castile"]);
});

test("les couleurs héraldiques historiques sont reconnaissables", () => {
  assert.equal(territoryColor({ properties: { NAME: "England" } }), "#B83A43");
  assert.equal(territoryColor({ properties: { NAME: "Castile" } }), "#D9A52B");
  assert.equal(territoryColor({ properties: { NAME: "Portugal" } }), "#3D805B");
});

import { classifyHistoricalTerritoryStyle, classifyPhysicalCellVisual } from "../src/world/map-renderer.js";
import { selectHistoricalPoliticalTerritories } from "../src/world/historical-boundaries.js";

test("les quatre statuts historiques ont une classification distincte",()=>{
 assert.equal(classifyHistoricalTerritoryStyle({properties:{historicalStatus:"sovereign"}}),"sovereign");
 assert.equal(classifyHistoricalTerritoryStyle({properties:{historicalStatus:"contested"}}),"contested");
 assert.equal(classifyHistoricalTerritoryStyle({properties:{historicalStatus:"influence"}}),"influence");
 assert.equal(classifyHistoricalTerritoryStyle({properties:{historicalStatus:"unclaimed"}}),"unclaimed");
});
test("les sociétés non étatiques restent visibles dans la couche historique",()=>{
 const input={type:"FeatureCollection",features:[{type:"Feature",properties:{NAME:"Indigenous peoples"},geometry:{type:"Polygon",coordinates:[]}}]};
 const result=selectHistoricalPoliticalTerritories(input);
 assert.equal(result.features.length,1);
 assert.equal(result.features[0].properties.historicalStatus,"influence");
});
test("les colonies peuvent hériter de la puissance souveraine sans perdre leur statut de région",()=>{
 const input={type:"FeatureCollection",features:[{type:"Feature",properties:{NAME:"New France",SUBJECTO:"France"},geometry:{type:"Polygon",coordinates:[]}}]};
 const result=selectHistoricalPoliticalTerritories(input);
 assert.equal(result.features[0].properties.NAME,"New France");
 assert.equal(result.features[0].properties.SUBJECTO,"France");
 assert.equal(result.features[0].properties.historicalStatus,"sovereign");
});
test("les changements géophysiques disposent d'un rendu distinct",()=>{
 assert.equal(classifyPhysicalCellVisual({inundated:true,waterDepthM:3}).kind,"submerged");
 assert.equal(classifyPhysicalCellVisual({surfaceState:"lava-flow"}).kind,"lava");
 assert.equal(classifyPhysicalCellVisual({surfaceState:"crater"}).kind,"impact");
 assert.equal(classifyPhysicalCellVisual({ashLoad:.7}).kind,"ash");
 assert.equal(classifyPhysicalCellVisual({damage:.8}).kind,"damage");
 assert.equal(classifyPhysicalCellVisual({elevationDeltaM:10}).kind,"uplift");
 assert.equal(classifyPhysicalCellVisual({damage:.01}),null);
});
