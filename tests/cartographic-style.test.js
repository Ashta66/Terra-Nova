import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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


test("les ères moderne et contemporaine restent sombres à partir de 2000", () => {
  const luminance = hex => {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  for (const year of [2000, 2004, 2015, 2025, 2026]) {
    const theme = getCartographicTheme(year);
    assert.ok(luminance(theme.colors.surface) < 0.03, `surface trop claire en ${year}: ${theme.colors.surface}`);
    assert.ok(luminance(theme.colors.panel) < 0.06, `panneau trop clair en ${year}: ${theme.colors.panel}`);
  }
  assert.equal(getCartographicTheme(2000).id, "modern");
  assert.equal(getCartographicTheme(2026).id, "present");
});


test("chaque ère possède une finition d'interface dédiée sans animation décorative", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  for (const era of ["exploration", "westphalia", "revolution", "modern", "present", "future"]) {
    assert.match(css, new RegExp(`body\\[data-cartographic-era="${era}"\\] \\.era-banner`), `bannière dédiée absente pour ${era}`);
    assert.match(css, new RegExp(`body\\[data-cartographic-era="${era}"\\] \\.map-frame`), `cadre cartographique dédié absent pour ${era}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});


test("chaque ère applique une texture de matière perceptible aux surfaces d'interface", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  const textures = {
    exploration: /--material-texture-exploration:/,
    westphalia: /--material-texture-westphalia:/,
    revolution: /--material-texture-revolution:/,
    modern: /--material-texture-modern:/,
    present: /--material-texture-present:/,
    future: /--material-texture-future:/
  };
  for (const [era, pattern] of Object.entries(textures)) {
    assert.match(css, pattern, `texture de matière absente pour ${era}`);
    assert.match(
      css,
      new RegExp(`body\\[data-cartographic-era="${era}"\\] \\.side-panel[^}]*background-image:`),
      `texture non appliquée aux panneaux pour ${era}`
    );
  }
  assert.match(css, /background-blend-mode:\s*(?:soft-light|overlay|multiply)/);
});


test("les textures de matière sont de vrais assets organiques et non des motifs CSS linéaires", () => {
  const materials = ["parchment", "vellum", "newsprint", "military", "glass", "obsidian"];
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  for (const material of materials) {
    const svg = readFileSync(new URL(`../assets/textures/${material}.svg`, import.meta.url), "utf8");
    assert.match(svg, /<feTurbulence/, `grain organique absent pour ${material}`);
    assert.match(css, new RegExp(`assets/textures/${material}\\.svg`), `texture non reliée au thème ${material}`);
  }
});


test("theme 2040 : graphite sombre et accents non électriques", () => {
  const theme = getCartographicTheme(2040);
  assert.equal(theme.id, "present");
  assert.equal(theme.colors.accent, "#a58d68");
  assert.equal(theme.colors.surface, "#080e12");
  assert.equal(theme.colors.panel, "#111a20");
  assert.equal(theme.visuals.material, "glass");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(css, /data-cartographic-era="present"[\s\S]*?--theme-accent:\s*#a58d68/);
  assert.match(css, /data-cartographic-era="present"[\s\S]*?background-blend-mode:\s*soft-light,\s*normal/);
});
