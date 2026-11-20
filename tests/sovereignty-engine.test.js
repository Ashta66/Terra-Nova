import test from "node:test";
import assert from "node:assert/strict";
import {
  createSovereigntyState, appendSovereigntyEvent, getSovereigntyAtYear,
  getSovereigntyVisual
} from "../src/world/sovereignty-engine.js";

const countries = [
  { id: "fr", name: "France", color: "#3159A6" },
  { id: "en", name: "Angleterre", color: "#B83A43" },
  { id: "br", name: "Bretagne", color: "#3D805B" }
];
const base = () => createSovereigntyState({
  countries,
  regions: [
    { regionId: "normandy", status: "sovereign", controllerId: "en" },
    { regionId: "brittany", status: "unclaimed" }
  ]
});

test("l'état politique est indépendant des géométries et ne contient que des identifiants de régions", () => {
  const state = base();
  assert.deepEqual(Object.keys(state.baseline[0]).sort(), ["claimants", "controllerId", "influence", "regionId", "status"]);
  assert.equal("geometry" in state.baseline[0], false);
});

test("rejoue les transferts historiques à la date demandée sans modifier la base", () => {
  const state = appendSovereigntyEvent(base(), {
    id: "treaty-1204", year: 1204, type: "transfer-control",
    regionId: "normandy", fromCountryId: "en", toCountryId: "fr",
    cause: "Traité"
  });
  assert.equal(getSovereigntyAtYear(state, 1203).regions[0].controllerId, "en");
  assert.equal(getSovereigntyAtYear(state, 1204).regions[0].controllerId, "fr");
  assert.equal(state.baseline[0].controllerId, "en");
});

test("un ajout de revendication crée un statut contesté sans effacer le contrôleur", () => {
  const state = appendSovereigntyEvent(base(), {
    id: "claim-1", year: 1450, type: "add-claim", regionId: "normandy", countryId: "fr"
  });
  const region = getSovereigntyAtYear(state, 1450).regions[0];
  assert.equal(region.status, "contested");
  assert.equal(region.controllerId, "en");
  assert.deepEqual(region.claimants, ["fr"]);
});

test("une zone d'influence conserve la couleur du pays et son intensité", () => {
  const state = appendSovereigntyEvent(base(), {
    id: "influence-1", year: 1500, type: "set-influence",
    regionId: "brittany", countryId: "fr", strength: 0.7
  });
  const region = getSovereigntyAtYear(state, 1500).regions[1];
  const visual = getSovereigntyVisual(region, countries);
  assert.equal(region.status, "influence");
  assert.equal(visual.color, "#3159A6");
  assert.equal(visual.influenceColors[0].strength, 0.7);
  assert.equal(visual.fillOpacity, 0.23);
});

test("le statut sans souveraineté ne signifie pas absence de géographie", () => {
  const region = getSovereigntyAtYear(base(), 1444).regions[1];
  assert.equal(region.status, "unclaimed");
  assert.equal(region.controllerId, null);
});

test("les événements sont rejoués chronologiquement même ajoutés dans le désordre", () => {
  let state = appendSovereigntyEvent(base(), {
    id: "late", year: 1600, type: "transfer-control", regionId: "normandy", toCountryId: "br"
  });
  state = appendSovereigntyEvent(state, {
    id: "early", year: 1500, type: "transfer-control", regionId: "normandy", toCountryId: "fr"
  });
  assert.equal(getSovereigntyAtYear(state, 1550).regions[0].controllerId, "fr");
  assert.equal(getSovereigntyAtYear(state, 1650).regions[0].controllerId, "br");
});

test("rejette les événements qui référencent une région ou un pays inconnu", () => {
  assert.throws(() => appendSovereigntyEvent(base(), {
    id: "bad", year: 1500, type: "transfer-control", regionId: "missing", toCountryId: "fr"
  }), /Région politique inconnue/);
  assert.throws(() => appendSovereigntyEvent(base(), {
    id: "bad-country", year: 1500, type: "transfer-control", regionId: "normandy", toCountryId: "xx"
  }), /Pays inconnu/);
});

test("les quatre statuts conservent une couleur et une signature visuelle distincte", () => {
  const state = base();
  const sovereign = getSovereigntyVisual(getSovereigntyAtYear(state, 1444).regions[0], countries);
  const unclaimed = getSovereigntyVisual(getSovereigntyAtYear(state, 1444).regions[1], countries);
  assert.equal(sovereign.color, "#B83A43");
  assert.equal(sovereign.fillOpacity, 0.64);
  assert.equal(unclaimed.status, "unclaimed");
  assert.ok(unclaimed.fillOpacity < sovereign.fillOpacity);
});
