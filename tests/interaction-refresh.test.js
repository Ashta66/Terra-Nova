import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERACTION_PREVIEW_INTERVAL_MS,
  INTERACTION_SETTLE_DELAY_MS
} from "../src/world/interaction-refresh.js";

test("les rendus intermédiaires restent plafonnés pendant les gestes continus", () => {
  assert.equal(INTERACTION_PREVIEW_INTERVAL_MS, 120);
  assert.ok(INTERACTION_PREVIEW_INTERVAL_MS >= 100);
});

test("le rendu final repart rapidement après le dernier mouvement", () => {
  assert.equal(INTERACTION_SETTLE_DELAY_MS, 90);
  assert.ok(INTERACTION_SETTLE_DELAY_MS < INTERACTION_PREVIEW_INTERVAL_MS);
});
