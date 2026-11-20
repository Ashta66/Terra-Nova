import test from "node:test";
import assert from "node:assert/strict";
import { renderWorldMap } from "../src/world/map-renderer.js";
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
  assert.ok(illuminatedSlope >= 0.72 && illuminatedSlope <= 1.22);
  assert.ok(oppositeSlope >= 0.72 && oppositeSlope <= 1.22);
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


import { createTerrainTileStore } from "../src/world/terrain-tiles.js";

test("les tuiles physiques ont des identifiants stables et des dimensions de bord correctes", () => {
  const values = Int16Array.from({ length: 30 }, (_, index) => index);
  const store = createTerrainTileStore({ width: 6, height: 5, values }, { tileSize: 4, maxTiles: 8 });
  const tile = store.getTile(1, 1);
  assert.equal(tile.id, "0/1/1");
  assert.equal(tile.width, 2);
  assert.equal(tile.height, 1);
  assert.deepEqual([...tile.values], [28, 29]);
  assert.equal(store.getTile(1, 1), tile);
});

test("une modification physique reste isolée dans sa tuile et incrémente sa révision", () => {
  const values = Int16Array.from({ length: 16 }, (_, index) => index);
  const grid = { width: 4, height: 4, values };
  const store = createTerrainTileStore(grid, { tileSize: 2 });
  const tile = store.getTileAt(-90, 45);
  const before = store.sample(-90, 45);
  assert.equal(store.setElevation(-90, 45, 1234), true);
  assert.equal(store.sample(-90, 45), 1234);
  assert.equal(tile.revision, 1);
  assert.equal(tile.dirty, true);
  assert.equal(grid.values[0], before);
});

test("le magasin borne sa mémoire et peut libérer les tuiles hors zone utile", () => {
  const values = new Int16Array(64);
  const store = createTerrainTileStore({ width: 8, height: 8, values }, { tileSize: 2, maxTiles: 2 });
  store.getTile(0, 0);
  store.getTile(1, 0);
  store.getTile(2, 0);
  assert.equal(store.size, 2);
  assert.equal(store.evictUnused([store.getTileId(2, 0)]), 1);
  assert.deepEqual(store.loadedIds, ["0/2/0"]);
});

test("les coordonnées invalides et les altitudes hors plage sont rejetées proprement", () => {
  const store = createTerrainTileStore({ width: 4, height: 4, values: new Int16Array(16) });
  assert.equal(store.sample(Number.NaN, 0), null);
  assert.equal(store.getTile(-1, 0), null);
  assert.throws(() => store.setElevation(0, 0, 40000), /16 bits/);
});


test("une tuile modifiée reste protégée de l'éviction jusqu'à sa persistance", () => {
  const store = createTerrainTileStore({ width: 8, height: 8, values: new Int16Array(64) }, { tileSize: 2, maxTiles: 1 });
  const dirty = store.getTile(0, 0);
  dirty.values[0] = 77;
  dirty.revision++;
  dirty.dirty = true;
  store.getTile(1, 0);
  assert.equal(store.size, 2);
  assert.equal(store.getTile(0, 0).values[0], 77);
  assert.equal(store.markPersisted(dirty.id, dirty.revision), true);
  store.getTile(2, 0);
  assert.equal(store.size, 1);
  assert.equal(store.loadedIds.includes("0/0/0"), false);
});


test("le rendu peut échantillonner les révisions locales du magasin de tuiles", () => {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 16; i++) view.setInt16(i * 2, 100 + i, true);
  const grid = createTerrainGrid(bytes, 4, 4);
  const store = createTerrainTileStore(grid, { tileSize: 2, maxTiles: 4 });
  const before = sampleElevation(grid, -135, 67.5);
  assert.equal(store.setElevation(-135, 67.5, 2400), true);
  assert.equal(sampleElevation(store, -135, 67.5), 2400);
  assert.equal(sampleElevation(grid, -135, 67.5), before);
});


test("une tuile persistée restaure ses valeurs et sa révision sans rester sale", () => {
  const store = createTerrainTileStore({ width: 4, height: 4, values: new Int16Array(16) }, { tileSize: 2 });
  const restored = store.restoreTile({
    id: "0/1/0", x: 1, y: 0, width: 2, height: 2, revision: 7,
    values: Int16Array.from([11, 12, 13, 14])
  });
  assert.equal(restored, true);
  const tile = store.getTile(1, 0);
  assert.deepEqual([...tile.values], [11, 12, 13, 14]);
  assert.equal(tile.revision, 7);
  assert.equal(tile.dirty, false);
  assert.equal(store.restoreTile({
    id: "0/0/0", x: 0, y: 0, width: 1, height: 1, revision: 1,
    values: Int16Array.from([99])
  }), false);
});

test("le magasin transmet un instantané indépendant lors d'une modification", async () => {
  let saved = null;
  const store = createTerrainTileStore(
    { width: 4, height: 4, values: new Int16Array(16) },
    { tileSize: 2, onTileChange: async snapshot => { saved = snapshot; } }
  );
  assert.equal(store.setElevation(-90, 45, 1800), true);
  await Promise.resolve();
  assert.equal(saved.revision, 1);
  assert.equal(saved.values[0], 1800);
  assert.notEqual(saved.values, store.getTileAt(-90, 45).values);
});

test("la persistance IndexedDB se désactive proprement hors navigateur", async () => {
  const { createTerrainTilePersistence } = await import("../src/world/terrain-tile-storage.js");
  assert.equal(await createTerrainTilePersistence({ indexedDB: null }), null);
});


test("une tuile modifiée reste intacte après éviction puis rechargement du cache", () => {
  const store = createTerrainTileStore(
    { width: 4, height: 2, values: new Int16Array(8) },
    { tileSize: 2, maxTiles: 1 }
  );
  assert.equal(store.setElevation(-135, 45, 321), true);
  const edited = store.getTile(0, 0);
  assert.equal(store.markPersisted(edited.id, edited.revision), true);
  store.getTile(1, 0);
  assert.equal(store.getTile(0, 0).values[0], 321);
});


test("le préchargement couvre le monde puis anticipe une zone proche de l'antiméridien", () => {
  const store = createTerrainTileStore(
    { width: 24, height: 12, values: new Int16Array(24 * 12) },
    { tileSize: 4, maxTiles: 18 }
  );
  const worldTiles = store.preloadViewport({ zoom: 1, centerLongitude: 0, centerLatitude: 0 }, { padding: 0 });
  assert.equal(worldTiles.length, 18);
  const regionalTiles = store.preloadViewport(
    { zoom: 4, centerLongitude: 170, centerLatitude: 0 },
    { padding: 0.2 }
  );
  assert.ok(regionalTiles.includes("0/5/0"));
  assert.ok(regionalTiles.includes("0/0/0"));
  assert.ok(regionalTiles.length < worldTiles.length);
  assert.deepEqual(new Set(store.loadedIds), new Set(regionalTiles));
});

test("le préchargement respecte les limites polaires et les coordonnées invalides", () => {
  const store = createTerrainTileStore(
    { width: 12, height: 8, values: new Int16Array(96) },
    { tileSize: 2, maxTiles: 24 }
  );
  const ids = store.preloadViewport({ zoom: 3, centerLongitude: -540, centerLatitude: 85 }, { padding: 0.5 });
  assert.ok(ids.length > 0);
  assert.ok(ids.every(id => { const parts = id.split("/"); return parts.length === 3 && parts[0] === "0" && parts.slice(1).every(part => Number.isInteger(Number(part))); }));
  assert.ok(ids.every(id => store.loadedIds.includes(id)));
});


test("le niveau de détail du relief interpole progressivement entre les parents et les enfants", () => {
  const values = Int16Array.from({ length: 64 }, (_, index) => index * 100);
  const store = createTerrainTileStore({ width: 8, height: 8, values }, { tileSize: 2, maxTiles: 16 });
  const fine = store.sampleLod(-135, 67.5, 0);
  const parent = store.sampleLod(-135, 67.5, 1);
  const halfway = store.sampleLod(-135, 67.5, 0.5);
  assert.ok(Number.isFinite(fine));
  assert.ok(Number.isFinite(parent));
  assert.ok(Math.abs(halfway - (fine + parent) / 2) < 1e-8);
  assert.equal(store.sampleLod(-135, 67.5, 0), store.sampleBilinear(-135, 67.5, 0));
});

test("le niveau de détail reste borné et accepte les coordonnées proches de l'antiméridien", () => {
  const values = Int16Array.from({ length: 48 }, (_, index) => index);
  const store = createTerrainTileStore({ width: 8, height: 6, values }, { tileSize: 2, maxTiles: 12 });
  assert.equal(store.sampleLod(179.9, 0, 99), store.sampleLod(179.9, 0, 4));
  assert.ok(Number.isFinite(store.sampleLod(-180.1, 0, 2.25)));
});


test("les couches dynamiques sont dessinées séparément après les couches statiques", () => {
  const { canvas, calls } = createCanvas();
  let received = null;
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1,
    dynamicLayers: [(context, frame) => {
      received = frame;
      context.beginPath();
      context.arc(10, 10, 3, 0, Math.PI * 2);
      context.stroke();
    }]
  });
  assert.equal(result.dynamicLayerCount, 1);
  assert.equal(received.projection.type, "equirectangular");
  assert.ok(calls.some(call => call[0] === "arc"));
});

test("le magasin de tuiles expose une révision globale pour invalider le cache physique", () => {
  const store = createTerrainTileStore(
    { width: 4, height: 4, values: new Int16Array(16) },
    { tileSize: 2 }
  );
  assert.equal(store.revision, 0);
  assert.equal(store.setElevation(-90, 45, 900), true);
  assert.equal(store.revision, 1);
  assert.equal(store.restoreTile({
    id: "0/1/0", x: 1, y: 0, width: 2, height: 2,
    revision: 3, values: new Int16Array(4)
  }), true);
  assert.equal(store.revision, 2);
});


import { calculateViewportTransform, getViewportPreviewWrapCopies, calculateExposedRegions } from "../src/world/map-renderer.js";

test("les bandes exposées d'un pan pur sont calculées sans chevauchement", () => {
  const regions = calculateExposedRegions(
    { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
    { zoom: 1, centerLongitude: 18, centerLatitude: 9 },
    360, 180
  );
  assert.deepEqual(regions, [
    { x: 342, y: 0, width: 18, height: 180 },
    { x: 0, y: 0, width: 342, height: 9 }
  ]);
});

test("les bandes exposées refusent zooms et grands déplacements", () => {
  assert.equal(calculateExposedRegions({ zoom: 1 }, { zoom: 2 }, 360, 180), null);
  assert.equal(calculateExposedRegions(
    { zoom: 1, centerLongitude: 0 }, { zoom: 1, centerLongitude: 180 }, 360, 180
  ), null);
  assert.deepEqual(calculateExposedRegions({}, {}, 360, 180), []);
});


test("la prévisualisation bitmap traduit correctement un déplacement du viewport", () => {
  const transform = calculateViewportTransform(
    { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
    { zoom: 1, centerLongitude: 90, centerLatitude: 0 },
    360, 180
  );
  assert.equal(transform.scale, 1);
  assert.equal(transform.translateX, -90);
  assert.equal(transform.translateY, 0);
});

test("la prévisualisation bitmap met à l'échelle autour du centre et suit le centre géographique", () => {
  const transform = calculateViewportTransform(
    { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
    { zoom: 2, centerLongitude: 10, centerLatitude: 5 },
    360, 180
  );
  assert.equal(transform.scale, 2);
  assert.equal(transform.translateX, -200);
  assert.equal(transform.translateY, -80);
});

test("la transformation bitmap reste finie pour des viewports incomplets", () => {
  const transform = calculateViewportTransform({}, {}, 640, 320);
  assert.deepEqual(transform, { scale: 1, translateX: 0, translateY: 0 });
});


test("la prévisualisation prolonge horizontalement le monde au zoom global", () => {
  assert.deepEqual(
    getViewportPreviewWrapCopies({ zoom: 1 }, { zoom: 1 }),
    [-1, 0, 1]
  );
});

test("la prévisualisation ne boucle pas les bords à un zoom rapproché", () => {
  assert.deepEqual(
    getViewportPreviewWrapCopies({ zoom: 1.5 }, { zoom: 2 }),
    [0]
  );
});

import { createGeoFeatureIndex } from "../src/world/map-renderer.js";
test("l'index spatial filtre les géométries selon le viewport",()=>{
 const a={id:"a",geometry:{type:"Point",coordinates:[-125,15]}};
 const b={id:"b",geometry:{type:"Point",coordinates:[45,15]}};
 const index=createGeoFeatureIndex({type:"FeatureCollection",features:[a,b]},10);
 assert.deepEqual(index.query({west:-140,east:-110,south:0,north:30}),[a]);
 assert.deepEqual(index.query({west:30,east:60,south:0,north:30}),[b]);
 assert.equal(index.query().length,2);
});
test("l'index spatial conserve les géométries traversant l'antiméridien",()=>{
 const crossing={id:"cross",geometry:{type:"LineString",coordinates:[[170,0],[-170,5]]}};
 const ordinary={id:"ordinary",geometry:{type:"Point",coordinates:[0,0]}};
 const index=createGeoFeatureIndex({type:"FeatureCollection",features:[crossing,ordinary]},10);
 assert.deepEqual(index.query({west:160,east:200,south:-10,north:10}),[crossing]);
});
