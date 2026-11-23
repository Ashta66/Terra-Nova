import test from "node:test";
import assert from "node:assert/strict";
import { geoTileKey, invalidateGeoTiles, getGeoTileRevision } from "../src/world/geo-tile-cache.js";
test("les révisions de tuiles restent locales avec une marge de voisinage", () => {
  const result = invalidateGeoTiles({}, [{ longitude: 5, latitude: 5 }], 1);
  assert.equal(result.invalidatedTileKeys.length, 9);
  assert.equal(getGeoTileRevision(result.revisions, "18:9"), 1);
  assert.equal(getGeoTileRevision(result.revisions, "0:0"), 0);
});
test("les tuiles traversent correctement l'antiméridien", () => {
  const result = invalidateGeoTiles({}, [{ longitude: 179.5, latitude: 0 }], 1);
  assert.ok(result.invalidatedTileKeys.some(key => key.startsWith("0:")));
  assert.ok(result.invalidatedTileKeys.some(key => key.startsWith("35:")));
  assert.equal(geoTileKey(-179.5, 0), "0:9");
});
test("une seconde modification incrémente la révision sans toucher les autres tuiles", () => {
  const first = invalidateGeoTiles({}, [{ longitude: 5, latitude: 5 }], 0);
  const second = invalidateGeoTiles(first.revisions, [{ longitude: 6, latitude: 6 }], 0);
  assert.equal(getGeoTileRevision(second.revisions, "18:9"), 2);
  assert.equal(getGeoTileRevision(second.revisions, "19:9"), 0);
});
test("les invalidations multiples sont dédupliquées et triées par ligne puis colonne", () => {
  const cells = [{ longitude: 179.5, latitude: 0 }, { longitude: 179.5, latitude: 0 }];
  const result = invalidateGeoTiles({}, cells, 1);
  assert.equal(result.invalidatedTileKeys.length, 9);
  const positions = result.invalidatedTileKeys.map(key => key.split(":").map(Number));
  assert.deepEqual(positions, [...positions].sort((a, b) => a[1] - b[1] || a[0] - b[0]));
  for (const key of result.invalidatedTileKeys) assert.equal(result.revisions[key], 1);
});
