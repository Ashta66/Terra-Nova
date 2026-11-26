import test from "node:test";
import assert from "node:assert/strict";
import { shouldRenderMapAfterClockAdvance } from "../src/core/simulation-frame-policy.js";

test("ne redessine pas la carte à chaque jour si l'année et le monde physique restent identiques", () => {
  const world = { revision: 4 };
  assert.equal(shouldRenderMapAfterClockAdvance("1900-01-01", "1900-01-02", world, world), false);
});

test("redessine la carte au changement d'année pour actualiser les frontières historiques", () => {
  const world = { revision: 4 };
  assert.equal(shouldRenderMapAfterClockAdvance("1900-12-31", "1901-01-01", world, world), true);
});

test("redessine la carte lorsqu'un effet physique expire et remplace le monde", () => {
  const before = { revision: 4 };
  const after = { revision: 5 };
  assert.equal(shouldRenderMapAfterClockAdvance("1900-04-01", "1900-04-02", before, after), true);
});
