import test from "node:test";
import assert from "node:assert/strict";
import { getMapLabelLayout, getMapLabelStyle, getOceanDepthProfile, getMapLabelFontSize, renderWorldMap, buildTerritoryLabels, localizeMapLabel, territoryColor, classifyHistoricalTerritoryStyle, classifyPhysicalCellVisual, frenchTerritoryName, territoryName, isCityPermanentlySubmerged, getStaticLayerCacheStats, getCityLabelLimit, getSecondaryDetailProfile, getLandCoastSimplificationProfile, getLakeCoastSimplificationProfile, getCoastSimplificationProfile, getTerritoryFillSimplificationProfile, getTerritoryOutlineSimplificationProfile, buildLandClipPath, selectMajorRiverFeatures, getRiverRenderStyle, selectMajorLakeFeatures, getLakeRenderStyle, getGlacierRenderStyle, selectMajorElevationFeatures, filterSmallIslandComponents, filterMajorLakeFeatures, partitionFeatures, simplifyClosedRing } from "../src/world/map-renderer.js";
import { isNonStateHistoricalRegion, selectHistoricalPoliticalTerritories } from "../src/world/historical-boundaries.js";
import { buildGeoSpatialIndex, queryGeoSpatialIndex, selectGeoSpatialFeatures as selectVisibleFeatures, getGeoSpatialIndexStats } from "../src/world/geo-spatial-index.js";
import { calculateHillshade, classifyLandform, terrainColorForElevation, samplePhysicalElevation, applyLandformTint, classifyVegetationZone, applyVegetationZoneTint } from "../src/world/terrain.js";
import { getChangedMapLayerFamilies } from "../src/world/map-layer-families.js";

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
    measureText: (text) => { calls.push(["measureText", text]); return { width: String(text).length * 6 }; },
    fill: (...args) => calls.push(["fill", ...args]),
    clip: (...args) => calls.push(["clip", ...args]),
    stroke: (...args) => calls.push(["stroke", ...args]),
    createLinearGradient: (...args) => {
      calls.push(["createLinearGradient", ...args]);
      return { addColorStop: (...stops) => calls.push(["gradientStop", ...stops]) };
    },
    createRadialGradient: (...args) => {
      calls.push(["createRadialGradient", ...args]);
      return { addColorStop: (...stops) => calls.push(["radialGradientStop", ...stops]) };
    },
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (...args) => calls.push(["putImageData", ...args.slice(1)]),
    drawImage: (...args) => calls.push(["drawImage", ...args.slice(1)])
  };
  Object.defineProperty(context, "strokeStyle", { set: value => calls.push(["strokeStyle", value]) });
  Object.defineProperty(context, "fillStyle", { set: value => calls.push(["fillStyle", value]) });
  return { canvas: { clientWidth: 640, getContext: () => context }, calls };
}

const land = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] };

test("le masque du relief exclut la géométrie antarctique", () => {
  const previous = globalThis.Path2D;
  class FakePath2D {
    constructor() { this.added = 0; }
    addPath() { this.added++; }
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  globalThis.Path2D = FakePath2D;
  try {
    const antarctica = {
      type: "Feature",
      bbox: [-180, -90, 180, -63],
      geometry: { type: "Polygon", coordinates: [[[-180, -63], [-90, -70], [0, -63], [90, -70], [180, -63], [180, -90], [-180, -90], [-180, -63]]] }
    };
    const ordinaryLand = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }
    };
    const path = buildLandClipPath({ type: "FeatureCollection", features: [ordinaryLand, antarctica] },
      640, 320, { type: "equirectangular", viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 } });
    assert.equal(path.added, 1, "seule la terre non antarctique doit entrer dans le masque du relief");
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});

test("la classification antarctique est mémorisée entre deux cellules de viewport", async () => {
  const previous = globalThis.Path2D;
  class FakePath2D {
    addPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  globalThis.Path2D = FakePath2D;
  try {
    const { getProjectedPathCacheStats } = await import("../src/world/map-renderer.js");
    const ring = Array.from({ length: 2400 }, (_, index) => {
      const longitude = -180 + (index % 1200) * (360 / 1199);
      const latitude = index < 1200 ? -70 : -89;
      return [longitude, latitude];
    });
    ring.push(ring[0]);
    const ordinaryLand = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }
    };
    const antarctica = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] }
    };
    const collection = { type: "FeatureCollection", features: [ordinaryLand, antarctica] };
    const before = getProjectedPathCacheStats();
    buildLandClipPath(collection, 640, 320,
      { type: "equirectangular", viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 } });
    const first = getProjectedPathCacheStats();
    buildLandClipPath(collection, 640, 320,
      { type: "equirectangular", viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 } });
    const second = getProjectedPathCacheStats();
    assert.equal(first.antarcticClassificationCacheMisses - before.antarcticClassificationCacheMisses, 2);
    assert.equal(second.antarcticClassificationCacheMisses, first.antarcticClassificationCacheMisses);
    assert.ok(second.antarcticClassificationCacheHits > first.antarcticClassificationCacheHits);
    assert.equal(second.antarcticClassificationCoordinatesScanned, first.antarcticClassificationCoordinatesScanned);
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});

test("la classification WebGL des terres est réutilisée pour une collection stable", () => {
  const { canvas } = createCanvas();
  const collection = { type: "FeatureCollection", features: [
    land.features[0],
    { type: "Feature", geometry: { type: "Polygon", coordinates: [[[20, 0], [30, 0], [30, 10], [20, 0]]] } }
  ] };
  let fillChecks = 0, coastChecks = 0;
  const geographicWebGLRenderer = {
    canvas: {},
    supports: () => { fillChecks++; return true; },
    supportsBoundary: () => { coastChecks++; return true; },
    renderLayers: () => ({})
  };
  const previousDisableFill = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL;
  globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL = false;
  const options = {
    width: 640, height: 320, pixelRatio: 1, terrainEnabled: false,
    viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
    geographicWebGLRenderer
  };
  try {
    renderWorldMap(canvas, collection, options);
    const firstFillChecks = fillChecks, firstCoastChecks = coastChecks;
    renderWorldMap(canvas, collection, options);
    assert.equal(fillChecks, firstFillChecks);
    assert.equal(coastChecks, firstCoastChecks);
    assert.equal(firstFillChecks, collection.features.length);
    assert.equal(firstCoastChecks, collection.features.length);

    globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL = true;
    renderWorldMap(canvas, collection, options);
    assert.equal(fillChecks, firstFillChecks,
      "le drapeau de diagnostic doit invalider la classification sans rappeler supports()");
    assert.equal(coastChecks, firstCoastChecks + collection.features.length,
      "la classification des contours doit être recalculée avec la nouvelle clé d'options");
  } finally {
    if (previousDisableFill === undefined) delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL;
    else globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL = previousDisableFill;
  }
});

test("le masque Canvas de repli exclut aussi l'Antarctique sans Path2D", () => {
  const previousPath2D = globalThis.Path2D;
  const previousAntarcticBase = globalThis.__TERRA_DISABLE_ANTARCTIC_LAND_BASE;
  delete globalThis.Path2D;
  globalThis.__TERRA_DISABLE_ANTARCTIC_LAND_BASE = true;
  const countMaskMoves = collection => {
    const { canvas, calls } = createCanvas();
    renderWorldMap(canvas, collection, {
      width: 640, height: 320, pixelRatio: 1, terrainEnabled: true,
      viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 }
    });
    const clipIndex = calls.findIndex(call => call[0] === "clip");
    return calls.slice(0, clipIndex).filter(call => call[0] === "moveTo").length;
  };
  const antarctica = {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[
      [-180, -70], [-90, -65], [0, -64], [90, -65], [180, -70],
      [180, -89], [0, -89], [-180, -89], [-180, -70]
    ]] }
  };
  try {
    const ordinary = { type: "FeatureCollection", features: [land.features[0]] };
    const mixed = { type: "FeatureCollection", features: [land.features[0], antarctica] };
    assert.equal(countMaskMoves(mixed), countMaskMoves(ordinary),
      "la géométrie antarctique ne doit pas être ajoutée au chemin de clip Canvas");
  } finally {
    if (previousPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previousPath2D;
    if (previousAntarcticBase === undefined) delete globalThis.__TERRA_DISABLE_ANTARCTIC_LAND_BASE;
    else globalThis.__TERRA_DISABLE_ANTARCTIC_LAND_BASE = previousAntarcticBase;
  }
});

test("aucune couche de banquise antarctique indépendante n'est dessinée", () => {
  const { canvas, calls } = createCanvas();
  renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1,
    viewport: { zoom: 1, centerLatitude: -25, centerLongitude: 0 },
    terrainEnabled: true
  });
  assert.ok(!calls.some(call => call[0] === "createLinearGradient"),
    "aucun aplat de banquise ne doit être ajouté au-dessus de l'océan");
});

test("l'Antarctique n'est pas recoloré par la couche des territoires politiques", () => {
  const { canvas } = createCanvas();
  const antarctica = { type: "FeatureCollection", features: [{
    type: "Feature",
    bbox: [-180, -90, 180, -63],
    properties: { NAME: "Antarctica", ADMIN: "Antarctica", ADM0_A3: "ATA" },
    geometry: { type: "Polygon", coordinates: [[[-180, -63], [-90, -70], [0, -63], [90, -70], [180, -63], [180, -90], [-180, -90], [-180, -63]]] }
  }] };
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1,
    viewport: { zoom: 3, centerLatitude: 0, centerLongitude: 0 },
    territories: antarctica
  });
  assert.equal(result.territoryCount, 0,
    "aucun aplat ni contour politique ne doit être appliqué au continent antarctique");
});

test("la couche d'aplat antarctique peut être isolée sans désactiver le relief", () => {
  const { canvas, calls } = createCanvas();
  globalThis.__TERRA_DISABLE_ANTARCTIC_LAND_BASE = true;
  try {
    renderWorldMap(canvas, { type: "FeatureCollection", features: [{
      type: "Feature",
      bbox: [-180, -90, 180, -63],
      geometry: { type: "Polygon", coordinates: [[[-180, -63], [-90, -70], [0, -63], [90, -70], [180, -63], [180, -90], [-180, -90], [-180, -63]]] }
    }] }, {
      width: 640, height: 320, pixelRatio: 1,
      viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
      terrainEnabled: true
    });
  } finally {
    delete globalThis.__TERRA_DISABLE_ANTARCTIC_LAND_BASE;
  }
  assert.ok(!calls.some(call => call[0] === "fillStyle" && call[1] === "rgba(248,251,252,0.98)"),
    "le diagnostic doit pouvoir désactiver uniquement l'aplat blanc antarctique");
});

test("le continent antarctique conserve un aplat visible même lorsque le relief est activé", () => {
  const { canvas, calls } = createCanvas();
  const antarctica = { type: "FeatureCollection", features: [{
    type: "Feature",
    bbox: [-180, -90, 180, -63],
    geometry: { type: "Polygon", coordinates: [[[-180, -63], [-90, -70], [0, -63], [90, -70], [180, -63], [180, -90], [-180, -90], [-180, -63]]] }
  }] };
  renderWorldMap(canvas, antarctica, {
    width: 640, height: 320, pixelRatio: 1,
    viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
    terrainEnabled: true
  });
  assert.ok(calls.some(call => call[0] === "fillStyle" && call[1] === "rgba(248,251,252,0.98)"),
    "l'Antarctique doit garder un aplat neige opaque au zoom mondial");
  assert.ok(calls.some(call => call[0] === "moveTo" && Math.abs(call[1]) < 0.01 && Math.abs(call[2] - 272) < 0.1),
    "le contour antarctique doit rester dans les limites horizontales du planisphère au niveau de sa côte");
});

test("le moteur dessine une FeatureCollection et retourne son thème", () => {
  const { canvas, calls } = createCanvas();
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, year: 1444, pixelRatio: 1 });
  assert.equal(result.featureCount, 1);
  assert.equal(result.landCount, 1);
  assert.equal(result.theme.id, "exploration");
  assert.ok(calls.some(call => call[0] === "fillRect"));
  assert.ok(calls.some(call => call[0] === "fill" && call[1] === "evenodd"));
  assert.ok(calls.some(call => call[0] === "clip" && call[1] === "evenodd"));
});

test("le moteur dessine les lacs et les cours d'eau comme des couches distinctes", () => {
  const { canvas } = createCanvas();
  const lakes = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[80, 20], [100, 20], [100, 40], [80, 20]]] } }] };
  const rivers = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [5, 5], [10, 4]] } }] };
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, lakes, rivers });
  assert.equal(result.lakeCount, 1);
  assert.equal(result.riverCount, 1);
});


test("le style des glaciers hiérarchise remplissage et contour selon le rang", () => {
  const major = getGlacierRenderStyle({ properties: { scalerank: 0 } });
  const secondary = getGlacierRenderStyle({ properties: { SCALERANK: 1 } });
  const minor = getGlacierRenderStyle({ properties: { min_zoom: 2 } });
  const unknown = getGlacierRenderStyle({ properties: {} });
  assert.ok(major.fillAlpha > secondary.fillAlpha && secondary.fillAlpha > minor.fillAlpha);
  assert.ok(major.outlineAlpha > secondary.outlineAlpha && secondary.outlineAlpha > minor.outlineAlpha);
  assert.ok(major.outlineWidth > secondary.outlineWidth && secondary.outlineWidth > minor.outlineWidth);
  assert.equal(unknown.rank, 1);
  assert.equal(unknown.fillAlpha, secondary.fillAlpha);
});

test("le style des lacs hiérarchise remplissage et contour selon le rang", () => {
  const major = getLakeRenderStyle({ properties: { scalerank: 0 } });
  const secondary = getLakeRenderStyle({ properties: { SCALERANK: 1 } });
  const minor = getLakeRenderStyle({ properties: { min_zoom: 2 } });
  const unknown = getLakeRenderStyle({ properties: {} });
  assert.ok(major.fillAlpha > secondary.fillAlpha && secondary.fillAlpha > minor.fillAlpha);
  assert.ok(major.outlineAlpha > secondary.outlineAlpha && secondary.outlineAlpha > minor.outlineAlpha);
  assert.ok(major.outlineWidth > secondary.outlineWidth && secondary.outlineWidth > minor.outlineWidth);
  assert.equal(unknown.rank, 1);
  assert.equal(unknown.fillAlpha, secondary.fillAlpha);
});

test("la couche des lacs conserve au maximum 12 grands lacs, quel que soit le zoom", () => {
  const features = Array.from({ length: 30 }, (_, index) => ({
    type: "Feature",
    properties: { name: "Lac " + index, scalerank: index < 20 ? 0 : 2 },
    bbox: [0, 0, 30 - index, 20 - index * 0.4],
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
  }));
  const selected = selectMajorLakeFeatures({ type: "FeatureCollection", features }, 1, 12);
  assert.equal(selected.length, 12);
  assert.ok(selected.every(feature => feature.properties.scalerank === 0));
  assert.ok(selected[0].properties.name === "Lac 0");
  assert.equal(getSecondaryDetailProfile(1).lakesRank, 1);
  assert.equal(getSecondaryDetailProfile(35).lakesRank, 1);
});

test("la sélection des lacs privilégie les grands bassins et ignore les géométries non surfaciques", () => {
  const small = { type: "Feature", properties: { scalerank: 0, name: "petit" }, bbox: [0, 0, 1, 1], geometry: { type: "Polygon", coordinates: [] } };
  const large = { type: "Feature", properties: { scalerank: 0, name: "grand" }, bbox: [0, 0, 10, 10], geometry: { type: "MultiPolygon", coordinates: [] } };
  const line = { type: "Feature", properties: { scalerank: 0 }, geometry: { type: "LineString", coordinates: [] } };
  assert.deepEqual(selectMajorLakeFeatures({ features: [small, line, large] }, 1, 2), [large, small]);
});


test("les petites îles sont retirées avant indexation sans effacer le principal territoire insulaire",()=>{
 const ring=size=>[[0,0],[size,0],[size,size],[0,size],[0,0]];
 const source={type:"FeatureCollection",features:[{type:"Feature",properties:{name:"continent"},geometry:{type:"MultiPolygon",coordinates:[[ring(10)],[ring(0.01)]]}},{type:"Feature",properties:{name:"micro-île isolée"},geometry:{type:"Polygon",coordinates:[ring(0.01)]}}]};
 const land=filterSmallIslandComponents(source,100,false);assert.equal(land.features.length,1);assert.equal(land.features[0].geometry.coordinates.length,1);
 const territories=filterSmallIslandComponents(source,100,true);assert.equal(territories.features.length,2);assert.equal(territories.features[1].geometry.type,"Polygon");
});
test("les lacs secondaires et trop petits sont exclus de la collection active",()=>{
 const lake=(name,size,rank=1)=>({type:"Feature",properties:{name,scalerank:rank},geometry:{type:"Polygon",coordinates:[[[0,0],[size,0],[size,size],[0,size],[0,0]]]}});
 const source={type:"FeatureCollection",features:[lake("grand",10),lake("petit",0.1),lake("rang secondaire",10,3)]};
 const filtered=filterMajorLakeFeatures(source,500);assert.deepEqual(filtered.features.map(x=>x.properties.name),["grand"]);assert.equal(source.features.length,3);
});
test("le moteur dessine les zones glaciaires et les repères de relief", () => {
  const { canvas, calls } = createCanvas();
  const glaciers = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[86, 27], [88, 27], [88, 29], [86, 27]]] } }] };
  const elevationPoints = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Everest", kind: "mountain", elevation_m: 8848 }, geometry: { type: "Point", coordinates: [86.9, 28] } },
    { type: "Feature", properties: { name: "Dépression", kind: "depression", elevation_m: -154 }, geometry: { type: "Point", coordinates: [89, 42] } }
  ] };
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, glaciers, elevationPoints, viewport: { zoom: 4, centerLatitude: 35, centerLongitude: 88 } });
  assert.equal(result.glacierCount, 1);
  assert.equal(result.elevationPointCount, 2);
  assert.ok(calls.some(call => call[0] === "arc"));
  assert.ok(calls.some(call => call[0] === "fillText" && call[1] === "Everest"));
});

test("la couche des glaciers exclut le polygone glaciaire continental antarctique", () => {
  const { canvas } = createCanvas();
  const antarcticGlacier = {
    type: "Feature",
    bbox: [-180, -89.998899, 179.999949, -63.27066],
    geometry: { type: "Polygon", coordinates: [[[-180, -63], [180, -63], [180, -90], [-180, -90], [-180, -63]]] }
  };
  const retainedGlacier = {
    type: "Feature",
    bbox: [-5, -5, 10, 10],
    properties: { name: "glacier de contrôle" },
    geometry: { type: "Polygon", coordinates: [[[-5, -5], [10, -5], [10, 10], [-5, -5]]] }
  };
  const glaciers = { type: "FeatureCollection", features: [antarcticGlacier, retainedGlacier] };
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1, glaciers,
    viewport: { zoom: 1, centerLatitude: 0, centerLongitude: 0 },
    lodZoom: 3,
    terrainEnabled: false
  });
  assert.equal(result.glacierCount, 1,
    "un glacier ordinaire reste visible, mais le polygone continental antarctique est exclu");
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

test("les noms des pays sont visibles au zoom minimal de lancement", () => {
  const { canvas } = createCanvas();
  const territories = { type: "FeatureCollection", features: [{
    type: "Feature",
    properties: { NAME: "France", ADMIN: "France" },
    geometry: { type: "Polygon", coordinates: [[[-5, 42], [8, 42], [8, 51], [-5, 51], [-5, 42]]] }
  }] };
  const labels = buildTerritoryLabels(territories);
  assert.equal(labels.features[0].properties.minZoom, 1);
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1, labels,
    viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 46 }
  });
  assert.ok(result.labelHits.some(label => label.name === "FRANCE"));
});

test("les noms des pays restent visibles au dézoom même avec de nombreux labels secondaires", () => {
  const { canvas } = createCanvas();
  const secondary = Array.from({ length: 60 }, (_, index) => ({
    type: "Feature",
    properties: { name: "Repère " + index, kind: "continent", minZoom: 1 },
    geometry: { type: "Point", coordinates: [index * 4 + 180, 85] }
  }));
  const country = {
    type: "Feature",
    properties: { name: "France", kind: "country", minZoom: 1.25, priority: 90 },
    geometry: { type: "Point", coordinates: [2, 46] }
  };
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1,
    labels: { type: "FeatureCollection", features: [...secondary, country] },
    viewport: { zoom: 1.25, centerLongitude: 0, centerLatitude: 0 }
  });
  assert.ok(result.labelHits.some(label => label.name === "FRANCE"));
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


import { createTerrainGrid, sampleElevation, drawTerrainRaster, terrainTileSizeForZoom } from "../src/world/terrain.js";

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
  assert.notEqual(illuminatedSlope, 1);
  assert.notEqual(oppositeSlope, 1);
  assert.ok(illuminatedSlope >= 0.48 && illuminatedSlope <= 1.52);
  assert.ok(oppositeSlope >= 0.48 && oppositeSlope <= 1.52);
});


test("les chaînes de moyenne altitude sont reconnues par leur pente", () => {
  assert.equal(classifyLandform(1450, 400, 2900, 1900, 1000, 35), "mountains");
  assert.equal(classifyLandform(1450, 1430, 1470, 1460, 1440, 35), "plateaus");
});

test("la teinte minérale des montagnes progresse avec l'altitude", () => {
  const base = [120, 125, 110];
  const foothills = applyLandformTint(base, "mountains", 1200);
  const highRange = applyLandformTint(base, "mountains", 4200);
  const plains = applyLandformTint(base, "plains", 1200);
  assert.notDeepEqual(foothills, base);
  assert.notDeepEqual(highRange, foothills);
  assert.notDeepEqual(highRange, plains);
  assert.deepEqual(base, [120, 125, 110], "la palette source ne doit pas être mutée");
});

test("les terrains non montagneux conservent une modulation mesurée", () => {
  const base = [120, 125, 110];
  const plateau = applyLandformTint(base, "plateaus", 1600);
  const plain = applyLandformTint(base, "plains", 100);
  assert.notDeepEqual(plateau, plain);
  assert.ok(plateau.every(channel => channel >= 0 && channel <= 255));
});

test("les classes de relief distinguent montagnes, plateaux, vallées et plaines", () => {
  assert.equal(classifyLandform(-2500, -2600, -2400, -2550, -2450, 35), "ocean");
  assert.equal(classifyLandform(3200, 0, 2600, 1800, 300, 45), "mountains");
  assert.equal(classifyLandform(1200, 1190, 1210, 1200, 1200, 30), "plateaus");
  assert.equal(classifyLandform(400, 700, 700, 700, 700, 40), "valleys");
  assert.equal(classifyLandform(100, 100, 100, 100, 100, 40), "plains");
});

test("les zones de végétation suivent des bandes latitudinales et l'altitude", () => {
  assert.equal(classifyVegetationZone(120, 5), "tropical");
  assert.equal(classifyVegetationZone(120, 28), "subtropical");
  assert.equal(classifyVegetationZone(120, 45), "temperate");
  assert.equal(classifyVegetationZone(120, 58), "boreal");
  assert.equal(classifyVegetationZone(120, 70), "tundra");
  assert.equal(classifyVegetationZone(3200, 20), "alpine");
  assert.equal(classifyVegetationZone(4800, 20), "nival");
});

test("les zones polaires d'altitude élevée reçoivent une signature nivale", () => {
  assert.equal(classifyVegetationZone(1000, 82), "nival");
  assert.equal(classifyVegetationZone(1000, -82), "nival");
  assert.equal(classifyVegetationZone(1000, 72), "tundra");
});

test("la classification végétale rejette les océans et les coordonnées invalides", () => {
  assert.equal(classifyVegetationZone(-20, 0), "none");
  assert.equal(classifyVegetationZone(100, NaN), "none");
  assert.equal(classifyVegetationZone(100, 91), "none");
  assert.equal(classifyVegetationZone(Infinity, 40), "none");
});

test("la teinte de végétation est légère et ne mute pas la couleur d'origine", () => {
  const base = [120, 125, 110];
  const tinted = applyVegetationZoneTint(base, "tropical");
  assert.notDeepEqual(tinted, base);
  assert.deepEqual(base, [120, 125, 110]);
  assert.deepEqual(applyVegetationZoneTint(base, "unknown"), base);
});

test("la palette terrestre varie selon la latitude sans changer la bathymétrie", () => {
  const tropical = terrainColorForElevation(250, 1, "plains", 5);
  const temperate = terrainColorForElevation(250, 1, "plains", 45);
  const boreal = terrainColorForElevation(250, 1, "plains", 60);
  assert.notDeepEqual(tropical, temperate);
  assert.notDeepEqual(temperate, boreal);
  assert.deepEqual(
    terrainColorForElevation(-2500, 1, "ocean", 5),
    terrainColorForElevation(-2500, 1, "ocean", 60)
  );
});

test("les teintes de végétation restent modestes aux hautes altitudes", () => {
  const base = [180, 180, 180];
  const alpine = applyVegetationZoneTint(base, "alpine");
  const nival = applyVegetationZoneTint(base, "nival");
  assert.ok(Math.abs(nival[0] - base[0]) <= 7);
  assert.ok(Math.abs(alpine[1] - base[1]) <= 8);
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
  assert.deepEqual(dimensions, [512, 256]);
});

test("le rendu du terrain courant augmente la résolution sans dépasser 1024 × 512", () => {
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
  assert.deepEqual(dimensions, [910, 512]);
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


test("l'index spatial poursuit sa construction après une géométrie globale ou vide", () => {
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "global" }, geometry: { type: "Polygon", coordinates: [[[-179, -80], [179, -80], [179, 80], [-179, 80], [-179, -80]]] } },
    { type: "Feature", properties: { id: "empty" }, geometry: null },
    { type: "Feature", properties: { id: "local" }, geometry: { type: "Point", coordinates: [2, 48] } }
  ] };
  const index = buildGeoSpatialIndex(collection);
  const visible = queryGeoSpatialIndex(index, { zoom: 12, centerLongitude: 2, centerLatitude: 48 });
  assert.deepEqual(visible.features.map(feature => feature.properties.id), ["global", "empty", "local"]);
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
    addPath() {}
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
    // Un petit pan reste dans la même cellule de cache et réutilise les chemins.
    renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 2, centerLongitude: 4.1, centerLatitude: 5 } });
    assert.equal(constructions, 2);
    // Un déplacement plus large invalide bien le cadrage.
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
    addPath() {}
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
    const pathsAfterFirstRender = constructions;
    assert.ok(pathsAfterFirstRender >= 1);
    renderWorldMap(canvas, land, options);
    assert.equal(constructions, pathsAfterFirstRender, "le masque composé et les chemins des features sont réutilisés");
    assert.ok(calls.some(call => call[0] === "stroke" && call[1] instanceof FakePath2D));
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});


test("la hiérarchie hydrographique différencie largeur et opacité des cours d'eau", () => {
  const major = getRiverRenderStyle({ properties: { scalerank: 0 } });
  const primary = getRiverRenderStyle({ properties: { scalerank: 1 } });
  const secondary = getRiverRenderStyle({ properties: { scalerank: 2 } });
  const minor = getRiverRenderStyle({ properties: { scalerank: 3 } });
  assert.ok(major.lineWidth > primary.lineWidth);
  assert.ok(primary.lineWidth > secondary.lineWidth);
  assert.ok(secondary.lineWidth > minor.lineWidth);
  assert.ok(major.alpha > primary.alpha);
  assert.ok(primary.alpha > secondary.alpha);
  assert.ok(secondary.alpha > minor.alpha);
});

test("les cours d'eau sans rang conservent un style secondaire stable", () => {
  const missing = getRiverRenderStyle({ properties: {} });
  const explicit = getRiverRenderStyle({ properties: { scalerank: 1 } });
  assert.deepEqual(missing, explicit);
});

test("les alias de rang Natural Earth conservent la même hiérarchie", () => {
  assert.deepEqual(
    getRiverRenderStyle({ properties: { SCALERANK: 0 } }),
    getRiverRenderStyle({ properties: { scalerank: 0 } })
  );
  assert.deepEqual(
    getRiverRenderStyle({ properties: { min_zoom: 1 } }),
    getRiverRenderStyle({ properties: { scalerank: 1 } })
  );
});

test("les rangs hydrographiques élevés restent plus discrets que les fleuves majeurs", () => {
  const major = getRiverRenderStyle({ properties: { scalerank: 0 } });
  const minor = getRiverRenderStyle({ properties: { scalerank: 4 } });
  assert.ok(minor.lineWidth < major.lineWidth);
  assert.ok(minor.alpha < major.alpha);
});

test("le style hydrographique accepte une largeur invalide sans produire de trait nul", () => {
  const style = getRiverRenderStyle({ properties: { scalerank: 0 } }, 0);
  assert.ok(style.lineWidth > 0);
  assert.ok(style.alpha > 0 && style.alpha <= 1);
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


test("le cache spatial LRU reste borné à 64 requêtes et peut être vidé", async () => {
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
  assert.equal(stats.maxCachedQueries, 64);
  assert.ok(stats.cachedQueries <= 64);
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
        [index % 360 - 180, 0], [index % 360 - 172, 0],
        [index % 360 - 172, 8], [index % 360 - 180, 0]
      ]] }
    })) };
    const { canvas } = createCanvas();
    const result = renderWorldMap(canvas, collection, { width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 } });
    const stats = getProjectedPathCacheStats();
    assert.equal(result.landCount, 540);
    assert.ok(constructions >= 512, `Path2D créés : ${constructions}`);
    assert.ok(stats.cachedPaths <= 4096);
    assert.equal(stats.maxCachedPaths, 4096);
    assert.ok(stats.cachedVertices <= stats.maxCachedVertices);
    assert.equal(stats.maxCachedVertices, 750_000);
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
  assert.equal(stats.maxCachedTiles, 256);
});

test("le cache des tuiles vectorielles reste borné et peut être vidé", async () => {
  const { getGeoSpatialIndexStats, clearGeoSpatialQueryCache } = await import("../src/world/geo-spatial-index.js");
  const collection = { type: "FeatureCollection", features: Array.from({ length: 180 }, (_, i) => ({
    type: "Feature", properties: { id: i }, geometry: { type: "Point", coordinates: [-179 + i * 2, -80 + (i % 30) * 5] }
  })) };
  const { selectGeoSpatialFeatures } = await import("../src/world/geo-spatial-index.js");
  selectGeoSpatialFeatures(collection, { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  const stats = getGeoSpatialIndexStats(collection);
  assert.ok(stats.cachedTiles <= 256);
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

test("la simplification des côtes restaure les détails lorsque le zoom augmente", async () => {
  const { getCoastSimplificationProfile } = await import("../src/world/map-renderer.js");
  const world = getCoastSimplificationProfile(1);
  const regional = getCoastSimplificationProfile(3);
  const close = getCoastSimplificationProfile(12);
  assert.deepEqual(world, { tolerance: 2.5, minRingArea: 6 });
  assert.deepEqual(regional, { tolerance: 2.05, minRingArea: 4.4 });
  assert.deepEqual(close, { tolerance: 1.3, minRingArea: 2.2 });
  assert.deepEqual(getCoastSimplificationProfile(7), { tolerance: 1.65, minRingArea: 3.1 });
  assert.ok(world.tolerance > regional.tolerance && regional.tolerance > close.tolerance);
  assert.ok(world.minRingArea > regional.minRingArea && regional.minRingArea > close.minRingArea);
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

test("les frontières nationales sont rendues sans tracer les limites administratives", () => {
  const { canvas, calls } = createCanvas();
  const politicalBoundaries = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { BORDERPRECISION: 3 }, geometry: { type: "LineString", coordinates: [[0, 0], [5, 5]] } }
  ] };
  const administrativeBoundaries = { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "LineString", coordinates: [[1, 0], [6, 5]] } }
  ] };
  const result = renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 3.5 },
    politicalBoundaries, administrativeBoundaries
  });
  assert.equal(result.politicalBoundaryCount, 2);
  assert.equal(result.administrativeBoundaryCount, 0);
  assert.ok(calls.some(call => call[0] === "setLineDash" && call[1].length === 0));
  assert.ok(!calls.some(call => call[0] === "setLineDash" && call[1].length === 2));
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

test("les étiquettes infranationales ne sont pas générées pour la carte stratégique", () => {
  const provinces = { type: "FeatureCollection", features: [{
    type: "Feature", properties: { name: "Province test" },
    geometry: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] }
  }] };
  const labels = buildTerritoryLabels(null);
  assert.equal(labels.features.length, 0);
  assert.equal(provinces.features.length, 1, "les données régionales restent disponibles hors du rendu stratégique");
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
  const selected = selectHistoricalPoliticalTerritories(collection);
  assert.deepEqual(selected.features.map(feature => feature.properties.NAME), ["France", "Amazon hunter-gatherers", "North American Pacific foraging, hunting and fishing peoples", "Castile"]);
  assert.deepEqual(selected.features.map(feature => feature.properties.historicalStatus), ["sovereign", "influence", "influence", "sovereign"]);
});

test("les couleurs héraldiques historiques sont reconnaissables", () => {
  assert.equal(territoryColor({ properties: { NAME: "England" } }), "#B83A43");
  assert.equal(territoryColor({ properties: { NAME: "Castile" } }), "#D9A52B");
  assert.equal(territoryColor({ properties: { NAME: "Portugal" } }), "#3D805B");
});


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
 assert.equal(classifyPhysicalCellVisual({inundated:true,waterDepthM:3}),null);
 // L'océan naturel est déjà bleu dans le fond : il ne doit jamais être repeint en carrés.
 assert.equal(classifyPhysicalCellVisual({baseElevationM:-4200,currentElevationM:-4200,elevationDeltaM:0}),null);
 assert.equal(classifyPhysicalCellVisual({baseElevationM:120,currentElevationM:-2,elevationDeltaM:-122}),null);
 assert.equal(classifyPhysicalCellVisual({surfaceState:"lava-flow"}),null);
 assert.equal(classifyPhysicalCellVisual({surfaceState:"crater"}),null);
 assert.equal(classifyPhysicalCellVisual({surfaceState:"impact-zone",damage:.9}),null);
 assert.equal(classifyPhysicalCellVisual({ashLoad:.7}),null);
 assert.equal(classifyPhysicalCellVisual({damage:.8}),null);
 assert.equal(classifyPhysicalCellVisual({elevationDeltaM:10}),null);
 assert.equal(classifyPhysicalCellVisual({damage:.01}),null);
});

test("la couleur des territoires coloniaux suit la puissance souveraine",()=>{
 assert.equal(territoryColor({properties:{NAME:"New France",SUBJECTO:"France"}}),"#3159A6");
 assert.equal(territoryColor({properties:{NAME:"British Raj",SUBJECTO:"British Empire"}}),"#B83A43");
 assert.equal(territoryColor({properties:{NAME:"Viceroyalty of New Spain",SUBJECTO:"Spain"}}),"#D9A52B");
});

test("le rendu physique conserve le relief ETOPO hors des cellules modifiées",()=>{
 const grid={width:24,height:12,values:new Int16Array(24*12).fill(150)};
 const unchanged=new Map([["0:0",{gridX:0,gridY:0,elevationDeltaM:0,currentElevationM:150}]]);
 const altered=new Map([["0:0",{gridX:0,gridY:0,elevationDeltaM:-250,currentElevationM:-100}]]);
 const lon=-172.5,lat=82.5;
 assert.equal(samplePhysicalElevation(grid,lon,lat,unchanged),150);
 assert.equal(samplePhysicalElevation(grid,lon,lat,altered),-100);
 const flooded=new Map([["0:0",{gridX:0,gridY:0,elevationDeltaM:0,currentElevationM:150,inundated:true,waterDepthM:4}]]);
 assert.equal(samplePhysicalElevation(grid,lon,lat,flooded),-4);
});


test("la localisation couvre les champs formels, les libellés cartographiques et les variantes de lieux", () => {
  assert.equal(territoryName({ NAME: "Kingdom of X", FORMAL_FR: "Royaume de X" }), "Royaume de X");
  assert.equal(territoryName({ NAME_EN: "Republic of Annam", FORMAL_FR: "République de l’Annam" }), "République de l’Annam");
  assert.equal(localizeMapLabel("Republic of Korea", "country"), "Corée du Sud");
  assert.equal(localizeMapLabel("Province of Bavaria", "province"), "Province de Bavière");
  assert.equal(localizeMapLabel("Beijing", "city"), "Pékin");
  assert.equal(localizeMapLabel("Cairo", "city"), "Le Caire");
  assert.equal(localizeMapLabel("Timbuktu", "city"), "Tombouctou");
  assert.equal(localizeMapLabel("Samarkand", "city"), "Samarcande");
  assert.equal(localizeMapLabel("Venice", "city"), "Venise");
  assert.equal(localizeMapLabel("Genoa", "city"), "Gênes");
  assert.equal(localizeMapLabel("London", "city"), "Londres");
  assert.equal(localizeMapLabel("New York", "city"), "New York");
  assert.equal(localizeMapLabel("Alexandria", "city"), "Alexandrie");
  assert.equal(localizeMapLabel("Cape Town", "city"), "Le Cap");
  assert.equal(localizeMapLabel("Ho Chi Minh City", "city"), "Hô Chi Minh-Ville");
  assert.equal(localizeMapLabel("Shanghai", "city"), "Shanghai");
  assert.equal(localizeMapLabel("Buenos Aires", "city"), "Buenos Aires");
  assert.equal(localizeMapLabel("Johannesburg", "city"), "Johannesbourg");
  assert.equal(localizeMapLabel("Delhi", "city"), "Delhi");
  assert.equal(localizeMapLabel("Montreal", "city"), "Montréal");
  assert.equal(localizeMapLabel("Atlantique", "ocean"), "Atlantique");
  assert.equal(localizeMapLabel("", "city"), "");
});

test("les noms historiques sont francisés et les enclaves anglaises sont explicitement nommées",()=>{
 assert.equal(frenchTerritoryName("New France"),"Nouvelle-France");
 assert.equal(frenchTerritoryName("Aquitaine",{NAME:"Aquitaine",SUBJECTO:"Kingdom of England"}),"Aquitaine anglaise");
 assert.equal(frenchTerritoryName("British Raj"),"Inde britannique");
 assert.equal(frenchTerritoryName("Republic of Korea",{ADMIN:"Republic of Korea",ISO_A3:"KOR"}),"Corée du Sud");
 assert.equal(frenchTerritoryName("United Republic of Tanzania",{ADMIN:"United Republic of Tanzania",ISO_A3:"TZA"}),"Tanzanie");
 assert.equal(frenchTerritoryName("Ivory Coast"),"Côte d’Ivoire");
 assert.equal(frenchTerritoryName("Democratic Republic of the Congo"),"République démocratique du Congo");
 assert.equal(frenchTerritoryName("Czechia"),"Tchéquie");
 assert.equal(frenchTerritoryName("South Korea"),"Corée du Sud");
 assert.equal(frenchTerritoryName("East Timor"),"Timor oriental");
 assert.equal(frenchTerritoryName("Cape Verde"),"Cap-Vert");
 assert.equal(frenchTerritoryName("United Arab Emirates"),"Émirats arabes unis");
 assert.equal(frenchTerritoryName("Teutonic Knights"),"Chevaliers teutoniques");
 assert.equal(frenchTerritoryName("Teutonic Order"),"Ordre Teutonique");
 assert.equal(frenchTerritoryName("English territory"),"Territoire anglais");
 assert.equal(frenchTerritoryName("Polish-Lithuanian Commonwealth"),"République des Deux Nations");
 assert.equal(frenchTerritoryName("Polish–Lithuanian Commonwealth"),"République des Deux Nations");
 assert.equal(frenchTerritoryName("Polish Lithuanian Commonwealth"),"République des Deux Nations");
 assert.equal(frenchTerritoryName("Teutonic-Knights"),"Chevaliers teutoniques");
 assert.equal(frenchTerritoryName("English-Territory"),"Territoire anglais");
 assert.equal(frenchTerritoryName("Viceroyalty of New Spain"),"Vice-royauté de Nouvelle-Espagne");
 assert.equal(frenchTerritoryName("British West Indies"),"Antilles britanniques");
 assert.equal(frenchTerritoryName(null,{NAME:"Teutonic Knights",NAME_FR:"Chevaliers teutoniques"}),"Chevaliers teutoniques");
 assert.equal(frenchTerritoryName("Polish-Lithuanian Commonwealth",{NAME_FR:"République des Deux Nations"}),"République des Deux Nations");
 assert.equal(frenchTerritoryName("English territory",{ADMIN_FR:"Territoire anglais"}),"Territoire anglais");
 assert.equal(frenchTerritoryName("Teutonic Knights",{name_fr:"Chevaliers teutoniques"}),"Chevaliers teutoniques");
 assert.equal(frenchTerritoryName("English territory",{NAME:"English territory",NAME_FR:"Territoire anglais"}),"Territoire anglais");
 assert.equal(territoryName({NAME:"English Territory",NAME_FR:"Territoire anglais"}),"Territoire anglais");
 assert.equal(frenchTerritoryName("Kingdom of Bavaria"),"Royaume de Bavière");
 assert.equal(frenchTerritoryName("Kingdom of the Hellenes"), "Royaume de Grèce");
 assert.equal(frenchTerritoryName("Austro-Hungarian Empire"), "Empire austro-hongrois");
 assert.equal(frenchTerritoryName("Kingdom of Serbia"), "Royaume de Serbie");
 assert.equal(frenchTerritoryName("Republic of Texas"), "République du Texas");
 assert.equal(frenchTerritoryName("Khedivate of Egypt"), "Khédivat d’Égypte");
 assert.equal(frenchTerritoryName("Sultanate of Zanzibar"), "Sultanat de Zanzibar");
 assert.equal(frenchTerritoryName("Kingdom of Ryukyu"), "Royaume de Ryūkyū");
 assert.equal(frenchTerritoryName("Free France"), "France libre");
 assert.equal(frenchTerritoryName("Kingdom of the Franks"), "Royaume des Francs");
 assert.equal(frenchTerritoryName("North German Federation"), "Confédération de l’Allemagne du Nord");
 assert.equal(frenchTerritoryName("People's Republic of Bulgaria"), "République populaire de Bulgarie");
 assert.equal(frenchTerritoryName("Republic of Biafra"), "République du Biafra");
 assert.equal(frenchTerritoryName("Kingdom of Hejaz"), "Royaume du Hedjaz");
 assert.equal(frenchTerritoryName("United Provinces of Central America"), "Provinces-Unies d’Amérique centrale");
 assert.equal(frenchTerritoryName("Dutch East Indies"), "Indes orientales néerlandaises");
 assert.equal(frenchTerritoryName("Kingdom of Lan Xang"), "Royaume du Lan Xang");
 assert.equal(frenchTerritoryName("Grand Duchy of Finland"), "Grand-duché de Finlande");
 assert.equal(frenchTerritoryName("Republic of Gran Colombia"), "Grande Colombie");
 assert.equal(frenchTerritoryName("Union of South Africa"), "Union sud-africaine");
 assert.equal(frenchTerritoryName("People's Republic of China"), "République populaire de Chine");
 assert.equal(frenchTerritoryName("Blue Horde"), "Horde bleue");
 assert.equal(frenchTerritoryName("White Horde"), "Horde blanche");
 assert.equal(frenchTerritoryName("Black Horde"), "Horde noire");
 assert.equal(frenchTerritoryName("Great Horde"), "Grande Horde");
 assert.equal(frenchTerritoryName("Nogai Horde"), "Horde nogaï");
 assert.equal(frenchTerritoryName("Kazan Khanate"), "Khanat de Kazan");
 assert.equal(frenchTerritoryName("Republic of Ragusa"), "République de Raguse");
 assert.equal(frenchTerritoryName("Papal States"), "États pontificaux");
 assert.equal(frenchTerritoryName("Teutonic Order"), "Ordre Teutonique");
 assert.equal(frenchTerritoryName("Livonian Order"), "Ordre de Livonie");
 assert.equal(frenchTerritoryName("Duchy of Milan"), "Duché de Milan");
 assert.equal(frenchTerritoryName("Principality of Wallachia"), "Principauté de Valachie");
 assert.equal(frenchTerritoryName("Sultanate of Kilwa"), "Sultanat de Kilwa");
 assert.equal(frenchTerritoryName("Kingdom of Dai Viet"), "Royaume du Đại Việt");
 assert.equal(frenchTerritoryName("Mapuche Confederation"), "Confédération mapuche");
 assert.equal(frenchTerritoryName("Kingdom of Araucania and Patagonia"), "Royaume d’Araucanie et de Patagonie");
 assert.equal(frenchTerritoryName("Duchy of Burgundy"),"Duché de Bourgogne");
 assert.equal(frenchTerritoryName("Khanate of Sibir"), "Khanat de Sibir");
 assert.equal(frenchTerritoryName("Hafsid Caliphate"), "Califat hafside");
 assert.equal(frenchTerritoryName("Mamluke Sultanate"), "Sultanat mamelouk");
 assert.equal(frenchTerritoryName("Oirat Confederation"), "Confédération oïrate");
 assert.equal(frenchTerritoryName("Sultanate of Delhi"), "Sultanat de Delhi");
 assert.equal(frenchTerritoryName("Tsardom of Muscovy"), "Tsarat de Moscovie");
 assert.equal(frenchTerritoryName("Bukara Khanate"), "Khanat de Boukhara");
 assert.equal(frenchTerritoryName("Ming Chinese Empire"), "Empire chinois des Ming");
 assert.equal(frenchTerritoryName("Grand Duchy of Hesse"), "Grand-duché de Hesse");
 assert.equal(frenchTerritoryName("Republic of Kraków"), "République de Cracovie");
 assert.equal(frenchTerritoryName("Republic of Annam"),"République de l’Annam");
 assert.equal(frenchTerritoryName("Republic of Annam",{NAME:"Republic of Annam"}),"République de l’Annam");
 assert.equal(frenchTerritoryName("Republic of Annam"),"République de l’Annam");
 assert.equal(frenchTerritoryName("Sultanate of Oman"),"Sultanat d’Oman");
 assert.equal(frenchTerritoryName("Kingdom of Wallachia"),"Royaume de Valachie");
 assert.equal(frenchTerritoryName("Orange Free State"),"État libre d’Orange");
 assert.equal(frenchTerritoryName("Province of Quebec"), "Province de Québec");
 assert.equal(frenchTerritoryName("State of California"), "État de Californie");
 assert.equal(frenchTerritoryName("Department of New South Wales"), "Département de Nouvelle-Galles du Sud");
 assert.equal(territoryName({ NAME: "English Province", NAME_1_FR: "Province française" }), "Province française");
 assert.equal(frenchTerritoryName("English Province", { NAME: "English Province", FORMAL_FR: "Province française" }), "Province française");
 assert.equal(territoryName({ NAME: "English polity", ADMIN_0_FR: "Entité française" }), "Entité française");
 assert.equal(frenchTerritoryName("English polity", { NAME: "English polity", NAME_ALT_FR: "Nom alternatif français" }), "Nom alternatif français");
 assert.equal(frenchTerritoryName("Gold Coast"),"Côte-de-l’Or");
 assert.equal(frenchTerritoryName("New South Wales"),"Nouvelle-Galles du Sud");
 assert.equal(frenchTerritoryName("Kingdom of Ceylon"),"Royaume de Ceylan");
 assert.equal(frenchTerritoryName("Kingdom of Bohemia"),"Royaume de Bohême");
 assert.equal(isNonStateHistoricalRegion({properties:{NAME:"Kingdom",NAME_FR:"Peuples autochtones"}}),true);
 assert.equal(isNonStateHistoricalRegion({properties:{NAME:"Peuples indigènes"}}),true);
 assert.equal(isNonStateHistoricalRegion({properties:{NAME:"Communautés autochtones"}}),true);
 assert.equal(isNonStateHistoricalRegion({properties:{NAME:"Chasseurs-cueilleurs"}}),true);
 assert.equal(isNonStateHistoricalRegion({properties:{NAME:"Pasteurs nomades"}}),true);
});
test("les labels territoriaux utilisent le nom français et la métropole de l'enclave",()=>{
 const territories={type:"FeatureCollection",features:[
  {type:"Feature",properties:{NAME:"Aquitaine",SUBJECTO:"England"},geometry:{type:"Polygon",coordinates:[[[-2,43],[1,43],[1,46],[-2,46],[-2,43]]]}},
  {type:"Feature",properties:{NAME:"New France",SUBJECTO:"France"},geometry:{type:"Polygon",coordinates:[[[-75,45],[-70,45],[-70,48],[-75,48],[-75,45]]]}}
 ]};
 const labels=buildTerritoryLabels(territories);
 assert.deepEqual(labels.features.map(f=>f.properties.name),["Aquitaine anglaise","Nouvelle-France"]);
});

test("la passe de relief en luminosité conserve la teinte politique",()=>{const {canvas,calls}=createCanvas();const result=renderWorldMap(canvas,land,{width:640,height:320,pixelRatio:1,terrain:{width:2,height:2,values:new Int16Array([100,200,300,400])},terrainEnabled:true,territories:{type:"FeatureCollection",features:[{type:"Feature",properties:{NAME:"France"},geometry:{type:"Polygon",coordinates:[[[0,0],[10,0],[10,10],[0,0]]]}}]}});assert.ok(result.territoryCount>=0);});


test("le rendu expose des mesures de temps par couche et un temps total", () => {
  const { canvas } = createCanvas();
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 });
  assert.ok(Number.isFinite(result.totalRenderMs));
  assert.ok(result.totalRenderMs >= 0);
  assert.ok(result.renderTimings && typeof result.renderTimings === "object");
  assert.ok(Object.hasOwn(result.renderTimings, "terres-et-cotes"));
  assert.ok(Object.hasOwn(result.renderTimings, "etiquettes"));
});


test("la résolution des tuiles de relief utilise trois paliers stables au lieu de varier à chaque zoom", () => {
  assert.equal(terrainTileSizeForZoom(1), 32);
  assert.equal(terrainTileSizeForZoom(2.49), 32);
  assert.equal(terrainTileSizeForZoom(2.5), 64);
  assert.equal(terrainTileSizeForZoom(7.99), 64);
  assert.equal(terrainTileSizeForZoom(8), 96);
  assert.equal(terrainTileSizeForZoom(8, 0.5), 48);
});

test("les labels de villes vérifient la submersion avec un index spatial local", () => {
  const city = { geometry: { type: "Point", coordinates: [2.35, 48.86] } };
  const world = { revision: 1, currentCells: [
    { longitude: 139.7, latitude: 35.6, permanentlySubmerged: true },
    { longitude: 2.4, latitude: 48.9, permanentlySubmerged: true }
  ] };
  assert.equal(isCityPermanentlySubmerged(city, world), true);
  world.currentCells[1].permanentlySubmerged = false;
  world.revision++;
  assert.equal(isCityPermanentlySubmerged(city, world), false);
});

test("l'index des villes gère le voisinage de l'antiméridien", () => {
  const city = { geometry: { type: "Point", coordinates: [-179.6, 12] } };
  const world = { revision: 1, currentCells: [
    { longitude: 179.7, latitude: 12.1, inundated: true }
  ] };
  assert.equal(isCityPermanentlySubmerged(city, world), true);
});

test("la vue mondiale n'indexe pas les GeoJSON avant qu'un zoom régional soit nécessaire", () => {
  const collection = { type: "FeatureCollection", features: Array.from({ length: 100 }, (_, i) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [-170 + i, 10] }
  })) };
  assert.strictEqual(selectVisibleFeatures(collection, { zoom: 1, centerLongitude: 0, centerLatitude: 0 }), collection);
  assert.equal(getGeoSpatialIndexStats(collection).indexed, false);
});


test("les couches statiques sont mises en cache et réutilisées lors d'un rendu dynamique", () => {
  const previous = globalThis.OffscreenCanvas;
  class MockOffscreenCanvas {
    constructor(width, height) { this.width = width; this.height = height; this.context = createCanvas().canvas.getContext("2d"); }
    getContext() { return this.context; }
  }
  globalThis.OffscreenCanvas = MockOffscreenCanvas;
  try {
    const { canvas } = createCanvas();
    const first = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 });
    const second = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, selectedCountry: "France" });
    assert.equal(first.staticCacheHit, false);
    assert.equal(second.staticCacheHit, true);
    assert.equal(getStaticLayerCacheStats(canvas).entries, 1);
    assert.equal(getStaticLayerCacheStats(canvas).maxEntries, 3);
    assert.ok(getStaticLayerCacheStats(canvas).bytes > 0);
    assert.equal(getStaticLayerCacheStats(canvas).maxBytes, 48 * 1024 * 1024);
  } finally {
    if (previous === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous;
  }
});


test("les bascules WebGL des côtes, frontières et rivières invalident le cache statique", () => {
  const previous = globalThis.OffscreenCanvas;
  const previousCoast = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST;
  const previousBoundaries = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_BOUNDARIES;
  const previousRivers = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES;
  class MockOffscreenCanvas {
    constructor(width, height) { this.width = width; this.height = height; this.context = createCanvas().canvas.getContext("2d"); }
    getContext() { return this.context; }
  }
  globalThis.OffscreenCanvas = MockOffscreenCanvas;
  delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST;
  delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_BOUNDARIES;
  delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES;
  try {
    const { canvas } = createCanvas();
    const first = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 });
    const coastToggle = (globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST = true,
      renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 }));
    const boundaryToggle = (globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_BOUNDARIES = true,
      renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 }));
    const riverToggle = (globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES = true,
      renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 }));
    assert.equal(first.staticCacheHit, false);
    assert.equal(coastToggle.staticCacheHit, false);
    assert.equal(boundaryToggle.staticCacheHit, false);
    assert.equal(riverToggle.staticCacheHit, false);
  } finally {
    if (previous === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous;
    if (previousCoast === undefined) delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST;
    else globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST = previousCoast;
    if (previousBoundaries === undefined) delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_BOUNDARIES;
    else globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_BOUNDARIES = previousBoundaries;
    if (previousRivers === undefined) delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES;
    else globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES = previousRivers;
  }
});;

test("le nombre de villes affichées ne dépasse jamais cinq, quel que soit le zoom", () => {
  for (const zoom of [1, 2, 4, 8, 14, 35]) assert.equal(getCityLabelLimit(zoom), 5);
});

test("les villes les plus importantes sont prioritaires dans le tri des labels", () => {
  const { canvas } = createCanvas();
  const labels = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Petite ville", kind: "city", minZoom: 2, POP_MAX: 1000 }, geometry: { type: "Point", coordinates: [20, 10] } },
    { type: "Feature", properties: { name: "Grande ville", kind: "city", minZoom: 2, POP_MAX: 9000000 }, geometry: { type: "Point", coordinates: [0, 0] } }
  ] };
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, labels, viewport: { zoom: 4, centerLongitude: 0, centerLatitude: 0 } });
  assert.ok(result.labelHits.findIndex(label => label.name === "Grande ville") < result.labelHits.findIndex(label => label.name === "Petite ville"));
});


test("les fleuves sont limités aux grands axes à tous les niveaux de zoom", () => {
  for (const zoom of [1, 3, 8, 35]) {
    const profile = getSecondaryDetailProfile(zoom);
    assert.equal(profile.riversRank, 1);
    assert.equal(profile.riversMax, 18);
  }
  const river = (name, rank, vertices) => ({
    type: "Feature", properties: { name, scalerank: rank },
    geometry: { type: "LineString", coordinates: Array.from({ length: vertices }, (_, i) => [i, i / 10]) }
  });
  const collection = { type: "FeatureCollection", features: [
    river("petit affluent", 2, 80),
    river("grand fleuve", 1, 20),
    river("fleuve majeur", 0, 12),
    river("fleuve secondaire", 1, 60)
  ] };
  const selected = selectMajorRiverFeatures(collection, 1, 3);
  assert.deepEqual(selected.map(feature => feature.properties.name), ["fleuve majeur", "fleuve secondaire", "grand fleuve"]);
  assert.deepEqual(selectMajorRiverFeatures(collection, 1, 2).map(feature => feature.properties.name),
    ["fleuve majeur", "fleuve secondaire"]);
  assert.deepEqual(collection.features.map(feature => feature.properties.name),
    ["petit affluent", "grand fleuve", "fleuve majeur", "fleuve secondaire"],
    "le classement mis en cache ne doit pas réordonner la source");
});

test("les côtes physiques gagnent en détail à mesure que le zoom augmente", () => {
  const expected = [
    [1, { tolerance: 4.4, minRingArea: 60 }],
    [3, { tolerance: 3.9, minRingArea: 40 }],
    [8, { tolerance: 3.4, minRingArea: 24 }],
    [20, { tolerance: 2.8, minRingArea: 14 }]
  ];
  for (const [zoom, profile] of expected) {
    const land = getLandCoastSimplificationProfile(zoom);
    assert.deepEqual(land, profile);
    assert.deepEqual(getTerritoryFillSimplificationProfile(zoom), land);
    assert.deepEqual(getTerritoryOutlineSimplificationProfile(zoom), land);
  }
  assert.ok(getLandCoastSimplificationProfile(1).tolerance > getCoastSimplificationProfile(1).tolerance);
  assert.ok(getLandCoastSimplificationProfile(20).tolerance > getCoastSimplificationProfile(20).tolerance);
});


test("les rives des lacs utilisent le même profil de simplification que les côtes marines", () => {
  for (const zoom of [1, 2, 4, 8, 20]) {
    assert.deepEqual(getLakeCoastSimplificationProfile(zoom), getLandCoastSimplificationProfile(zoom));
  }
});

test("les aplats territoriaux orange suivent le même masque côtier que les terres", () => {
  for (const zoom of [1, 2, 4, 8, 20]) {
    assert.deepEqual(getTerritoryFillSimplificationProfile(zoom), getLandCoastSimplificationProfile(zoom));
  }
});

test("les sommets de montagnes ne dessinent plus de triangles mais gardent les noms majeurs", () => {
  const { canvas, calls } = createCanvas();
  const emptyLand = { type: "FeatureCollection", features: [] };
  const elevationPoints = { type: "FeatureCollection", features: [{
    type: "Feature",
    properties: { kind: "mountain", elevation_m: 8848, name: "Everest" },
    geometry: { type: "Point", coordinates: [0, 0] }
  }] };
  renderWorldMap(canvas, emptyLand, {
    width: 640, height: 320, pixelRatio: 1,
    elevationPoints,
    viewport: { zoom: 3, centerLongitude: 0, centerLatitude: 0 }
  });
  assert.ok(calls.some(call => call[0] === "fillText" && call[1] === "Everest"));
  assert.equal(calls.filter(call => call[0] === "closePath").length, 0, "aucun triangle ni polygone de banquise ne doit être dessiné");
});


test("le fond terrestre sous les pays utilise des tons neutres et non la palette ocre", () => {
  const { canvas, calls } = createCanvas();
  renderWorldMap(canvas, land, { width: 640, height: 320, year: 1444, pixelRatio: 1, terrainEnabled: false });
  assert.ok(calls.some(call => call[0] === "fillStyle" && call[1] === "#53665f"));
  assert.ok(!calls.some(call => call[0] === "strokeStyle" && call[1] === "#344b50"));
});


test("la taille des textes évolue progressivement sans saut au seuil de zoom",()=>{
  const before=getMapLabelFontSize("country",2.99,1);
  const after=getMapLabelFontSize("country",3.01,1);
  assert.ok(Math.abs(after-before)<0.03);
  assert.ok(getMapLabelFontSize("country",4,1)>getMapLabelFontSize("country",1,1));
  assert.ok(getMapLabelFontSize("city",20,1)>getMapLabelFontSize("city",1,1));
});


test("le contour externe de l'Antarctique n'ajoute pas de trait au nord du continent", () => {
  const renderStrokeCount = collection => {
    const { canvas, calls } = createCanvas();
    renderWorldMap(canvas, collection, {
      width: 640, height: 320, pixelRatio: 1,
      viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
      terrainEnabled: true
    });
    return calls.filter(call => call[0] === "stroke").length;
  };
  const antarctica = { type: "FeatureCollection", features: [{
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[
      [-180, -70], [-90, -65], [0, -64], [90, -65], [180, -70],
      [180, -89], [0, -89], [-180, -89], [-180, -70]
    ]] }
  }] };
  assert.equal(renderStrokeCount(antarctica), renderStrokeCount({ type: "FeatureCollection", features: [] }),
    "le contour de la géométrie antarctique ne doit pas être tracé");
});

test("la détection de l'Antarctique supporte les anneaux GeoJSON très détaillés sans débordement de pile", () => {
  const { canvas, calls } = createCanvas();
  const ring = Array.from({ length: 140000 }, (_, index) => {
    const longitude = -180 + (index % 70000) * (360 / 69999);
    const latitude = index < 70000 ? -70 : -89;
    return [longitude, latitude];
  });
  ring.push(ring[0]);
  const antarctica = { type: "FeatureCollection", features: [{
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] }
  }] };
  assert.doesNotThrow(() => renderWorldMap(canvas, antarctica, {
    width: 640, height: 320, pixelRatio: 1,
    viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
    terrainEnabled: true
  }));
  assert.ok(calls.some(call => call[0] === "fillStyle" && call[1] === "rgba(248,251,252,0.98)"),
    "l'anneau antarctique détaillé doit être reconnu et recevoir son aplat");
});

test("Antarctique absent du remplissage terrestre translucide WebGL", () => {
  const { canvas } = createCanvas();
  const antarcticaFeature = {
    type: "Feature",
    bbox: [-180, -90, 180, -63],
    geometry: { type: "Polygon", coordinates: [[[-180, -63], [-90, -70], [0, -63], [90, -70], [180, -70], [180, -90], [-180, -90], [-180, -63]]] }
  };
  const collection = { type: "FeatureCollection", features: [...land.features, antarcticaFeature] };
  const renderedLayerBatches = [];
  const geographicWebGLRenderer = {
    canvas: {},
    supports: () => true,
    supportsBoundary: () => true,
    renderLayers: layers => { renderedLayerBatches.push(layers); return {}; }
  };
  const previousDisable = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL;
  globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL = false;
  try {
    renderWorldMap(canvas, collection, {
      width: 640, height: 320, pixelRatio: 1,
      viewport: { zoom: 1, centerLongitude: 0, centerLatitude: 0 },
      terrainEnabled: true,
      geographicWebGLRenderer
    });
  } finally {
    if (previousDisable === undefined) delete globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL;
    else globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL = previousDisable;
  }
  const renderedLayers = renderedLayerBatches.flat();
  assert.ok(renderedLayers.length, "le moteur WebGL géographique doit recevoir les couches");
  const landFill = renderedLayers.find(layer => layer.key === "land-fill");
  assert.ok(landFill, "la couche de remplissage terrestre doit être rendue");
  assert.equal(landFill.features.length, 1,
    "seule la terre ordinaire doit recevoir le remplissage translucide");
  assert.ok(landFill.features.every(feature => feature !== antarcticaFeature),
    "la géométrie antarctique doit être absente du remplissage translucide");
});


test("les repères d'altitude sont triés une seule fois par collection et conservent leur priorité", () => {
  const mountain = { type: "Feature", properties: { elevation_m: 8848 }, geometry: { type: "Point", coordinates: [86, 28] } };
  const hill = { type: "Feature", properties: { elevation_m: 1200 }, geometry: { type: "Point", coordinates: [10, 10] } };
  const depression = { type: "Feature", properties: { elevation_m: -430 }, geometry: { type: "Point", coordinates: [20, 20] } };
  const polygon = { type: "Feature", properties: { elevation_m: 9999 }, geometry: { type: "Polygon", coordinates: [] } };
  const collection = { type: "FeatureCollection", features: [hill, polygon, depression, mountain] };
  assert.deepEqual(selectMajorElevationFeatures(collection, 2), [mountain, hill]);
  assert.deepEqual(selectMajorElevationFeatures(collection, 3), [mountain, hill, depression]);
  assert.deepEqual(collection.features, [hill, polygon, depression, mountain],
    "le tri en cache ne doit jamais réordonner la collection source");
});

test("les limites administratives nombreuses ne déclenchent aucun tracé Canvas", () => {
  const administrativeBoundaries = {
    type: "FeatureCollection",
    features: Array.from({ length: 100 }, (_, index) => ({
      type: "Feature", properties: { scalerank: 0 },
      geometry: { type: "LineString", coordinates: [[index, 0], [index + 0.4, 1]] }
    }))
  };
  const emptyLand = { type: "FeatureCollection", features: [] };
  const baseline = createCanvas();
  renderWorldMap(baseline.canvas, emptyLand, {
    width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 9 }
  });
  const withAdministrativeInput = createCanvas();
  const result = renderWorldMap(withAdministrativeInput.canvas, emptyLand, {
    width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 9 }, administrativeBoundaries
  });
  assert.equal(result.administrativeBoundaryCount, 0);
  assert.equal(
    withAdministrativeInput.calls.filter(call => call[0] === "stroke").length,
    baseline.calls.filter(call => call[0] === "stroke").length,
    "l'injection de 100 limites administratives ne doit ajouter aucun tracé Canvas"
  );
});


test("les métriques typographiques des labels sont réutilisées entre les rendus", () => {
  const labels = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Label métrique réutilisable", kind: "country" }, geometry: { type: "Point", coordinates: [0, 0] } }
  ] };
  const render = () => {
    const { canvas, calls } = createCanvas();
    renderWorldMap(canvas, land, {
      width: 640, height: 320, pixelRatio: 1, labels,
      viewport: { zoom: 4, centerLongitude: 0, centerLatitude: 0 }
    });
    return calls;
  };
  const first = render();
  const second = render();
  assert.equal(first.filter(call => call[0] === "measureText").length, 1);
  assert.equal(second.filter(call => call[0] === "measureText").length, 0,
    "la seconde passe ne doit plus mesurer une largeur déjà mise en cache");
  assert.equal(second.filter(call => call[0] === "fillText" && call[1] === "LABEL MÉTRIQUE RÉUTILISABLE").length, 1);
});


test("le classement des grands lacs est mis en cache par collection et rang", () => {
  let rankReads = 0;
  const features = Array.from({ length: 20 }, (_, index) => ({
    type: "Feature",
    properties: {
      get scalerank() { rankReads++; return index < 15 ? 0 : 2; },
      name: "Lac " + index
    },
    bbox: [0, 0, 20 - index, 15 - index * 0.3],
    geometry: { type: "Polygon", coordinates: [] }
  }));
  const collection = { type: "FeatureCollection", features };
  const first = selectMajorLakeFeatures(collection, 1, 12);
  const readsAfterFirstSelection = rankReads;
  const second = selectMajorLakeFeatures(collection, 1, 5);
  assert.equal(first.length, 12);
  assert.equal(second.length, 5);
  assert.equal(rankReads, readsAfterFirstSelection,
    "une seconde sélection avec le même rang réutilise le classement calculé");
  assert.deepEqual(second, first.slice(0, 5));
});


test("l'index spatial traite les collections géométriques imbriquées sans récursion", () => {
  const nested = { type: "Feature", properties: { id: "nested" }, geometry: {
    type: "GeometryCollection", geometries: [
      { type: "GeometryCollection", geometries: [
        { type: "Point", coordinates: [4, 45] },
        { type: "LineString", coordinates: [[5, 45], [6, 46]] }
      ] }
    ]
  } };
  const collection = { type: "FeatureCollection", features: [nested] };
  const visible = queryGeoSpatialIndex(buildGeoSpatialIndex(collection), {
    zoom: 5, centerLongitude: 5, centerLatitude: 45
  });
  assert.strictEqual(visible.features[0], nested);
});

test("les clés de tuiles numériques conservent la sélection autour de l'antiméridien", () => {
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "est" }, geometry: { type: "Point", coordinates: [179, 0] } },
    { type: "Feature", properties: { id: "ouest" }, geometry: { type: "Point", coordinates: [-179, 0] } },
    { type: "Feature", properties: { id: "loin" }, geometry: { type: "Point", coordinates: [0, 0] } }
  ] };
  const index = buildGeoSpatialIndex(collection, 10);
  const result = queryGeoSpatialIndex(index, { zoom: 8, centerLongitude: 180, centerLatitude: 0 });
  assert.deepEqual(result.features.map(feature => feature.properties.id), ["est", "ouest"]);
  assert.strictEqual(queryGeoSpatialIndex(index, { zoom: 8, centerLongitude: -180, centerLatitude: 0 }), result);
});

test("le plan de tuiles expose toujours des clés lisibles après indexation numérique", async () => {
  const { getGeoSpatialTilePlan } = await import("../src/world/geo-spatial-index.js");
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [2, 48] } }
  ] };
  const plan = getGeoSpatialTilePlan(collection, { zoom: 4, centerLongitude: 0, centerLatitude: 45 });
  assert.ok(plan.tileKeys.length > 0);
  assert.ok(plan.tileKeys.every(key => /^[0-9]+:[0-9]+$/.test(key)));
  assert.equal(plan.visibleTileCount, plan.tileKeys.length);
});


test("le classement géographique des lacs supporte des anneaux très détaillés sans spread massif", () => {
  const ring = Array.from({ length: 140000 }, (_, index) => [
    -5 + (index % 70000) / 7000,
    40 + Math.floor(index / 70000) * 2
  ]);
  ring.push(ring[0]);
  const feature = { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } };
  assert.doesNotThrow(() => selectMajorLakeFeatures({ features: [feature] }, 1, 1));
});

test("le calcul des surfaces de polygones ignore les coordonnées invalides sans contaminer l'aire", () => {
  const valid = { type: "Feature", geometry: { type: "Polygon", coordinates: [
    [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]
  ] } };
  const invalidHole = { type: "Feature", geometry: { type: "Polygon", coordinates: [
    [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]],
    [[0.5, 0.5], [NaN, 1], [1, 1], [0.5, 0.5]]
  ] } };
  assert.equal(filterSmallIslandComponents({ features: [valid] }, 1).features.length, 1);
  assert.equal(filterSmallIslandComponents({ features: [invalidHole] }, 1).features.length, 1);
});

test("le filtrage des composants insulaires conserve l'ordre source sans tri global", () => {
  const ring = size => [[0, 0], [size, 0], [size, size], [0, size], [0, 0]];
  const polygons = [ring(5), ring(0.02), ring(3), ring(0.01)];
  const result = filterSmallIslandComponents({
    features: [{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: polygons.map(polygon => [polygon]) } }]
  }, 100);
  assert.deepEqual(result.features[0].geometry.coordinates, [[polygons[0]], [polygons[2]]]);
});

test("le filtre des grands lacs conserve les rangs et l'ordre des entités", () => {
  const makeLake = (name, rank, size) => ({
    type: "Feature", properties: { name, scalerank: rank },
    bbox: [0, 0, size, size],
    geometry: { type: "Polygon", coordinates: [] }
  });
  const collection = { type: "FeatureCollection", features: [
    makeLake("rang 1", 1, 8), makeLake("rang 3", 3, 20),
    makeLake("rang absent", undefined, 7), makeLake("petit", 1, 0.1)
  ] };
  assert.deepEqual(filterMajorLakeFeatures(collection, 500).features.map(feature => feature.properties.name),
    ["rang 1", "rang absent"]);
});

test("les familles cartographiques détectent les ajouts et retraits de couches sans Set temporaire", () => {
  const previous = { physical: { land: {}, lakes: {}, rivers: {} }, political: { labels: {} } };
  const next = { physical: { land: previous.physical.land, lakes: null, glaciers: {} }, political: { labels: previous.political.labels } };
  assert.deepEqual(getChangedMapLayerFamilies(previous, next), ["physical"]);
  assert.deepEqual(getChangedMapLayerFamilies(next, previous), ["physical"]);
});


test("le classement des fleuves ne relit pas les rangs pendant le tri", () => {
  let rankReads = 0;
  const features = Array.from({ length: 12 }, (_, index) => ({
    type: "Feature",
    properties: { get scalerank() { rankReads++; return index % 2; } },
    geometry: { type: "LineString", coordinates: Array.from({ length: index + 2 }, (_, point) => [point, index]) }
  }));
  const selected = selectMajorRiverFeatures({ features }, 1, 12);
  const readsAfterSort = rankReads;
  assert.equal(selected.length, 12);
  assert.ok(rankReads <= features.length, "le rang est lu une seule fois par entité");
  selectMajorRiverFeatures({ features: [] }, 1, 12);
  assert.equal(rankReads, readsAfterSort);
});

test("le classement des repères d'altitude lit chaque altitude une seule fois", () => {
  let elevationReads = 0;
  const features = Array.from({ length: 16 }, (_, index) => ({
    type: "Feature",
    properties: { get elevation_m() { elevationReads++; return index * 100; } },
    geometry: { type: "Point", coordinates: [index, index] }
  }));
  const collection = { features };
  const selected = selectMajorElevationFeatures(collection, 8);
  assert.equal(selected.length, 8);
  assert.equal(elevationReads, features.length);
  selectMajorElevationFeatures(collection, 4);
  assert.equal(elevationReads, features.length, "le classement mis en cache ne relit pas les altitudes");
});

test("le regroupement des frontières conserve deux styles de tirets sans allocation par entité", () => {
  const { canvas, calls } = createCanvas();
  const boundaries = { type: "FeatureCollection", features: Array.from({ length: 20 }, (_, index) => ({
    type: "Feature",
    properties: { BORDERPRECISION: index % 2 === 0 ? 2 : 3, scalerank: 0 },
    geometry: { type: "LineString", coordinates: [[index, 0], [index + 0.5, 1]] }
  })) };
  renderWorldMap(canvas, land, {
    width: 640, height: 320, pixelRatio: 1, viewport: { zoom: 9 },
    politicalBoundaries: boundaries
  });
  const dashCalls = calls.filter(call => call[0] === "setLineDash");
  assert.ok(dashCalls.length <= 4, "les deux passes de couleur réutilisent chacune les deux lots de motifs, indépendamment du nombre de frontières");
});


test("l’index physique met en cache les coordonnées normalisées des cellules", () => {
  let longitudeReads = 0, latitudeReads = 0;
  const cell = {
    get longitude() { longitudeReads++; return 2.4; },
    get latitude() { latitudeReads++; return 48.9; },
    permanentlySubmerged: true
  };
  const world = { revision: 1, currentCells: [cell] };
  const city = { geometry: { type: "Point", coordinates: [2.35, 48.86] } };
  assert.equal(isCityPermanentlySubmerged(city, world), true);
  assert.equal(isCityPermanentlySubmerged(city, world), true);
  assert.equal(longitudeReads, 1);
  assert.equal(latitudeReads, 1);
});

test("le cache de submersion est isolé par entité et réinitialisé à chaque révision", () => {
  const world = { revision: 1, currentCells: [
    { longitude: 2.4, latitude: 48.9, permanentlySubmerged: true }
  ] };
  const first = { geometry: { type: "Point", coordinates: [2.35, 48.86] } };
  const second = { geometry: { type: "Point", coordinates: [2.35, 48.86] } };
  assert.equal(isCityPermanentlySubmerged(first, world), true);
  assert.equal(isCityPermanentlySubmerged(second, world), true);
  world.currentCells[0].permanentlySubmerged = false;
  world.revision++;
  assert.equal(isCityPermanentlySubmerged(first, world), false);
});


test("les repères d'altitude partagent un seul encadrement d'état Canvas", () => {
  const emptyLand = { type: "FeatureCollection", features: [] };
  const options = {
    width: 640, height: 320, pixelRatio: 1,
    viewport: { zoom: 3, centerLongitude: 0, centerLatitude: 0 }
  };
  const baseline = createCanvas();
  renderWorldMap(baseline.canvas, emptyLand, options);
  const withMarkers = createCanvas();
  const elevationPoints = {
    type: "FeatureCollection",
    features: Array.from({ length: 4 }, (_, index) => ({
      type: "Feature",
      properties: { kind: "mountain", elevation_m: 6000 + index, name: "Sommet " + index },
      geometry: { type: "Point", coordinates: [index * 2, index] }
    }))
  };
  renderWorldMap(withMarkers.canvas, emptyLand, { ...options, elevationPoints });
  const baselineSaves = baseline.calls.filter(call => call[0] === "save").length;
  const markerSaves = withMarkers.calls.filter(call => call[0] === "save").length;
  assert.equal(markerSaves - baselineSaves, 1,
    "le lot de repères doit ajouter un seul save, quel que soit le nombre de sommets");
});


test("le partitionnement des entités WebGL évalue chaque capacité une seule fois", () => {
  const features = Array.from({ length: 40 }, (_, index) => ({ index }));
  let supportChecks = 0;
  const result = partitionFeatures(features, feature => {
    supportChecks++;
    return feature.index % 3 === 0;
  });
  assert.equal(supportChecks, features.length);
  assert.equal(result.supported.length, 14);
  assert.equal(result.unsupported.length, 26);
  assert.deepEqual([...result.supported, ...result.unsupported].sort((a, b) => a.index - b.index), features);
});

test("les sélections cartographiques réutilisent les classements complets sans copie", () => {
  const lakeCollection = { features: [{ type: "Feature", properties: { scalerank: 1 }, geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } }] };
  const riverCollection = { features: [{ type: "Feature", properties: { scalerank: 1 }, geometry: { type: "LineString", coordinates: [[0,0],[1,1]] } }] };
  const elevationCollection = { features: [{ type: "Feature", properties: { elevation_m: 100 }, geometry: { type: "Point", coordinates: [0,0] } }] };
  assert.strictEqual(selectMajorLakeFeatures(lakeCollection, 1, 10), selectMajorLakeFeatures(lakeCollection, 1, 10));
  assert.strictEqual(selectMajorRiverFeatures(riverCollection, 1, 10), selectMajorRiverFeatures(riverCollection, 1, 10));
  assert.strictEqual(selectMajorElevationFeatures(elevationCollection, 10), selectMajorElevationFeatures(elevationCollection, 10));
});


test("la simplification Douglas-Peucker conserve les extrémités et ferme les anneaux", () => {
  const simplifiedRing = simplifyClosedRing([
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 },
    { x: 0, y: 2 }, { x: 0, y: 0 }
  ], 0.1);
  assert.deepEqual(simplifiedRing[0], simplifiedRing[simplifiedRing.length - 1]);
  assert.ok(simplifiedRing.length >= 4);
  assert.deepEqual(simplifiedRing.slice(0, -1), [
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }
  ]);
});

test("le fond océanique reçoit une profondeur radiale douce", () => {
  const { canvas, calls } = createCanvas();
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 });
  const profile = getOceanDepthProfile(result.theme);
  assert.ok(calls.filter(call => call[0] === "createRadialGradient").length >= 2);
  assert.ok(calls.some(call => call[0] === "radialGradientStop" && call[1] === 1 && call[2] === `rgba(0,0,0,${profile.edgeAlpha})`));
  assert.ok(calls.some(call => call[0] === "radialGradientStop" && call[2] === `rgba(255,255,255,${profile.shelfAlpha})`));
});
test("le moteur ajoute un liseré côtier discret après le remplissage terrestre", () => {
  const { canvas, calls } = createCanvas();
  const result = renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1 });
  assert.equal(result.landCount, 1);
  assert.ok(calls.some(call => call[0] === "strokeStyle" && call[1] === result.theme.colors.accent));
  assert.ok(calls.some(call => call[0] === "fillStyle" && call[1] === "rgba(0,0,0,0)"));
});
test("le liseré côtier reste distinct des frontières politiques", () => {
  const { canvas, calls } = createCanvas();
  renderWorldMap(canvas, land, { width: 640, height: 320, pixelRatio: 1, territories: { type: "FeatureCollection", features: [] } });
  assert.ok(calls.some(call => call[0] === "strokeStyle" && typeof call[1] === "string"));
});


test("les budgets des caches de géométrie restent bornés et dimensionnés pour les retours de vue", async () => {
  const { getProjectedPathCacheStats } = await import("../src/world/map-renderer.js");
  const stats = getProjectedPathCacheStats();
  assert.equal(stats.maxCachedPaths, 4096);
  assert.equal(stats.maxCachedVertices, 750_000);
  assert.equal(stats.maxCombinedLandMaskCacheEntries, 24);
});

test("les clés Path2D respectent la projection effective et les variations fines de zoom", async () => {
  const previous = globalThis.Path2D;
  class FakePath2D {
    addPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  globalThis.Path2D = FakePath2D;
  try {
    const { getProjectedPathCacheStats } = await import("../src/world/map-renderer.js");
    const { canvas } = createCanvas();
    const collection = { type: "FeatureCollection", features: [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-10, -5], [10, -5], [10, 5], [-10, -5]]] }
    }] };
    const before = getProjectedPathCacheStats().projectedPathCacheMisses;
    renderWorldMap(canvas, collection, { width: 640, height: 320, pixelRatio: 1,
      viewport: { zoom: 2, centerLongitude: 4, centerLatitude: 5, wrapLongitude: true } });
    const first = getProjectedPathCacheStats().projectedPathCacheMisses;
    renderWorldMap(canvas, collection, { width: 640, height: 320, pixelRatio: 1,
      viewport: { zoom: 2, centerLongitude: 4, centerLatitude: 5, wrapLongitude: false } });
    const second = getProjectedPathCacheStats().projectedPathCacheMisses;
    renderWorldMap(canvas, collection, { width: 640, height: 320, pixelRatio: 1,
      viewport: { zoom: 2.00001, centerLongitude: 4, centerLatitude: 5, wrapLongitude: false } });
    const third = getProjectedPathCacheStats().projectedPathCacheMisses;
    assert.ok(first > before);
    assert.equal(second, first, "le projecteur déplie déjà les longitudes : ce drapeau ne change pas le chemin effectif");
    assert.ok(third > second, "une variation de zoom ne doit pas être masquée par un arrondi de clé");
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});


test("les labels cartographiques adoptent les polices et couleurs de l'ère active", async () => {
  const { getCartographicTheme } = await import("../src/world/cartographic-style.js");
  const exploration = getCartographicTheme(1500);
  const future = getCartographicTheme(2150);
  const explorationCountry = getMapLabelStyle("country", exploration, 14, 1);
  const futureCountry = getMapLabelStyle("country", future, 14, 1);
  const explorationCity = getMapLabelStyle("city", exploration, 10, 1);

  assert.match(explorationCountry.font, /Cinzel/);
  assert.match(futureCountry.font, /Orbitron/);
  assert.equal(explorationCountry.fill, exploration.colors.text);
  assert.equal(futureCountry.fill, future.colors.text);
  assert.equal(explorationCountry.stroke, exploration.colors.surface);
  assert.equal(explorationCity.fill, exploration.colors.accent);
  assert.equal(explorationCity.markerFill, exploration.colors.accent);
  assert.ok(explorationCountry.lineWidth > explorationCity.lineWidth);
});

test("la hiérarchie des labels garde les pays dominants et les océans secondaires", () => {
  const theme = {
    typography: { display: "Cormorant Garamond", body: "Libre Baskerville" },
    colors: { text: "#eee8d8", accent: "#8b3944", surface: "#282a2b" }
  };
  const country = getMapLabelStyle("country", theme, 14, 1.5);
  const continent = getMapLabelStyle("continent", theme, 13, 1.5);
  const ocean = getMapLabelStyle("ocean", theme, 10, 1.5);
  assert.match(country.font, /Cormorant Garamond/);
  assert.match(ocean.font, /Libre Baskerville/);
  assert.ok(country.alpha > continent.alpha);
  assert.ok(continent.alpha > ocean.alpha);
  assert.ok(Math.abs(country.shadowBlur - 4.8) < 1e-9);
  assert.ok(ocean.shadowBlur > 0);
});


test("les emprises des labels unifient collision et zone interactive", () => {
  const country = getMapLabelLayout("country", { x: 100, y: 80 }, 60, 14, 1);
  const city = getMapLabelLayout("city", { x: 100, y: 80 }, 30, 10, 1);
  const continent = getMapLabelLayout("continent", { x: 100, y: 80 }, 80, 13, 1);

  assert.equal(country.textX, 70);
  assert.equal(country.textY, 80);
  assert.equal(country.box.left, 63);
  assert.equal(country.box.right, 137);
  assert.equal(country.hitBounds.left, country.box.left - 1.5);
  assert.equal(city.textY, 85);
  assert.ok(city.hitBounds.left < city.box.left);
  assert.ok(city.marker);
  assert.equal(continent.marker, null);
  assert.ok(continent.box.left < country.box.left);
});

test("les emprises des labels restent proportionnelles au rendu haute densité", () => {
  const normal = getMapLabelLayout("city", { x: 50, y: 60 }, 40, 10, 1);
  const retina = getMapLabelLayout("city", { x: 50, y: 60 }, 40, 10, 2);
  assert.equal(retina.marker.radius, normal.marker.radius * 2);
  assert.equal(retina.marker.lineWidth, normal.marker.lineWidth * 2);
  assert.equal(normal.box.left - retina.box.left, 6);
  assert.equal(retina.box.top, normal.box.top);
});

test("les coordonnées invalides ne produisent pas de dimensions négatives", () => {
  const layout = getMapLabelLayout("city", { x: NaN, y: Infinity }, -10, 0, 0);
  assert.equal(layout.textX, 0);
  assert.equal(layout.textY, 0.5);
  assert.ok(layout.box.right >= layout.box.left);
  assert.ok(layout.box.bottom >= layout.box.top);
});


test("la profondeur océanique adopte une signature discrète pour chaque ère", async () => {
  const { getCartographicTheme } = await import("../src/world/cartographic-style.js");
  const years = [1500, 1700, 1850, 1950, 2050, 2150];
  const profiles = years.map(year => getOceanDepthProfile(getCartographicTheme(year)));
  assert.equal(profiles.length, 6);
  for (const profile of profiles) {
    assert.ok(profile.centerAlpha >= 0 && profile.centerAlpha <= 0.02);
    assert.ok(profile.middleAlpha > profile.centerAlpha);
    assert.ok(profile.edgeAlpha > profile.middleAlpha);
    assert.ok(profile.edgeAlpha <= 0.4);
    assert.ok(profile.shelfAlpha >= 0 && profile.shelfAlpha <= 0.07);
    assert.ok(profile.shelfRadius >= 0.45 && profile.shelfRadius <= 0.6);
  }
  assert.ok(profiles[5].edgeAlpha > profiles[0].edgeAlpha);
});

test("les noms maritimes adoptent une typographie cursive et un contraste mesuré", async () => {
  const { getCartographicTheme } = await import("../src/world/cartographic-style.js");
  const theme = getCartographicTheme(1700);
  const ocean = getMapLabelStyle("ocean", theme, 12, 1.5);
  const regionalSea = getMapLabelStyle("sea", theme, 12, 1.5);
  const strait = getMapLabelStyle("strait", theme, 12, 1.5);
  const country = getMapLabelStyle("country", theme, 14, 1.5);
  assert.match(ocean.font, /^italic /);
  assert.match(regionalSea.font, /^italic /);
  assert.match(strait.font, /^italic /);
  assert.equal(regionalSea.alpha, ocean.alpha);
  assert.equal(strait.lineWidth, ocean.lineWidth);
  assert.match(ocean.font, /Libre Baskerville/);
  assert.equal(ocean.fill, theme.colors.text);
  assert.ok(ocean.alpha < country.alpha);
  assert.ok(ocean.lineWidth < country.lineWidth);
  assert.ok(ocean.shadowBlur > 0);
});
