import test from "node:test";
import assert from "node:assert/strict";
import { createMapLabelHitIndex, findMapLabelHitAtPoint } from "../src/world/map-label-hit-testing.js";

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

test("l'index spatial retourne le même label que la recherche linéaire", () => {
  const hits = [
    hit("A", { left: 0, right: 20, top: 0, bottom: 20 }),
    hit("B", { left: 100, right: 130, top: 100, bottom: 130 }),
    hit("C", { left: 10, right: 30, top: 10, bottom: 30 })
  ];
  const index = createMapLabelHitIndex(hits, 32);
  for (const [x, y] of [[5, 5], [15, 15], [25, 25], [110, 110], [80, 80]]) {
    assert.equal(findMapLabelHitAtPoint(hits, x, y, index), findMapLabelHitAtPoint(hits, x, y));
  }
});

test("l'index gère les cellules et coordonnées négatives", () => {
  const alpha = hit("Alpha", { left: -120, right: -80, top: -40, bottom: 10 });
  const hits = [alpha];
  const index = createMapLabelHitIndex(hits, 32);
  assert.equal(findMapLabelHitAtPoint(hits, -100, -10, index), alpha);
  assert.equal(findMapLabelHitAtPoint(hits, -121, -10, index), null);
});

test("une emprise traversant plusieurs cellules reste ciblable", () => {
  const alpha = hit("Alpha", { left: 30, right: 140, top: 30, bottom: 140 });
  const hits = [alpha];
  const index = createMapLabelHitIndex(hits, 32);
  assert.equal(findMapLabelHitAtPoint(hits, 130, 130, index), alpha);
  assert.equal(findMapLabelHitAtPoint(hits, 20, 20, index), null);
});

test("les zones superposées gardent la priorité du dernier label dans l'index", () => {
  const bottom = hit("Dessous", { left: 0, right: 100, top: 0, bottom: 100 });
  const top = hit("Dessus", { left: 40, right: 60, top: 40, bottom: 60 });
  const hits = [bottom, top];
  const index = createMapLabelHitIndex(hits, 24);
  assert.equal(findMapLabelHitAtPoint(hits, 50, 50, index), top);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), bottom);
});

test("les emprises anormalement grandes passent par la liste de débordement", () => {
  const huge = hit("Large", { left: -10000, right: 10000, top: -10000, bottom: 10000 });
  const hits = [huge];
  const index = createMapLabelHitIndex(hits, 16);
  assert.equal(index.overflow.length, 1);
  assert.equal(findMapLabelHitAtPoint(hits, 9999, 9999, index), huge);
});

test("les emprises invalides ne sont pas indexées", () => {
  const invalid = hit("Invalide", { left: 10, right: 0, top: 0, bottom: 10 });
  const hits = [invalid];
  const index = createMapLabelHitIndex(hits);
  assert.equal(index.cells.size, 0);
  assert.equal(findMapLabelHitAtPoint(hits, 5, 5, index), null);
});

test("un index associé à une autre collection déclenche la recherche de secours", () => {
  const original = [hit("Original", { left: 0, right: 20, top: 0, bottom: 20 })];
  const changed = [hit("Changed", { left: 0, right: 20, top: 0, bottom: 20 })];
  const index = createMapLabelHitIndex(original);
  assert.equal(findMapLabelHitAtPoint(changed, 10, 10, index), changed[0]);
});

test("une taille de cellule invalide revient à une grille sûre", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [alpha];
  const index = createMapLabelHitIndex(hits, 0);
  assert.equal(index.cellSize, 96);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), alpha);
});

test("un point dans une cellule vide est rejeté sans parcourir toute la collection", () => {
  const hits = Array.from({ length: 100 }, (_, i) => hit(String(i), {
    left: i * 200, right: i * 200 + 20, top: 0, bottom: 20
  }));
  const index = createMapLabelHitIndex(hits, 64);
  assert.equal(findMapLabelHitAtPoint(hits, 50, 50, index), null);
  assert.equal(index.cells.has("0:0"), true);
});

test("la fusion sans allocation respecte l'ordre entre cellule et débordement", () => {
  const hugeBelow = hit("Large dessous", { left: -10000, right: 10000, top: -10000, bottom: 10000 });
  const localAbove = hit("Local dessus", { left: 10, right: 20, top: 10, bottom: 20 });
  const hits = [hugeBelow, localAbove];
  const index = createMapLabelHitIndex(hits, 16);
  assert.equal(findMapLabelHitAtPoint(hits, 15, 15, index), localAbove);
});

test("un label de débordement dessiné après la cellule reste prioritaire", () => {
  const localBelow = hit("Local dessous", { left: 10, right: 20, top: 10, bottom: 20 });
  const hugeAbove = hit("Large dessus", { left: -10000, right: 10000, top: -10000, bottom: 10000 });
  const hits = [localBelow, hugeAbove];
  const index = createMapLabelHitIndex(hits, 16);
  assert.equal(findMapLabelHitAtPoint(hits, 15, 15, index), hugeAbove);
});

test("les limites exactes d'une cellule sont indexées de façon inclusive", () => {
  const alpha = hit("Alpha", { left: 0, right: 32, top: 0, bottom: 32 });
  const hits = [alpha];
  const index = createMapLabelHitIndex(hits, 32);
  for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
    assert.equal(findMapLabelHitAtPoint(hits, x, y, index), alpha);
  }
});

test("la recherche sans index conserve la priorité du dernier label", () => {
  const first = hit("Premier", { left: 0, right: 20, top: 0, bottom: 20 });
  const last = hit("Dernier", { left: 0, right: 20, top: 0, bottom: 20 });
  assert.equal(findMapLabelHitAtPoint([first, last], 10, 10), last);
});

test("un index incomplet ou mal formé déclenche une recherche linéaire sûre", () => {
  const alpha = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [alpha];
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, { hits, cells: {}, cellSize: 96, overflow: [] }), alpha);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, { hits, cells: new Map(), cellSize: 0, overflow: [] }), alpha);
});


test("les coordonnées extrêmes positives sont déportées sans boucle de cellules", () => {
  const item = hit("Extrême", { left: 1e30, right: 1e30, top: 1e30, bottom: 1e30 });
  const hits = [item], index = createMapLabelHitIndex(hits, 1);
  assert.equal(index.overflow.length, 1);
  assert.equal(findMapLabelHitAtPoint(hits, 1e30, 1e30, index), item);
});

test("les coordonnées extrêmes négatives sont déportées sans perte de ciblage", () => {
  const item = hit("Extrême négatif", { left: -1e30, right: -1e30, top: -1e30, bottom: -1e30 });
  const hits = [item], index = createMapLabelHitIndex(hits, 1);
  assert.equal(index.overflow.length, 1);
  assert.equal(findMapLabelHitAtPoint(hits, -1e30, -1e30, index), item);
});

test("les cellules hors entiers sûrs utilisent le débordement", () => {
  const item = hit("Cellule non sûre", {
    left: Number.MAX_SAFE_INTEGER * 100, right: Number.MAX_SAFE_INTEGER * 100,
    top: 0, bottom: 0
  });
  const hits = [item], index = createMapLabelHitIndex(hits, 1);
  assert.equal(index.overflow.length, 1);
  assert.equal(findMapLabelHitAtPoint(hits, item.bounds.left, 0, index), item);
});

test("une emprise très large mais finie ne provoque pas une explosion de cellules", () => {
  const item = hit("Très large", { left: -1e8, right: 1e8, top: -1e8, bottom: 1e8 });
  const hits = [item], index = createMapLabelHitIndex(hits, 1);
  assert.equal(index.cells.size, 0);
  assert.equal(index.overflow.length, 1);
  assert.equal(findMapLabelHitAtPoint(hits, 0, 0, index), item);
});

test("une cellule de taille sous-normale reste sûre", () => {
  const item = hit("Sous-normal", { left: 1, right: 1, top: 1, bottom: 1 });
  const hits = [item], index = createMapLabelHitIndex(hits, Number.MIN_VALUE);
  assert.equal(index.overflow.length, 1);
  assert.equal(findMapLabelHitAtPoint(hits, 1, 1, index), item);
});

test("un index est invalidé si la collection change de longueur", () => {
  const first = hit("Premier", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [first], index = createMapLabelHitIndex(hits);
  const added = hit("Ajouté", { left: 0, right: 20, top: 0, bottom: 20 });
  hits.push(added);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), added);
});

test("un index reste sûr après retrait d'un label de la collection", () => {
  const first = hit("Premier", { left: 0, right: 20, top: 0, bottom: 20 });
  const last = hit("Dernier", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [first, last], index = createMapLabelHitIndex(hits);
  hits.pop();
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), first);
});

test("les emprises ponctuelles aux intersections de cellules restent indexées", () => {
  const item = hit("Point", { left: 32, right: 32, top: 64, bottom: 64 });
  const hits = [item], index = createMapLabelHitIndex(hits, 32);
  assert.equal(findMapLabelHitAtPoint(hits, 32, 64, index), item);
});

test("un index valide garde l'ordre de dessin avec plusieurs candidats locaux", () => {
  const a = hit("A", { left: 0, right: 30, top: 0, bottom: 30 });
  const b = hit("B", { left: 1, right: 29, top: 1, bottom: 29 });
  const c = hit("C", { left: 2, right: 28, top: 2, bottom: 28 });
  const hits = [a, b, c], index = createMapLabelHitIndex(hits, 64);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), c);
});

test("les tailles de cellule infinies ou négatives reviennent au défaut", () => {
  const item = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  for (const size of [Infinity, -1, NaN]) {
    const hits = [item], index = createMapLabelHitIndex(hits, size);
    assert.equal(index.cellSize, 96);
    assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), item);
  }
});


test("un pointeur extrême avec index actif utilise un repli sûr", () => {
  const item = hit("Extrême", { left: 1e30, right: 1e30, top: 1e30, bottom: 1e30 });
  const hits = [item], index = createMapLabelHitIndex(hits, 96);
  assert.equal(findMapLabelHitAtPoint(hits, 1e30, 1e30, index), item);
});

test("un pointeur négatif extrême avec index actif conserve le ciblage", () => {
  const item = hit("Extrême négatif", { left: -1e30, right: -1e30, top: -1e30, bottom: -1e30 });
  const hits = [item], index = createMapLabelHitIndex(hits, 96);
  assert.equal(findMapLabelHitAtPoint(hits, -1e30, -1e30, index), item);
});

test("les indices de bucket hors collection sont ignorés sans exception", () => {
  const item = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [item];
  const index = { hits, hitCount: 1, cellSize: 96, cells: new Map([["0:0", [99]]]), overflow: [] };
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), null);
});

test("les indices de débordement mal formés sont ignorés", () => {
  const item = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [item];
  const index = { hits, hitCount: 1, cellSize: 96, cells: new Map(), overflow: [99, -1, NaN] };
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), null);
});

test("un index valide ne perd pas les labels locaux derrière un bucket vide", () => {
  const item = hit("Alpha", { left: 100, right: 120, top: 100, bottom: 120 });
  const hits = [item], index = createMapLabelHitIndex(hits, 32);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), null);
  assert.equal(findMapLabelHitAtPoint(hits, 110, 110, index), item);
});

test("la recherche indexée conserve l'ordre après alternance local-débordement-local", () => {
  const a = hit("A", { left: 0, right: 20, top: 0, bottom: 20 });
  const huge = hit("Large", { left: -10000, right: 10000, top: -10000, bottom: 10000 });
  const c = hit("C", { left: 5, right: 25, top: 5, bottom: 25 });
  const hits = [a, huge, c], index = createMapLabelHitIndex(hits, 16);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), c);
});

test("une grille à taille fractionnaire conserve l'équivalence linéaire", () => {
  const hits = [
    hit("A", { left: -4.5, right: 3.25, top: -8.5, bottom: 2.75 }),
    hit("B", { left: 3.25, right: 19.5, top: 2.75, bottom: 20.25 })
  ];
  const index = createMapLabelHitIndex(hits, 2.5);
  for (const [x, y] of [[-4.5, -8.5], [3.25, 2.75], [19.5, 20.25], [0, 0], [30, 30]]) {
    assert.equal(findMapLabelHitAtPoint(hits, x, y, index), findMapLabelHitAtPoint(hits, x, y));
  }
});

test("une collection vide produit un index vide interrogeable", () => {
  const hits = [], index = createMapLabelHitIndex(hits);
  assert.equal(index.hitCount, 0);
  assert.equal(findMapLabelHitAtPoint(hits, 0, 0, index), null);
});

test("la recherche indexée et linéaire restent équivalentes sur un jeu déterministe", () => {
  let seed = 73421;
  const random = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const hits = Array.from({ length: 180 }, (_, i) => {
    const left = Math.round((random() - 0.5) * 2400);
    const top = Math.round((random() - 0.5) * 1600);
    const width = 2 + Math.round(random() * 180);
    const height = 2 + Math.round(random() * 100);
    return hit(String(i), { left, right: left + width, top, bottom: top + height });
  });
  const index = createMapLabelHitIndex(hits, 48);
  for (let i = 0; i < 600; i++) {
    const x = (random() - 0.5) * 2800;
    const y = (random() - 0.5) * 2000;
    assert.equal(findMapLabelHitAtPoint(hits, x, y, index), findMapLabelHitAtPoint(hits, x, y));
  }
});

test("une mutation de longueur invalide l'index même avec des labels superposés", () => {
  const first = hit("Premier", { left: 0, right: 40, top: 0, bottom: 40 });
  const hits = [first], index = createMapLabelHitIndex(hits);
  const second = hit("Second", { left: 0, right: 40, top: 0, bottom: 40 });
  hits.push(second);
  assert.equal(findMapLabelHitAtPoint(hits, 20, 20, index), second);
});


test("un bucket local mal formé déclenche le repli linéaire", () => {
  const item = hit("Alpha", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [item];
  const index = { hits, hitCount: 1, cellSize: 96, cells: new Map([["0:0", { 0: 0, length: 1 }]]), overflow: [] };
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), item);
});

test("un bucket absent ne masque pas un label placé dans une autre cellule", () => {
  const item = hit("Alpha", { left: 100, right: 120, top: 100, bottom: 120 });
  const hits = [item], index = createMapLabelHitIndex(hits, 32);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), null);
  assert.equal(findMapLabelHitAtPoint(hits, 110, 110, index), item);
});

test("une nouvelle collection de même longueur invalide le snapshot précédent", () => {
  const oldHit = hit("Ancien", { left: 0, right: 20, top: 0, bottom: 20 });
  const newHit = hit("Nouveau", { left: 0, right: 20, top: 0, bottom: 20 });
  const oldHits = [oldHit], newHits = [newHit];
  const oldIndex = createMapLabelHitIndex(oldHits);
  assert.equal(oldHits.length, newHits.length);
  assert.equal(findMapLabelHitAtPoint(newHits, 10, 10, oldIndex), newHit);
});

test("la construction ignore une emprise source devenue invalide", () => {
  const valid = hit("Valide", { left: 0, right: 20, top: 0, bottom: 20 });
  const invalid = hit("Invalide", { left: 30, right: 10, top: 0, bottom: 20 });
  const hits = [valid, invalid], index = createMapLabelHitIndex(hits);
  assert.equal(index.cells.get("0:0").length, 1);
  assert.equal(findMapLabelHitAtPoint(hits, 15, 15, index), valid);
});

test("les indices invalides ne bloquent pas les candidats plus anciens", () => {
  const older = hit("Ancien", { left: 0, right: 20, top: 0, bottom: 20 });
  const newer = hit("Récent", { left: 0, right: 20, top: 0, bottom: 20 });
  const hits = [older, newer];
  const index = { hits, hitCount: 2, cellSize: 96, cells: new Map([["0:0", [0, 99]]]), overflow: [] };
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), older);
});

test("une collection reconstruite à l'identique conserve la priorité supérieure", () => {
  const oldHits = [hit("Ancien", { left: 0, right: 20, top: 0, bottom: 20 })];
  const index = createMapLabelHitIndex(oldHits);
  const nextHits = [
    hit("Dessous", { left: 0, right: 20, top: 0, bottom: 20 }),
    hit("Dessus", { left: 0, right: 20, top: 0, bottom: 20 })
  ];
  assert.equal(findMapLabelHitAtPoint(nextHits, 10, 10, index), nextHits[1]);
});

test("les bornes non finies ne sont pas publiées dans un index", () => {
  const invalid = hit("Infini", { left: 0, right: Infinity, top: 0, bottom: 20 });
  const hits = [invalid], index = createMapLabelHitIndex(hits);
  assert.equal(index.cells.size, 0);
  assert.equal(index.overflow.length, 0);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), null);
});

test("les rectangles dégénérés restent ciblables sur leur ligne", () => {
  const item = hit("Ligne", { left: 0, right: 20, top: 10, bottom: 10 });
  const hits = [item], index = createMapLabelHitIndex(hits);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), item);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10.01, index), null);
});

test("les rectangles dégénérés restent ciblables sur leur colonne", () => {
  const item = hit("Colonne", { left: 10, right: 10, top: 0, bottom: 20 });
  const hits = [item], index = createMapLabelHitIndex(hits);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), item);
  assert.equal(findMapLabelHitAtPoint(hits, 10.01, 10, index), null);
});

test("le snapshot indexé conserve la référence exacte de la collection publiée", () => {
  const hits = [hit("Publié", { left: 0, right: 20, top: 0, bottom: 20 })];
  const index = createMapLabelHitIndex(hits);
  assert.equal(index.hits, hits);
  assert.equal(index.hitCount, hits.length);
  assert.equal(findMapLabelHitAtPoint(hits, 10, 10, index), hits[0]);
});
