import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const datasets = [
  ["terres", new URL("../data/ne_110m_land.geojson", import.meta.url), ["Polygon", "MultiPolygon"], 100],
  ["lacs", new URL("../data/ne_110m_lakes.geojson", import.meta.url), ["Polygon", "MultiPolygon"], 10],
  ["rivières", new URL("../data/ne_110m_rivers.geojson", import.meta.url), ["LineString", "MultiLineString"], 5],
  ["glaciers", new URL("../data/ne_110m_glaciated_areas.geojson", import.meta.url), ["Polygon", "MultiPolygon"], 5],
  ["repères d'altitude", new URL("../data/ne_110m_elevation_points.geojson", import.meta.url), ["Point"], 10]
];

for (const [label, url, geometryTypes, minimum] of datasets) {
  test(`la couche Natural Earth locale « ${label} » est un GeoJSON valide`, async () => {
    const collection = JSON.parse(await readFile(url, "utf8"));
    assert.equal(collection.type, "FeatureCollection");
    assert.ok(collection.features.length >= minimum);
    for (const feature of collection.features) assert.ok(geometryTypes.includes(feature.geometry?.type));
  });
}

test("les coordonnées de toutes les couches restent dans les limites géographiques", async () => {
  const inspect = value => {
    if (typeof value[0] === "number") {
      assert.ok(Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180);
      assert.ok(Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90);
      return;
    }
    for (const child of value) inspect(child);
  };
  for (const [, url] of datasets) {
    const collection = JSON.parse(await readFile(url, "utf8"));
    for (const feature of collection.features) inspect(feature.geometry.coordinates);
  }
});

test("les points d'altitude disposent de valeurs numériques plausibles", async () => {
  const collection = JSON.parse(await readFile(datasets[4][1], "utf8"));
  for (const feature of collection.features) {
    assert.ok(Number.isFinite(feature.properties.elevation_m));
    assert.ok(feature.properties.elevation_m >= -500 && feature.properties.elevation_m <= 9000);
  }
});

test("les libellés cartographiques locaux sont francisés", async () => {
  const collection = JSON.parse(await readFile(new URL("../data/ne_110m_map_labels.geojson", import.meta.url), "utf8"));
  const names = collection.features.map(feature => feature.properties.name);
  assert.ok(names.includes("Amérique du Nord"));
  assert.ok(names.includes("Océan Atlantique"));
  const regionalSeas = [
    "Mer Méditerranée", "Mer des Caraïbes", "Mer du Nord", "Mer Baltique",
    "Mer Rouge", "Mer Noire", "Mer d'Arabie", "Mer de Chine méridionale",
    "Mer du Japon", "Mer de Béring"
  ];
  for (const name of regionalSeas) assert.ok(names.includes(name), `label maritime manquant : ${name}`);
  const regionalFeatures = collection.features.filter(feature => feature.properties.kind === "sea");
  assert.equal(regionalFeatures.length, regionalSeas.length + 11);
  for (const feature of regionalFeatures) {
    assert.ok(feature.properties.minZoom >= 3 && feature.properties.minZoom <= 5);
    assert.equal(feature.properties.source, "curated-cartographic-anchor");
    assert.equal(feature.geometry.type, "Point");
  }
  const detailedNames = [
    "Golfe du Mexique", "Golfe de Guinée", "Golfe Persique", "Golfe d'Aden",
    "Golfe d'Alaska", "Golfe de Californie", "Baie du Bengale", "Mer Adriatique",
    "Mer Égée", "Mer de Corail", "Mer des Philippines"
  ];
  for (const name of detailedNames) assert.ok(names.includes(name), `repère maritime manquant : ${name}`);
  const straits = collection.features.filter(feature => feature.properties.kind === "strait");
  assert.deepEqual(straits.map(feature => feature.properties.name).sort(), [
    "Canal du Mozambique", "Détroit de Gibraltar", "Détroit de Malacca", "La Manche"
  ]);
  for (const feature of straits) {
    assert.equal(feature.properties.minZoom, 6);
    assert.equal(feature.properties.source, "curated-cartographic-anchor");
    assert.equal(feature.geometry.type, "Point");
    const [longitude, latitude] = feature.geometry.coordinates;
    assert.ok(longitude >= -180 && longitude <= 180);
    assert.ok(latitude >= -90 && latitude <= 90);
  }
  assert.ok(names.includes("Pékin"));
  assert.ok(names.includes("Le Caire"));
  assert.ok(!names.some(name => /^(North America|South America|Africa|Asia|Oceania|Antarctica|Atlantic Ocean|Pacific Ocean|Indian Ocean|Arctic Ocean)$/.test(name)));
});
