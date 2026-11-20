import test from "node:test";
import assert from "node:assert/strict";
import { renderWorldMap, getTerrainTransitionOpacity } from "../src/world/map-renderer.js";
import { calculateHillshade, classifyLandform, terrainColorForElevation, getTerrainLod } from "../src/world/terrain.js";


test("le LOD du relief suit progressivement la densité de pixels du viewport", () => {
  const grid = { width: 2160 };
  const world = getTerrainLod(grid, 960, 1);
  const regional = getTerrainLod(grid, 960, 2);
  const close = getTerrainLod(grid, 960, 4);
  assert.ok(world > regional);
  assert.ok(regional > close);
  assert.ok(world <= 4 && close >= 0);
  assert.equal(getTerrainLod(grid, 960, 0), 0);
});

test("le LOD reste continu au passage entre deux niveaux parent/enfant", () => {
  const grid = { width: 2048 };
  const thresholdZoom = 2;
  const before = getTerrainLod(grid, 1024, thresholdZoom - 1e-6);
  const after = getTerrainLod(grid, 1024, thresholdZoom + 1e-6);
  assert.ok(Math.abs(before - after) < 1e-5);
  assert.equal(getTerrainLod(grid, 1024, Number.NaN), 0);
});

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

test("l'index spatial filtre aussi les repères de relief et les labels hors viewport",()=>{
 const {canvas,calls}=createCanvas();
 const elevationPoints={type:"FeatureCollection",features:[
  {type:"Feature",properties:{name:"Visible",kind:"mountain",elevation_m:6000},geometry:{type:"Point",coordinates:[0,0]}},
  {type:"Feature",properties:{name:"Lointain",kind:"mountain",elevation_m:6000},geometry:{type:"Point",coordinates:[140,0]}}
 ]};
 const labels={type:"FeatureCollection",features:[
  {type:"Feature",properties:{name:"Centre",kind:"continent"},geometry:{type:"Point",coordinates:[0,0]}},
  {type:"Feature",properties:{name:"Ailleurs",kind:"continent"},geometry:{type:"Point",coordinates:[140,0]}}
 ]};
 const result=renderWorldMap(canvas,land,{width:640,height:320,pixelRatio:1,viewport:{zoom:4,centerLongitude:0,centerLatitude:0},elevationPoints,labels});
 assert.equal(result.elevationPointCount,1);
 assert.deepEqual(result.labelHits.map(item=>item.name),["Centre"]);
 assert.ok(!calls.some(call=>call[0]==="fillText" && call[1]==="Lointain"));
});

test("le raster de relief ne calcule et ne place que la région sale demandée",()=>{
 const bytes=new Uint8Array(16);
 const view=new DataView(bytes.buffer);
 for(let i=0;i<8;i++) view.setInt16(i*2,100+i,true);
 const grid=createTerrainGrid(bytes,4,2);
 let image=null, placement=null;
 const context={
  createImageData(width,height){image={width,height,data:new Uint8ClampedArray(width*height*4)};return image;},
  putImageData(value,x,y){placement={value,x,y};}
 };
 assert.equal(drawTerrainRaster(context,4,2,grid,{zoom:1,centerLongitude:0,centerLatitude:0},{x:1,y:0,width:2,height:2}),true);
 assert.deepEqual({width:image.width,height:image.height},{width:2,height:2});
 assert.equal(placement.x,1);
 assert.equal(placement.y,0);
 assert.equal(image.data.length,16);
});


test("l'opacité de transition du relief est bornée et progressive", () => {
  assert.equal(getTerrainTransitionOpacity(-1), 0);
  assert.equal(getTerrainTransitionOpacity(0), 0);
  assert.equal(getTerrainTransitionOpacity(0.25), 0.25);
  assert.equal(getTerrainTransitionOpacity(0.5), 0.5);
  assert.equal(getTerrainTransitionOpacity(1), 1);
  assert.equal(getTerrainTransitionOpacity(2), 1);
  assert.equal(getTerrainTransitionOpacity(Number.NaN), 1);
});


test("le rendu expose des mesures séparées par famille de couches", () => {
  const { canvas } = createCanvas();
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1,
    dynamicLayers: [(context) => context.fillRect(1, 1, 2, 2)]
  });
  for (const key of ["totalMs", "terrainMs", "politicalMs", "labelsMs", "dynamicMs"]) {
    assert.ok(Number.isFinite(result.performance[key]));
    assert.ok(result.performance[key] >= 0);
  }
  assert.ok(result.performance.totalMs >= result.performance.politicalMs);
});


import { encodeTerrainTexture, renderTerrainWebGL, getTerrainWebGLShaders, getTerrainWebGLStats, resizeTerrainWebGLSurface, prepareTerrainTextureGrid, buildTerrainTileTexture, getTerrainTileGeoBounds, getTerrainTileScreenRects, createTerrainWebGLTileCache, selectTerrainTileLevel, collectTerrainViewportTiles, collectTerrainPredictiveTiles, getTerrainTileTransitionOpacity, buildTerrainTileBatchVertices, createTerrainWebGLTileAtlas, buildTerrainTileAtlasBatchVertices } from "../src/world/terrain-webgl.js";

test("le codage de texture WebGL conserve les altitudes ETOPO signées sur 16 bits", () => {
  const packed = encodeTerrainTexture(Int16Array.from([-32768, -1000, 0, 1200, 32767]));
  const decoded = [];
  assert.equal(packed.byteLength, 5 * 2);
  for (let i = 0; i < packed.length; i += 2) {
    let value = packed[i] + packed[i + 1] * 256;
    if (value >= 32768) value -= 65536;
    decoded.push(value);
  }
  assert.deepEqual(decoded, [-32768, -1000, 0, 1200, 32767]);
});

test("le rendu WebGL se désactive proprement si aucune grille exploitable n'est fournie", () => {
  assert.equal(renderTerrainWebGL(null, 320, 160), null);
  assert.equal(renderTerrainWebGL({ width: 1, height: 1 }, 320, 160), null);
  const shaders = getTerrainWebGLShaders();
  assert.match(shaders.vertex, /gl_Position/);
  assert.match(shaders.fragment, /elevationAt/);
  assert.match(shaders.fragment, /sampleA\.a/);
  assert.match(shaders.fragment, /fract\(p00.x\)/);
});

test("le shader WebGL tuilé échantillonne les textures locales avec leurs bordures", () => {
  const shader = getTerrainWebGLShaders().tileFragment;
  assert.match(shader, /v_atlasUv/);
  assert.match(shader, /u_opacity/);
  assert.match(shader, /v_atlasUv/);
  assert.match(shader, /v_atlasStep/);
  assert.match(shader, /v_atlasBounds/);
  assert.match(shader, /clamp\(uv,v_atlasBounds/);
  assert.match(shader, /s\.a/);
  assert.match(shader, /v_tileStep/);
  assert.match(shader, /gl_FragColor/);
});

test("le moteur conserve Canvas 2D comme rendu de repli sans surface WebGL", () => {
  const { canvas } = createCanvas();
  const result = renderWorldMap(canvas, land, {
    width: 4, height: 2, pixelRatio: 1,
    terrain: { width: 2, height: 2, values: new Int16Array(4) },
    terrainWebGLGrid: { width: 2, height: 2, values: new Int16Array(4) }
  });
  assert.equal(result.terrainRenderer, "canvas2d");
});


test("le shader WebGL reprend l'éclairage directionnel et les dimensions réelles du MNT", () => {
  const shader = getTerrainWebGLShaders().fragment;
  assert.match(shader, /360\.0 \/ u_gridSize\.x/);
  assert.match(shader, /180\.0 \/ u_gridSize\.y/);
  assert.match(shader, /radians\(315\.0\)/);
  assert.match(shader, /radians\(45\.0\)/);
  assert.match(shader, /0\.65/);
  assert.match(shader, /relativeHeight/);
  assert.match(shader, /190\.0,174\.0,157\.0/);
  assert.match(shader, /tintStrength = 0\.0/);
});

test("les statistiques GPU restent indisponibles sans renderer initialisé", () => {
  assert.equal(getTerrainWebGLStats(null), null);
  assert.equal(getTerrainWebGLStats({ width: 2, height: 2, values: new Int16Array(4) }), null);
});


test("la surface WebGL n'est redimensionnée que lorsque ses dimensions changent", () => {
  const surface = { width: 800, height: 600 };
  assert.equal(resizeTerrainWebGLSurface(surface, 800, 600), false);
  assert.deepEqual(surface, { width: 800, height: 600 });
  assert.equal(resizeTerrainWebGLSurface(surface, 1024, 600), true);
  assert.deepEqual(surface, { width: 1024, height: 600 });
  assert.equal(resizeTerrainWebGLSurface(surface, 1024, 768), true);
  assert.deepEqual(surface, { width: 1024, height: 768 });
  assert.equal(resizeTerrainWebGLSurface(surface, 0, 768), false);
});


test("la texture terrain est réduite aux limites GPU sans perdre les extrémités", () => {
  const values = Int16Array.from([
    -100, 0, 100, 200, 300,
    -200, 10, 110, 210, 310,
    -300, 20, 120, 220, 320
  ]);
  const source = { width: 5, height: 3, values };
  assert.equal(prepareTerrainTextureGrid(source, 8), source);
  const reduced = prepareTerrainTextureGrid(source, 3);
  assert.equal(reduced.width, 3);
  assert.equal(reduced.height, 2);
  assert.equal(reduced.values[0], -100);
  assert.equal(reduced.values[2], 300);
  assert.equal(reduced.values[3], -300);
  assert.equal(reduced.values[5], 320);
  assert.equal(reduced.sourceWidth, 5);
  assert.equal(reduced.sourceHeight, 3);
  assert.equal(prepareTerrainTextureGrid(source, 1), null);
});


test("les textures GPU des tuiles incluent une bordure continue entre voisines", () => {
  const width = 12, height = 8, tileSize = 4;
  const values = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) values[y * width + x] = y * 100 + x;
  }
  const store = createTerrainTileStore({ width, height, values }, { tileSize, maxTiles: 40 });
  const tile = store.getTileAtLevel(0, 1, 0);
  const texture = buildTerrainTileTexture(tile, store);
  assert.equal(texture.width, tile.width + 2);
  assert.equal(texture.height, tile.height + 2);
  // Bordure gauche issue de la tuile précédente.
  assert.equal(texture.values[1 * texture.width], 3);
  // Bordure droite issue de la tuile suivante.
  assert.equal(texture.values[1 * texture.width + texture.width - 1], 8);
  // Bordure nord répliquée au pôle de la grille.
  assert.equal(texture.values[0 * texture.width + 1], 4);
  // Coordonnées et niveau conservés pour positionner la tuile sur le globe.
  assert.equal(texture.originX, tile.originX);
  assert.equal(texture.originY, tile.originY);
  assert.equal(texture.level, 0);
  assert.equal(texture.stride, 1);
});

test("la bordure GPU des tuiles raccorde correctement l'antiméridien", () => {
  const width = 12, height = 8, tileSize = 4;
  const values = Int16Array.from({ length: width * height }, (_, index) => index);
  const store = createTerrainTileStore({ width, height, values }, { tileSize, maxTiles: 40 });
  const tile = store.getTileAtLevel(0, 0, 0);
  const texture = buildTerrainTileTexture(tile, store);
  assert.equal(texture.values[1 * texture.width], 11);
  assert.equal(texture.values[1 * texture.width + tile.width + 1], 4);
});


test("les bornes géographiques des tuiles parent respectent leur pas de résolution", () => {
  const store = createTerrainTileStore(
    { width: 12, height: 8, values: new Int16Array(96) },
    { tileSize: 4, maxTiles: 40 }
  );
  const tile = store.getTileAtLevel(1, 1, 0);
  assert.deepEqual(getTerrainTileGeoBounds(tile, store), {
    west: 60, east: 180, north: 90, south: -90
  });
});

test("le plan d'affichage GPU découpe les tuiles à la fenêtre visible", () => {
  const store = createTerrainTileStore(
    { width: 12, height: 8, values: new Int16Array(96) },
    { tileSize: 4, maxTiles: 40 }
  );
  const tile = store.getTileAtLevel(0, 1, 0);
  const rects = getTerrainTileScreenRects(tile, store,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 }, 360, 180);
  assert.equal(rects.length, 1);
  assert.deepEqual(rects[0], {
    x: 60, y: 0, width: 240, height: 90,
    u0: 0, u1: 1, v0: 0.5, v1: 1, longitudeShift: 0
  });
});

test("le plan d'affichage GPU répète la tuile qui traverse l'antiméridien", () => {
  const store = createTerrainTileStore(
    { width: 12, height: 8, values: new Int16Array(96) },
    { tileSize: 4, maxTiles: 40 }
  );
  const tile = store.getTileAtLevel(0, 0, 0);
  const rects = getTerrainTileScreenRects(tile, store,
    { zoom: 2, centerLongitude: 179, centerLatitude: 0 }, 180, 90);
  assert.equal(rects.length, 1);
  assert.equal(rects[0].longitudeShift, 360);
  assert.equal(rects[0].x, 91);
  assert.equal(rects[0].width, 89);
  assert.equal(rects[0].u0, 0);
  assert.ok(Math.abs(rects[0].u1 - 89 / 120) < 1e-12);
});


function createFakeTerrainGL(maxTextureSize = 64) {
  let nextTexture = 0;
  const deleted = [];
  const uploads = [];
  return {
    TEXTURE_2D: 1, TEXTURE_MIN_FILTER: 2, TEXTURE_MAG_FILTER: 3,
    TEXTURE_WRAP_S: 4, TEXTURE_WRAP_T: 5, LINEAR: 6, CLAMP_TO_EDGE: 7,
    UNPACK_ALIGNMENT: 8, LUMINANCE_ALPHA: 9, UNSIGNED_BYTE: 10,
    MAX_TEXTURE_SIZE: 11,
    deleted, uploads,
    createTexture() { return { id: ++nextTexture }; },
    deleteTexture(texture) { deleted.push(texture.id); },
    bindTexture() {},
    texParameteri() {},
    pixelStorei() {},
    getParameter(parameter) { return parameter === this.MAX_TEXTURE_SIZE ? maxTextureSize : 0; },
    texImage2D(target, level, internalFormat, width, height, border, format, type, data) {
      uploads.push({ width, height, bytes: data?.byteLength ?? 0, allocation: data == null });
    },
    texSubImage2D(target, level, x, y, width, height, format, type, data) {
      uploads.push({ x, y, width, height, bytes: data.byteLength, subImage: true });
    }
  };
}

test("l'atlas GPU partage une texture, réutilise ses slots et respecte la capacité", () => {
  const values = Int16Array.from({ length: 12 * 8 }, (_, index) => index);
  const store = createTerrainTileStore({ width: 12, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const gl = createFakeTerrainGL(18);
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 4 });
  assert.ok(atlas);
  assert.equal(atlas.capacity, 9);
  assert.equal(gl.uploads[0].allocation, true);
  const a = store.getTileAtLevel(0, 0, 0), b = store.getTileAtLevel(0, 1, 0);
  const first = atlas.get(a);
  const second = atlas.get(b);
  assert.equal(first.texture, second.texture);
  assert.notDeepEqual([first.slotX, first.slotY], [second.slotX, second.slotY]);
  assert.equal(atlas.get(a), first);
  assert.equal(atlas.stats.hits, 1);
  assert.equal(atlas.stats.uploads, 2);
  assert.equal(gl.uploads.filter(item => item.subImage).length, 2);
  assert.equal(atlas.memoryBytes, atlas.atlasWidth * atlas.atlasHeight * 2);
  atlas.clear();
  assert.equal(atlas.size, 0);
  assert.equal(atlas.get(a).texture, atlas.texture);
});

test("les tuiles prédictives sont transférées dans l'atlas hors du rendu courant", async () => {
  const values = Int16Array.from({ length: 12 * 8 }, (_, index) => index);
  const store = createTerrainTileStore({ width: 12, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const gl = createFakeTerrainGL(64);
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 4 });
  const tile = store.getTileAtLevel(0, 0, 0);
  const staleTile = store.getTileAtLevel(0, 1, 0);
  assert.equal(atlas.enqueue(tile), true);
  assert.equal(atlas.enqueue(staleTile), true);
  assert.equal(atlas.pendingCount, 2);
  atlas.retainPending(new Set(["0/0/0@0"]));
  assert.equal(atlas.pendingCount, 1);
  assert.equal(gl.uploads.filter(item => item.subImage).length, 0);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(atlas.pendingCount, 0);
  assert.equal(atlas.size, 1);
  assert.equal(gl.uploads.filter(item => item.subImage).length, 1);
  assert.equal(atlas.stats.uploads, 1);
  atlas.dispose();
  assert.equal(gl.deleted.length, 1);
});

test("le batch atlas regroupe plusieurs tuiles en une seule liste de triangles", () => {
  const items = [
    { tile: { level: 0, x: 0, y: 0, width: 4, height: 4 }, rects: [
      { x: 0, y: 0, width: 50, height: 40, u0: 0, u1: 1, v0: 0, v1: 1 }
    ] },
    { tile: { level: 0, x: 1, y: 0, width: 2, height: 4 }, rects: [
      { x: 50, y: 0, width: 50, height: 40, u0: 0, u1: 1, v0: 0, v1: 1 }
    ] }
  ];
  const entries = new Map([
    ["0/0/0@0", { slotX: 0, slotY: 0, level: 0, x: 0, y: 0 }],
    ["0/1/0@0", { slotX: 1, slotY: 0, level: 0, x: 1, y: 0 }]
  ]);
  const atlas = { cellSize: 6, atlasWidth: 12, atlasHeight: 12 };
  const vertices = buildTerrainTileAtlasBatchVertices(items, entries, 100, 40, atlas);
  assert.equal(vertices.length, 144);
  assert.deepEqual(Array.from(vertices.slice(0, 2)), [-1, 1]);
  const expectedFirstVertex = [1/12, 1/12, 1/12, 1/12, 1/6, 1/6, 0, 0, 5/12, 5/12];
  expectedFirstVertex.forEach((value, index) => assert.ok(Math.abs(vertices[index + 2] - value) < 1e-6));
  assert.ok(vertices.some((value, index) => index % 8 === 2 && value > 0.5));
});

test("le cache GPU des tuiles respecte le LRU et son budget mémoire", () => {
  const values = Int16Array.from({ length: 12 * 8 }, (_, index) => index);
  const store = createTerrainTileStore({ width: 12, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const gl = createFakeTerrainGL();
  const cache = createTerrainWebGLTileCache(gl, { maxTiles: 2, maxBytes: 1000 });
  const a = store.getTileAtLevel(0, 0, 0);
  const b = store.getTileAtLevel(0, 1, 0);
  const d = store.getTileAtLevel(0, 2, 0);
  const first = cache.get(a, store);
  assert.ok(first);
  assert.equal(cache.get(a, store), first);
  cache.get(b, store);
  cache.get(d, store);
  assert.equal(cache.size, 2);
  assert.deepEqual(gl.deleted, [first.texture.id]);
  assert.equal(cache.stats.overBudget, false);
  assert.equal(cache.memoryBytes, gl.uploads.slice(-2).reduce((sum, upload) => sum + upload.bytes, 0));
  assert.equal(cache.stats.hits, 1);
  assert.equal(cache.stats.misses, 3);
  assert.equal(cache.stats.uploads, 3);
  assert.equal(cache.stats.evictions, 1);
  assert.equal(cache.stats.uploadedBytes, gl.uploads.reduce((sum, upload) => sum + upload.bytes, 0));
  assert.ok(cache.stats.buildMs >= 0);
  assert.ok(cache.stats.uploadMs >= 0);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.memoryBytes, 0);
});

test("le cache GPU expose les transferts et réutilisations sans recompter un hit", () => {
  const values = new Int16Array(8 * 8);
  const store = createTerrainTileStore({ width: 8, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const gl = createFakeTerrainGL();
  const cache = createTerrainWebGLTileCache(gl);
  const tile = store.getTileAtLevel(0, 0, 0);
  cache.get(tile, store);
  cache.get(tile, store);
  assert.equal(cache.stats.hits, 1);
  assert.equal(cache.stats.misses, 1);
  assert.equal(cache.stats.uploads, 1);
  assert.equal(cache.stats.uploadedBytes, gl.uploads[0].bytes);
  assert.equal(cache.stats.tileCount, 1);
});

test("le cache GPU invalide une texture lorsque la révision du terrain change", () => {
  const values = Int16Array.from({ length: 12 * 8 }, (_, index) => index);
  const store = createTerrainTileStore({ width: 12, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const gl = createFakeTerrainGL();
  const cache = createTerrainWebGLTileCache(gl, { maxTiles: 8, maxBytes: 4096 });
  const tile = store.getTileAtLevel(0, 1, 0);
  const oldEntry = cache.get(tile, store);
  store.setElevation(15, 67.5, 3000);
  const refreshedTile = store.getTileAtLevel(0, 1, 0);
  const newEntry = cache.get(refreshedTile, store);
  assert.notEqual(newEntry.key, oldEntry.key);
  assert.notEqual(newEntry.texture, oldEntry.texture);
  assert.ok(gl.deleted.includes(oldEntry.texture.id));
});

test("le cache GPU refuse une texture qui dépasse les limites matérielles", () => {
  const values = new Int16Array(12 * 8);
  const store = createTerrainTileStore({ width: 12, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const gl = createFakeTerrainGL(3);
  const cache = createTerrainWebGLTileCache(gl, { maxTiles: 8, maxBytes: 4096 });
  assert.equal(cache.get(store.getTileAtLevel(0, 0, 0), store), null);
  assert.equal(cache.size, 0);
  assert.equal(gl.uploads.length, 0);
});


test("le LOD GPU choisit le niveau parent selon la densité d'échantillons à l'écran", () => {
  const store = { width: 21600 };
  assert.equal(selectTerrainTileLevel(store, { zoom: 1 }, 960), 4);
  assert.equal(selectTerrainTileLevel(store, { zoom: 8 }, 960), 1);
  assert.equal(selectTerrainTileLevel(store, { zoom: 32 }, 960), 0);
});

test("le batch GPU regroupe plusieurs rectangles d'une tuile en quads", () => {
  const rects = [
    { x: 0, y: 0, width: 50, height: 40, u0: 0, u1: 0.5, v0: 0, v1: 1 },
    { x: 50, y: 0, width: 50, height: 40, u0: 0.5, u1: 1, v0: 0, v1: 1 }
  ];
  const vertices = buildTerrainTileBatchVertices(rects, 100, 40);
  assert.equal(vertices.length, 48);
  assert.deepEqual(Array.from(vertices.slice(0, 4)), [-1, 1, 0, 0]);
  assert.deepEqual(Array.from(vertices.slice(20, 24)), [0, -1, 0.5, 1]);
  assert.equal(buildTerrainTileBatchVertices([{ x: -10, y: 0, width: 20, height: 20, u0: 0, u1: 1, v0: 0, v1: 1 }], 100, 100).length, 24);
  assert.equal(buildTerrainTileBatchVertices(rects, 0, 40).length, 0);
});

test("la transition LOD GPU est progressive et bornée", () => {
  assert.equal(getTerrainTileTransitionOpacity(-1), 0);
  assert.equal(getTerrainTileTransitionOpacity(0), 0);
  assert.equal(getTerrainTileTransitionOpacity(0.25), 0.25);
  assert.equal(getTerrainTileTransitionOpacity(1), 1);
  assert.equal(getTerrainTileTransitionOpacity(2), 1);
  assert.equal(getTerrainTileTransitionOpacity(Number.NaN), 1);
});

test("le préchargement GPU sélectionne des tuiles voisines sans dupliquer le viewport", () => {
  const width = 64, height = 32, tileSize = 4;
  const values = new Int16Array(width * height);
  const store = createTerrainTileStore({ width, height, values }, { tileSize, maxTiles: 256 });
  const viewport = { centerLongitude: 0, centerLatitude: 0, zoom: 2 };
  const visible = collectTerrainViewportTiles(store, viewport, 800, 400, 0);
  const predictive = collectTerrainPredictiveTiles(store, viewport, 800, 400, 0, 8);
  const visibleIds = new Set(visible.map(({ tile }) => `${tile.level}/${tile.x}/${tile.y}`));
  assert.ok(predictive.length > 0);
  assert.ok(predictive.length <= 8);
  for (const { tile } of predictive) {
    assert.equal(visibleIds.has(`${tile.level}/${tile.x}/${tile.y}`), false);
  }
  assert.equal(collectTerrainPredictiveTiles(store, viewport, 800, 400, 0, 0).length, 0);
});

test("la collecte GPU ne matérialise que les tuiles qui croisent le viewport", () => {
  const values = new Int16Array(12 * 8);
  const store = createTerrainTileStore({ width: 12, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const visible = collectTerrainViewportTiles(store,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 }, 360, 180, 0);
  assert.equal(visible.length, 6);
  assert.deepEqual(visible.map(({ tile }) => `${tile.x}/${tile.y}`).sort(),
    ["0/0", "0/1", "1/0", "1/1", "2/0", "2/1"]);
  assert.ok(visible.every(({ rects }) => rects.length > 0));
});

test("la collecte GPU conserve les tuiles visibles au franchissement de l'antiméridien", () => {
  const values = new Int16Array(12 * 8);
  const store = createTerrainTileStore({ width: 12, height: 8, values }, { tileSize: 4, maxTiles: 40 });
  const visible = collectTerrainViewportTiles(store,
    { zoom: 2, centerLongitude: 179, centerLatitude: 0 }, 180, 90, 0);
  assert.ok(visible.some(({ tile }) => tile.x === 0));
  assert.ok(visible.every(({ rects }) => rects.length > 0));
});
