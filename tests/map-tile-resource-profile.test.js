import test from "node:test";
import assert from "node:assert/strict";
import { getMapTileResourceProfile } from "../src/world/map-tile-resource-profile.js";

test("les capacités inconnues conservent le profil prudent par défaut", () => {
  assert.deepEqual(getMapTileResourceProfile({}), {
    maxBytes: 64 * 1024 * 1024, maxEntries: 192, workerConcurrency: 2, maxPlannedTiles: 48, tier: "default"
  });
});
test("les appareils à mémoire très limitée utilisent un profil contraint", () => {
  const profile = getMapTileResourceProfile({ deviceMemory: 2, hardwareConcurrency: 8 });
  assert.equal(profile.tier, "constrained");
  assert.equal(profile.maxBytes, 20 * 1024 * 1024);
  assert.equal(profile.maxEntries, 64);
  assert.equal(profile.workerConcurrency, 1);
  assert.equal(profile.maxPlannedTiles, 20);
});
test("un processeur à deux cœurs déclenche aussi le profil contraint", () => {
  assert.equal(getMapTileResourceProfile({ deviceMemory: 8, hardwareConcurrency: 2 }).tier, "constrained");
});
test("les appareils de quatre gigaoctets restent sur un profil équilibré", () => {
  const profile = getMapTileResourceProfile({ deviceMemory: 4, hardwareConcurrency: 8 });
  assert.equal(profile.tier, "balanced");
  assert.equal(profile.maxBytes, 36 * 1024 * 1024);
  assert.equal(profile.maxEntries, 112);
  assert.equal(profile.workerConcurrency, 1);
  assert.equal(profile.maxPlannedTiles, 32);
});
test("un processeur de quatre cœurs limite aussi le profil équilibré", () => {
  assert.equal(getMapTileResourceProfile({ deviceMemory: 8, hardwareConcurrency: 4 }).tier, "balanced");
});
test("les appareils standards conservent les limites historiques", () => {
  const profile = getMapTileResourceProfile({ deviceMemory: 8, hardwareConcurrency: 8 });
  assert.equal(profile.tier, "standard");
  assert.equal(profile.maxBytes, 64 * 1024 * 1024);
  assert.equal(profile.workerConcurrency, 2);
  assert.equal(profile.maxPlannedTiles, 48);
});
test("les appareils haut de gamme disposent d'une marge contrôlée", () => {
  const profile = getMapTileResourceProfile({ deviceMemory: 16, hardwareConcurrency: 12 });
  assert.equal(profile.tier, "generous");
  assert.equal(profile.maxBytes, 80 * 1024 * 1024);
  assert.equal(profile.maxEntries, 224);
  assert.equal(profile.workerConcurrency, 2);
  assert.equal(profile.maxPlannedTiles, 56);
});
test("une mémoire élevée sans nombre de cœurs exploitable reste compatible", () => {
  assert.equal(getMapTileResourceProfile({ deviceMemory: 16 }).tier, "generous");
});
test("une mémoire faible prime sur un nombre élevé de cœurs", () => {
  assert.equal(getMapTileResourceProfile({ deviceMemory: 1, hardwareConcurrency: 32 }).tier, "constrained");
});
test("les valeurs invalides ne déclenchent pas de profil extrême", () => {
  assert.equal(getMapTileResourceProfile({ deviceMemory: -1, hardwareConcurrency: 0 }).tier, "default");
});

test("un CPU modeste borne les ressources lorsque deviceMemory est absent", () => {
  assert.equal(getMapTileResourceProfile({ hardwareConcurrency: 2 }).tier, "constrained");
  assert.equal(getMapTileResourceProfile({ hardwareConcurrency: 4 }).tier, "balanced");
});
test("un CPU standard sans métrique mémoire garde le profil par défaut", () => {
  assert.equal(getMapTileResourceProfile({ hardwareConcurrency: 8 }).tier, "default");
});
test("un nombre de cœurs non fini ne déclenche pas de réduction arbitraire", () => {
  assert.equal(getMapTileResourceProfile({ deviceMemory: undefined, hardwareConcurrency: Infinity }).tier, "default");
});
