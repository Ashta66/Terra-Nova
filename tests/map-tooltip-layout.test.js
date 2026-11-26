import test from "node:test";
import assert from "node:assert/strict";
import { getMapTooltipPosition, formatMapTooltipCoordinates, getMapTooltipDescriptor } from "../src/world/map-tooltip-layout.js";

test("le tooltip se place à droite et sous le pointeur dans l'espace libre", () => {
  assert.deepEqual(getMapTooltipPosition(20, 20, 500, 300, 120, 40), {
    left: 34, top: 34, maxWidth: 484, maxHeight: 284
  });
});

test("le tooltip bascule à gauche lorsqu'il atteint le bord droit", () => {
  const position = getMapTooltipPosition(450, 100, 500, 300, 120, 40);
  assert.equal(position.left, 316);
  assert.equal(position.top, 114);
});

test("le tooltip bascule au-dessus lorsqu'il atteint le bord inférieur", () => {
  const position = getMapTooltipPosition(100, 270, 500, 300, 120, 40);
  assert.equal(position.left, 114);
  assert.equal(position.top, 216);
});

test("le tooltip est ramené dans le cadre au coin inférieur droit", () => {
  const position = getMapTooltipPosition(499, 299, 500, 300, 180, 80);
  assert.equal(position.left, 305);
  assert.equal(position.top, 205);
});

test("un tooltip plus large que le cadre reçoit une largeur maximale", () => {
  const position = getMapTooltipPosition(10, 10, 200, 120, 500, 60);
  assert.equal(position.maxWidth, 184);
  assert.ok(position.left >= 8);
  assert.ok(position.left + position.maxWidth <= 192);
});

test("un tooltip plus haut que le cadre reçoit une hauteur maximale", () => {
  const position = getMapTooltipPosition(10, 10, 200, 120, 80, 500);
  assert.equal(position.maxHeight, 104);
  assert.ok(position.top >= 8);
  assert.ok(position.top + position.maxHeight <= 112);
});

test("des dimensions non finies ou négatives sont refusées", () => {
  assert.equal(getMapTooltipPosition(NaN, 10, 200, 120, 80, 40), null);
  assert.equal(getMapTooltipPosition(10, 10, Infinity, 120, 80, 40), null);
  assert.equal(getMapTooltipPosition(10, 10, 200, 120, -1, 40), null);
});

test("les marges et décalages personnalisés sont normalisés", () => {
  const position = getMapTooltipPosition(20, 20, 300, 200, 80, 30, { margin: 12, offset: 6 });
  assert.equal(position.left, 26);
  assert.equal(position.top, 26);
});

test("les coordonnées géographiques valides sont formatées latitude puis longitude", () => {
  assert.equal(formatMapTooltipCoordinates([2.3522, 48.8566]), "48.86°, 2.35°");
});

test("les coordonnées absentes, non finies ou hors domaine sont rejetées", () => {
  for (const value of [null, [], [1], [Infinity, 0], [181, 0], [0, -91], ["x", 2]]) {
    assert.equal(formatMapTooltipCoordinates(value), null);
  }
});

test("le descripteur fournit un titre de remplacement et une catégorie", () => {
  assert.deepEqual(getMapTooltipDescriptor({ kind: "city" }, false, null, { city: "Ville" }), {
    key: "|city|Lieu sans nom|false||Ville · Cliquez pour afficher les coordonnées",
    title: "Lieu sans nom",
    subtitle: "Ville · Cliquez pour afficher les coordonnées",
    detail: "",
    selected: false,
    campaign: false
  });
});

test("le descripteur sélectionné affiche les coordonnées validées", () => {
  const result = getMapTooltipDescriptor({ id: "paris", name: "Paris", kind: "city", coordinates: [2.35, 48.86] }, true, null, { city: "Ville" });
  assert.equal(result.title, "Paris");
  assert.equal(result.subtitle, "Ville · 48.86°, 2.35°");
  assert.equal(result.selected, true);
});

test("les coordonnées invalides produisent un texte de remplacement", () => {
  const result = getMapTooltipDescriptor({ name: "Inconnu", kind: "sea", coordinates: [500, 0] }, true);
  assert.match(result.subtitle, /Coordonnées indisponibles/);
});

test("les détails d'une nation jouable sont assemblés sans HTML", () => {
  const result = getMapTooltipDescriptor({ name: "France", kind: "country" }, false, { rank: "1", region: "Europe", difficulty: 3 });
  assert.equal(result.detail, "1 · Europe · Difficulté 3/5");
  assert.equal(result.campaign, true);
});

test("les détails d'une campagne tolèrent les métadonnées partielles", () => {
  const result = getMapTooltipDescriptor({ name: "France", kind: "country" }, true, { rank: "1", region: "Europe" });
  assert.equal(result.detail, "1 · Europe");
  assert.equal(result.subtitle, "Nation sélectionnée");
});

test("le descripteur est stable pour le même contenu", () => {
  const label = { id: "x", name: "Paris", kind: "city", coordinates: [2, 48] };
  assert.equal(getMapTooltipDescriptor(label).key, getMapTooltipDescriptor(label).key);
});

test("le descripteur change lorsque le label ou son état change", () => {
  const label = { id: "x", name: "Paris", kind: "city", coordinates: [2, 48] };
  assert.notEqual(getMapTooltipDescriptor(label, false).key, getMapTooltipDescriptor(label, true).key);
  assert.notEqual(getMapTooltipDescriptor(label).key, getMapTooltipDescriptor({ ...label, name: "Lyon" }).key);
});

test("un label absent ne produit aucun descripteur", () => {
  assert.equal(getMapTooltipDescriptor(null), null);
  assert.equal(getMapTooltipDescriptor(undefined), null);
});

test("les noms de catégories inconnus restent lisibles", () => {
  const result = getMapTooltipDescriptor({ name: "Objet", kind: "unknown-kind" });
  assert.equal(result.subtitle, "Lieu · Cliquez pour afficher les coordonnées");
});

test("le titre est nettoyé et les chaînes vides sont remplacées", () => {
  const result = getMapTooltipDescriptor({ name: "  ", kind: "country" });
  assert.equal(result.title, "Lieu sans nom");
});
