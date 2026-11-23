import test from "node:test";
import assert from "node:assert/strict";
import { getCartographicTheme, listCartographicEras } from "../src/world/cartographic-style.js";

test("1444 utilise une identité d'atlas ancien", () => {
  const theme = getCartographicTheme(1444);
  assert.equal(theme.id, "exploration");
  assert.equal(theme.texture, "parchment");
});

test("les thèmes progressent vers le numérique et le futur", () => {
  assert.equal(getCartographicTheme(1880).id, "revolution");
  assert.equal(getCartographicTheme(2000).id, "modern");
  assert.equal(getCartographicTheme(2400).id, "future");
});

test("le niveau technologique est borné et la chronologie documentée", () => {
  assert.doesNotThrow(() => getCartographicTheme(1444, 99));
  assert.equal(listCartographicEras().length, 6);
});

test("la transition de palette est progressive à l'approche d'une nouvelle ère", () => {
  const before = getCartographicTheme(1599).colors;
  const boundary = getCartographicTheme(1600).colors;
  const channel = value => parseInt(value.slice(1, 3), 16);
  assert.ok(Math.abs(channel(before.land) - channel(boundary.land)) <= 2);
});

test("les six ères historiques de Terra Nova sont définies aux dates prévues", () => {
  const eras = listCartographicEras();
  assert.equal(eras.length, 6);
  assert.deepEqual(eras.map(era => era.from), [1492, 1648, 1789, 1914, 2026, 2100]);
  assert.deepEqual(
    [1492, 1648, 1789, 1914, 2026, 2100].map(year => getCartographicTheme(year).id),
    ["exploration", "westphalia", "revolution", "modern", "present", "future"]
  );
});

test("chaque ère expose une identité typographique et un intitulé d'interface", () => {
  for (const year of [1492, 1648, 1789, 1914, 2026, 2100]) {
    const theme = getCartographicTheme(year);
    assert.ok(theme.typography?.display, `police de titre manquante pour ${year}`);
    assert.ok(theme.typography?.body, `police de texte manquante pour ${year}`);
    assert.ok(theme.interfaceTitle, `intitulé d'interface manquant pour ${year}`);
    assert.ok(theme.interfaceSubtitle, `sous-titre d'interface manquant pour ${year}`);
  }
});

test("chaque ère expose ses paramètres visuels d'interface et de carte", () => {
  for (const year of [1492, 1648, 1789, 1914, 2026, 2100]) {
    const theme = getCartographicTheme(year);
    assert.ok(Number.isFinite(theme.visuals?.borderRadius), `arrondi manquant pour ${year}`);
    assert.ok(theme.visuals?.mapFilter, `filtre cartographique manquant pour ${year}`);
    assert.ok(theme.visuals?.surface, `style de surface manquant pour ${year}`);
  }
});


test("les ères exposent une matière visuelle distincte et le futur reste peu lumineux", () => {
  const expectedMaterials = ["parchment", "vellum", "newsprint", "military", "glass", "obsidian"];
  const eras = [1492, 1648, 1789, 1914, 2026, 2100].map(year => getCartographicTheme(year));
  assert.deepEqual(eras.map(theme => theme.visuals?.material), expectedMaterials);
  const future = eras.at(-1);
  const luminance = hex => {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  assert.ok(luminance(future.colors.surface) < 0.012, "la surface future doit rester presque noire");
  assert.ok(luminance(future.colors.panel) < 0.025, "les panneaux futurs doivent rester très sombres");
  assert.equal(future.visuals.mapFilter, "none", "le futur ne doit pas éclaircir la carte par un filtre de contraste");
});
