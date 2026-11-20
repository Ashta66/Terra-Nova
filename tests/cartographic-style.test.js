import test from "node:test";
import assert from "node:assert/strict";
import { getCartographicTheme, listCartographicEras } from "../src/world/cartographic-style.js";

test("1444 utilise une identité d'atlas ancien", () => {
  const theme = getCartographicTheme(1444);
  assert.equal(theme.id, "manuscript");
  assert.equal(theme.texture, "parchment");
});

test("les thèmes progressent vers le numérique et le futur", () => {
  assert.equal(getCartographicTheme(1880).id, "topographic");
  assert.equal(getCartographicTheme(2000).id, "digital");
  assert.equal(getCartographicTheme(2400).id, "future");
});

test("le niveau technologique est borné et la chronologie documentée", () => {
  assert.doesNotThrow(() => getCartographicTheme(1444, 99));
  assert.equal(listCartographicEras().length, 5);
});

test("la transition de palette est progressive à l'approche d'une nouvelle ère", () => {
  const before = getCartographicTheme(1599).colors;
  const boundary = getCartographicTheme(1600).colors;
  const channel = value => parseInt(value.slice(1, 3), 16);
  assert.ok(Math.abs(channel(before.land) - channel(boundary.land)) <= 2);
});
