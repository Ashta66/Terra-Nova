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

test("réinsérer la même ressource ne la ferme pas", () => {
  const cache = createMapTileCache();
  const tile = closable(8);
  cache.set("tile", tile);
  assert.equal(cache.set("tile", tile), true);
  assert.equal(tile.closed, 0);
  assert.equal(cache.stats().bytes, 8);
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
  assert.equal(cache.stats().entries, 0);
  assert.equal(cache.stats().bytes, 0);
  assert.equal(cache.stats().hits, 0);
  assert.equal(cache.stats().misses, 0);
});

test("dispose est idempotent et ferme les ressources restantes", () => {
  const cache = createMapTileCache();
  const tile = closable(8);
  cache.set("tile", tile);
  cache.dispose();
  cache.dispose();
  assert.equal(tile.closed, 1);
  assert.equal(cache.stats().entries, 0);
  assert.equal(cache.stats().bytes, 0);
});

test("une tuile plus grande que le budget est rejetée et fermée sans évincer les entrées valides", () => {
  const cache = createMapTileCache({ maxBytes: 10 });
  const retained = closable(8), oversized = closable(11);
  cache.set("retained", retained);
  assert.equal(cache.set("oversized", oversized), false);
  assert.equal(cache.get("retained"), retained);
  assert.equal(retained.closed, 0);
  assert.equal(oversized.closed, 1);
});

test("les tailles inconnues, nulles, négatives et non finies sont rejetées", () => {
  const cache = createMapTileCache({ maxBytes: 100 });
  const invalid = [
    { byteLength: -50, close() { this.closed = true; } },
    { byteLength: 0, close() { this.closed = true; } },
    { width: -10, height: 20, close() { this.closed = true; } },
    { width: 1e308, height: 1e308, close() { this.closed = true; } },
    { close() { this.closed = true; } }
  ];
  for (let i = 0; i < invalid.length; i++) assert.equal(cache.set("invalid-" + i, invalid[i]), false);
  assert.equal(invalid.every(value => value.closed === true), true);
  assert.deepEqual(cache.stats().entries, 0);
  assert.deepEqual(cache.stats().bytes, 0);
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

test("les évictions notifient leur cause sans bloquer le cache si le callback échoue", () => {
  const events = [];
  const cache = createMapTileCache({
    maxEntries: 1, maxBytes: 100,
    onEvict(key, value, reason) {
      events.push([key, value.byteLength, reason]);
      if (key === "first") throw new Error("observer failed");
    }
  });
  const first = closable(8), second = closable(9);
  cache.set("first", first);
  cache.set("second", second);
  assert.deepEqual(events, [["first", 8, "capacity"]]);
  assert.equal(first.closed, 1);
  assert.equal(cache.has("second"), true);
});

test("la suppression explicite et clear exposent des causes distinctes", () => {
  const events = [];
  const cache = createMapTileCache({ onEvict: (key, value, reason) => events.push([key, reason]) });
  cache.set("a", closable(8));
  cache.set("b", closable(8));
  cache.delete("a");
  cache.clear();
  assert.deepEqual(events, [["a", "delete"], ["b", "clear"]]);
});

test("le cache expose son pic mémoire et ses évictions par cause", () => {
  const cache = createMapTileCache({ maxEntries: 1, maxBytes: 100 });
  cache.set("a", closable(10));
  cache.set("b", closable(20));
  const stats = cache.stats();
  assert.equal(stats.peakBytes, 30);
  assert.equal(stats.evictions, 1);
  assert.equal(stats.evictionReasons.capacity, 1);
  assert.equal(stats.bytes, 20);
});
test("les limites peuvent être réduites à chaud et évacuent les plus anciennes entrées", () => {
  const cache = createMapTileCache({ maxEntries: 4, maxBytes: 100 });
  const a = closable(10), b = closable(20), c = closable(30);
  cache.set("a", a); cache.set("b", b); cache.set("c", c);
  assert.deepEqual(cache.setLimits({ maxEntries: 2, maxBytes: 45 }), { maxBytes: 45, maxEntries: 2 });
  assert.equal(cache.has("a"), false);
  assert.equal(a.closed, 1);
  assert.equal(cache.stats().bytes, 30);
  assert.equal(cache.stats().entries, 1);
});
test("les limites invalides ne corrompent pas le budget actif", () => {
  const cache = createMapTileCache({ maxEntries: 3, maxBytes: 100 });
  assert.deepEqual(cache.setLimits({ maxEntries: 0, maxBytes: NaN }), { maxBytes: 100, maxEntries: 3 });
});
test("les insertions après dispose sont rejetées et immédiatement fermées", () => {
  const cache = createMapTileCache();
  const tile = closable(8);
  cache.dispose();
  assert.equal(cache.set("late", tile), false);
  assert.equal(tile.closed, 1);
  assert.equal(cache.has("late"), false);
  assert.equal(cache.stats().disposed, true);
});
test("dispose ferme une seule fois et reste définitif", () => {
  const cache = createMapTileCache();
  const tile = closable(8);
  cache.set("tile", tile);
  cache.dispose(); cache.dispose();
  assert.equal(tile.closed, 1);
  assert.equal(cache.stats().disposed, true);
});
test("les rejets et fermetures sont comptabilisés", () => {
  const cache = createMapTileCache({ maxBytes: 10 });
  const tile = closable(11);
  assert.equal(cache.set("large", tile), false);
  assert.equal(cache.stats().rejected, 1);
  assert.equal(cache.stats().closeCalls, 1);
});
test("le remplacement renseigne la cause et conserve une seule entrée", () => {
  const cache = createMapTileCache();
  cache.set("key", closable(10));
  cache.set("key", closable(20));
  assert.equal(cache.stats().evictionReasons.replace, 1);
  assert.equal(cache.stats().entries, 1);
  assert.equal(cache.stats().bytes, 20);
});
test("le vidage conserve le cumul des évictions mais réinitialise les accès", () => {
  const cache = createMapTileCache();
  cache.set("key", closable(10));
  cache.get("key"); cache.get("missing");
  cache.clear();
  assert.equal(cache.stats().evictionReasons.clear, 1);
  assert.equal(cache.stats().hits, 0);
  assert.equal(cache.stats().misses, 0);
});
test("une ressource close défaillante reste comptée sans interrompre le nettoyage", () => {
  const cache = createMapTileCache();
  const tile = { byteLength: 8, close() { throw new Error("close"); } };
  cache.set("tile", tile);
  assert.equal(cache.delete("tile"), true);
  assert.equal(cache.stats().closedResources, 1);
  assert.equal(cache.stats().entries, 0);
});
test("le pic mémoire reste historique après une réduction des limites", () => {
  const cache = createMapTileCache({ maxBytes: 100 });
  cache.set("a", closable(40));
  cache.set("b", closable(40));
  cache.setLimits({ maxBytes: 40 });
  assert.equal(cache.stats().peakBytes, 80);
  assert.equal(cache.stats().bytes, 40);
});
