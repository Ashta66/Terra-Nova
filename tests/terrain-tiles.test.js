import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainTileStore } from "../src/world/terrain-tiles.js";

function createStore() {
  return createTerrainTileStore(
    { width: 72, height: 36, values: new Int16Array(72 * 36) },
    { tileSize: 6, maxTiles: 120 }
  );
}

test("le préchargement en mouvement conserve les tuiles déjà chaudes", () => {
  const store = createStore();
  const first = store.preloadViewport(
    { zoom: 4, centerLongitude: 0, centerLatitude: 0 },
    { padding: 0.25 }
  );
  assert.ok(first.length > 0);

  const second = store.preloadViewport(
    { zoom: 4, centerLongitude: 25, centerLatitude: 0 },
    {
      padding: 0.25,
      retainExisting: true,
      lookAhead: 0.45,
      directionLongitude: 1
    }
  );

  assert.ok(second.length > 0);
  assert.ok(first.every(id => store.loadedIds.includes(id)));
  assert.ok(second.every(id => store.loadedIds.includes(id)));
});

test("le préchargement directionnel anticipe le côté vers lequel la carte avance", () => {
  const forward = createStore();
  const backward = createStore();
  const viewport = { zoom: 4, centerLongitude: 40, centerLatitude: 0 };
  const options = { padding: 0.2, lookAhead: 0.6 };

  forward.preloadViewport(viewport, { ...options, directionLongitude: 1 });
  backward.preloadViewport(viewport, { ...options, directionLongitude: -1 });

  const meanTileX = store => store.loadedIds
    .map(id => Number(id.split("/")[1]))
    .reduce((sum, x, _, values) => sum + x / values.length, 0);

  assert.ok(meanTileX(forward) > meanTileX(backward));
});

test("le mode normal continue à évincer les tuiles hors viewport", () => {
  const store = createStore();
  store.preloadViewport({ zoom: 4, centerLongitude: -100, centerLatitude: 0 }, { padding: 0 });
  const previous = [...store.loadedIds];
  const current = store.preloadViewport(
    { zoom: 4, centerLongitude: 100, centerLatitude: 0 },
    { padding: 0 }
  );

  assert.ok(previous.some(id => !current.includes(id)));
  assert.deepEqual(new Set(store.loadedIds), new Set(current));
});


test("les tuiles visibles restent prioritaires quand le cache est sous pression", () => {
  const store = createTerrainTileStore(
    { width: 720, height: 360, values: new Int16Array(720 * 360) },
    { tileSize: 30, maxTiles: 8 }
  );
  store.preloadViewport(
    { zoom: 5, centerLongitude: 12, centerLatitude: 8 },
    { padding: 0.5, lookAhead: 0.9, directionLongitude: 1, directionLatitude: 1 }
  );
  const centerId = store.getTileAt(12, 8).id;
  assert.ok(store.loadedIds.includes(centerId));
  assert.ok(store.size <= 8);
});

test("le préchargement sans direction ne crée pas de zone prédictive", () => {
  const store = createStore();
  const ids = store.preloadViewport(
    { zoom: 4, centerLongitude: 0, centerLatitude: 0 },
    { padding: 0.25, lookAhead: 0.9 }
  );
  const reference = createStore();
  const referenceIds = reference.preloadViewport(
    { zoom: 4, centerLongitude: 0, centerLatitude: 0 },
    { padding: 0.25 }
  );
  assert.deepEqual(ids, referenceIds);
});

test("le préchargement des niveaux de zoom prépare les tuiles périphériques sans déprioriser le viewport", () => {
  const store = createTerrainTileStore(
    { width: 720, height: 360, values: new Int16Array(720 * 360) },
    { tileSize: 30, maxTiles: 120 }
  );
  const viewport = { zoom: 4, centerLongitude: 0, centerLatitude: 0 };
  const currentOnly = createTerrainTileStore(
    { width: 720, height: 360, values: new Int16Array(720 * 360) },
    { tileSize: 30, maxTiles: 120 }
  );
  const visible = currentOnly.preloadViewport(viewport, { padding: 0.2 });
  const warmed = store.preloadViewport(viewport, {
    padding: 0.2,
    zoomLevels: [2, 8]
  });
  assert.ok(warmed.length > visible.length);
  assert.ok(visible.every(id => store.loadedIds.includes(id)));
  assert.ok(warmed.includes(store.getTileAt(0, 0).id));
});

test("les niveaux de zoom invalides ou identiques sont ignorés", () => {
  const store = createStore();
  const normal = store.preloadViewport(
    { zoom: 4, centerLongitude: 0, centerLatitude: 0 },
    { padding: 0.25 }
  );
  const withInvalidLevels = createStore().preloadViewport(
    { zoom: 4, centerLongitude: 0, centerLatitude: 0 },
    { padding: 0.25, zoomLevels: [4, 0, -2, Number.NaN, Infinity] }
  );
  assert.deepEqual(withInvalidLevels, normal);
});


test("la préparation asynchrone des tuiles cède le thread entre les lots", async () => {
  const store = createStore();
  let checks = 0;
  const ids = Array.from({ length: 24 }, (_, index) => store.getTileId(index % store.columns, Math.floor(index / store.columns)));
  const result = await store.preloadTileIds(ids, {
    batchSize: 2,
    shouldCancel: () => ++checks > 5
  });
  assert.equal(result.cancelled, true);
  assert.ok(result.loaded > 0);
  assert.ok(result.loaded < ids.length);
});

test("le préchargement asynchrone protège les tuiles visibles de l'éviction", async () => {
  const store = createTerrainTileStore(
    { width: 72, height: 36, values: new Int16Array(72 * 36) },
    { tileSize: 6, maxTiles: 8 }
  );
  const visible = store.preloadViewport(
    { zoom: 8, centerLongitude: 0, centerLatitude: 0 },
    { padding: 0 }
  );
  const candidates = Array.from({ length: 30 }, (_, index) => store.getTileId(index % store.columns, Math.floor(index / store.columns)));
  await store.preloadTileIds(candidates, { batchSize: 3, protectedIds: visible });
  assert.ok(visible.every(id => store.loadedIds.includes(id)));
});

