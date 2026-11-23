import test from "node:test";
import assert from "node:assert/strict";
import { createMapTileCache } from "../src/world/map-tile-cache.js";

function closable(byteLength) {
  return { byteLength, closed: 0, close() { this.closed++; } };
}

test("le cache LRU évince la tuile la moins récemment utilisée", () => {
  const cache = createMapTileCache({ maxEntries: 2, maxBytes: 100 });
  const a = closable(10), b = closable(10), c = closable(10);
  cache.set("a", a); cache.set("b", b);
  assert.equal(cache.get("a"), a);
  cache.set("c", c);
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("b"), false);
  assert.equal(b.closed, 1);
  assert.deepEqual(cache.stats().entries, 2);
});

test("le budget mémoire évince les entrées jusqu'à revenir sous la limite", () => {
  const cache = createMapTileCache({ maxEntries: 10, maxBytes: 20 });
  const a = closable(12), b = closable(12);
  cache.set("a", a); cache.set("b", b);
  assert.equal(cache.has("a"), false);
  assert.equal(cache.has("b"), true);
  assert.equal(a.closed, 1);
  assert.equal(cache.stats().bytes, 12);
});

test("le remplacement d'une clé ajuste les octets et ferme l'ancienne ressource", () => {
  const cache = createMapTileCache({ maxBytes: 100 });
  const first = closable(12), second = closable(20);
  cache.set("tile", first);
  cache.set("tile", second);
  assert.equal(first.closed, 1);
  assert.equal(second.closed, 0);
  assert.equal(cache.get("tile"), second);
  assert.equal(cache.stats().bytes, 20);
  assert.equal(cache.stats().entries, 1);
});

test("la suppression ferme la ressource et retourne un statut exact", () => {
  const cache = createMapTileCache();
  const tile = closable(8);
  cache.set("tile", tile);
  assert.equal(cache.delete("tile"), true);
  assert.equal(cache.delete("tile"), false);
  assert.equal(tile.closed, 1);
  assert.equal(cache.stats().bytes, 0);
});

test("clear ferme toutes les ressources et réinitialise les compteurs", () => {
  const cache = createMapTileCache();
  const a = closable(8), b = closable(16);
  cache.set("a", a); cache.set("b", b);
  cache.get("a"); cache.get("missing");
  cache.clear();
  assert.equal(a.closed, 1);
  assert.equal(b.closed, 1);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0, maxBytes: 64 * 1024 * 1024, maxEntries: 192, hits: 0, misses: 0 });
});

test("une tuile plus grande que le budget est rejetée sans évincer les entrées valides", () => {
  const cache = createMapTileCache({ maxBytes: 10 });
  const retained = closable(8), oversized = closable(11);
  cache.set("retained", retained);
  assert.equal(cache.set("oversized", oversized), false);
  assert.equal(cache.get("retained"), retained);
  assert.equal(retained.closed, 0);
  assert.equal(oversized.closed, 0);
});

test("la taille des bitmaps est estimée à partir de leurs dimensions", () => {
  const cache = createMapTileCache({ maxBytes: 4096 });
  const bitmap = { width: 16, height: 16, close() {} };
  cache.set("bitmap", bitmap);
  assert.equal(cache.stats().bytes, 1024);
});

test("les statistiques distinguent les accès réussis et manqués", () => {
  const cache = createMapTileCache();
  cache.set("tile", closable(4));
  cache.get("tile"); cache.get("absent");
  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 1);
});


test("une méthode close défaillante ne bloque ni suppression ni éviction", () => {
  const cache = createMapTileCache({ maxEntries: 1, maxBytes: 100 });
  const broken = { byteLength: 8, close() { throw new Error("close failed"); } };
  const next = closable(8);
  assert.equal(cache.set("broken", broken), true);
  assert.equal(cache.delete("broken"), true);
  assert.equal(cache.stats().entries, 0);
  cache.set("first", broken);
  assert.equal(cache.set("next", next), true);
  assert.equal(cache.has("next"), true);
});

test("les tailles négatives et dimensions invalides ne diminuent pas le budget mémoire", () => {
  const cache = createMapTileCache({ maxBytes: 100 });
  cache.set("negative", { byteLength: -50 });
  cache.set("invalid-dimensions", { width: -10, height: 20 });
  assert.equal(cache.stats().bytes, 0);
  assert.equal(cache.stats().entries, 2);
});
