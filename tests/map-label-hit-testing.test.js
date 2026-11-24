import test from "node:test";
import assert from "node:assert/strict";
import { findMapLabelHitAtPoint } from "../src/world/map-label-hit-testing.js";

const hit = (name, bounds) => ({ name, bounds });

test("un point au centre sélectionne le label contenu", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  assert.equal(findMapLabelHitAtPoint([alpha], 10, 10), alpha);
});

test("les quatre bords et les coins sont inclus dans la zone interactive", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  for (const [x, y] of [[0, 10], [20, 10], [10, 0], [10, 20], [0, 0], [20, 20]]) {
    assert.equal(findMapLabelHitAtPoint([alpha], x, y), alpha);
  }
});

test("un point extérieur ne sélectionne aucun label", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  for (const [x, y] of [[-0.01, 10], [20.01, 10], [10, -0.01], [10, 20.01]]) {
    assert.equal(findMapLabelHitAtPoint([alpha], x, y), null);
  }
});

test("les zones superposées conservent la priorité du dernier label composé", () => {
  const bottom = hit("Dessous", { left: 0, right: 30, top: 0, bottom: 30 });
  const top = hit("Dessus", { left: 10, right: 40, top: 10, bottom: 40 });
  assert.equal(findMapLabelHitAtPoint([bottom, top], 20, 20), top);
  assert.equal(findMapLabelHitAtPoint([bottom, top], 5, 5), bottom);
});

test("les coordonnées de pointeur sous forme numérique textuelle sont normalisées", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  assert.equal(findMapLabelHitAtPoint([alpha], "10", "12"), alpha);
});

test("les pointeurs non finis ou non numériques ne ciblent rien", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  for (const [x, y] of [[NaN, 1], [1, Infinity], [undefined, 1], ["x", 1]]) {
    assert.equal(findMapLabelHitAtPoint([alpha], x, y), null);
  }
});

test("les rectangles inversés ou non finis sont ignorés", () => {
  const invalid = [
    hit("Inversé X", { left: 20, right: 0, top: 0, bottom: 20 }),
    hit("Inversé Y", { left: 0, right: 20, top: 20, bottom: 0 }),
    hit("Infini", { left: 0, right: Infinity, top: 0, bottom: 20 }),
    hit("NaN", { left: 0, right: 20, top: NaN, bottom: 20 })
  ];
  for (const item of invalid) assert.equal(findMapLabelHitAtPoint([item], 10, 10), null);
});

test("un rectangle invalide ne masque pas un label valide situé dessous", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  const invalid = hit("Invalide", { left: 30, right: 10, top: 0, bottom: 20 });
  assert.equal(findMapLabelHitAtPoint([alpha, invalid], 10, 10), alpha);
});

test("les entrées absentes ou non tabulaires retournent null", () => {
  assert.equal(findMapLabelHitAtPoint(null, 1, 1), null);
  assert.equal(findMapLabelHitAtPoint({}, 1, 1), null);
  assert.equal(findMapLabelHitAtPoint([], 1, 1), null);
});

test("les labels sans emprise exploitable sont ignorés sans interrompre la recherche", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  assert.equal(findMapLabelHitAtPoint([alpha, { name: "Sans zone" }], 10, 10), alpha);
});
