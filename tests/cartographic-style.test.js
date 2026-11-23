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
  assert.match(css, /body\[data-cartographic-era="present"\][\s\S]*?--theme-accent:\s*#a58d68/);
  assert.match(css, /body\[data-cartographic-era="present"\] \.side-panel[\s\S]*?background-blend-mode:\s*soft-light,\s*normal/);
});


test("1492 utilise un parchemin patiné avec une encre claire et contrastée", () => {
  const parchment = readFileSync(new URL("../assets/textures/parchment.svg", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(parchment, /fill="#92764e"/, "la base du parchemin doit être brun miel");
  assert.match(parchment, /stop-color="#24170f" stop-opacity=".82"/, "les bords doivent porter une patine sombre");
  assert.match(parchment, /baseFrequency=".012 .34"/, "les fibres doivent avoir une structure allongée");
  assert.match(css, /body\[data-cartographic-era="exploration"\] \{[\s\S]*?--theme-text:\s*#f2e5ca/);
  assert.match(css, /body\[data-cartographic-era="exploration"\] \.side-panel,[\s\S]*?background-color:\s*#382b1d/);
  assert.match(css, /body\[data-cartographic-era="exploration"\] \.button-primary/);
  assert.match(css, /\.side-copy,[\s\S]*?color:\s*var\(--theme-muted\)/);
});


test("le HUD cartographique reste décoratif, évolutif et transparent aux interactions", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(html, /class="map-cartographic-overlay" aria-hidden="true"/);
  assert.match(html, /class="map-compass"/);
  assert.match(css, /\.map-cartographic-overlay\s*\{[^}]*pointer-events:\s*none/s);
  for (const era of ["exploration", "westphalia", "modern", "present", "future"]) {
    assert.match(css, new RegExp(`body\\[data-cartographic-era="${era}"\\] \.map-cartographic-overlay`), `habillage de carte absent pour ${era}`);
  }
});

test("les commandes et la frise ont un feedback mécanique accessible", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(css, /\.button:active:not\(:disabled\)[\s\S]*?translateY\(1px\)/);
  assert.match(css, /\.speed-chip\.is-active/);
  assert.match(css, /\.era-milestones button\.is-active/);
  assert.match(css, /#year-scrubber::-webkit-slider-thumb/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});


test("le registre des événements adopte une présentation documentaire selon chaque ère", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(html, /id="ai-era-message" class="chat-message assistant-message"/);
  assert.match(html, /id="event-prompt"/);
  assert.match(css, /\.chat-message::before[\s\S]*?REGISTRE/);
  assert.match(css, /\.chat-preview[\s\S]*?box-shadow:/);
  for (const [era, label] of [
    ["revolution", "GAZETTE"],
    ["modern", "ÉTAT-MAJOR"],
    ["present", "CENTRE DE VEILLE"],
    ["future", "CONSOLE ORBITALE"]
  ]) {
    assert.match(css, new RegExp(`body\\[data-cartographic-era="${era}"\\] \\.chat-message::before[\\s\\S]*?${label}`));
  }
  assert.match(css, /\.chronicle-console::after[\s\S]*?repeating-linear-gradient/);
  assert.match(css, /#year-scrubber[\s\S]*?repeating-linear-gradient/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});


test("le cadre de la carte adopte une matière distincte sans intercepter le canvas", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(css, /\.map-frame::after[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /\.map-frame #world-map\s*\{[^}]*z-index:\s*0/s);
  assert.match(css, /\.map-cartographic-overlay\s*\{[^}]*pointer-events:\s*none/s);
  for (const [era, treatment] of [
    ["exploration", /border:\s*5px double/],
    ["westphalia", /border:\s*5px double/],
    ["revolution", /border-radius:\s*0/],
    ["modern", /border:\s*1px solid/],
    ["present", /border-radius:\s*3px/],
    ["future", /map-frame::after/]
  ]) {
    const start = css.lastIndexOf(`body[data-cartographic-era="${era}"] .map-frame`);
    assert.notEqual(start, -1, `cadre dédié absent pour ${era}`);
    assert.match(css.slice(start, start + 850), treatment, `traitement du cadre absent pour ${era}`);
  }
});


test("les ornements de carte restent discrets pendant l'ère des Révolutions", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(css, /body\\[data-cartographic-era="revolution"\\] \\.map-cartographic-overlay \\{ opacity:\\.?14/);
  assert.match(css, /body\\[data-cartographic-era="revolution"\\] \\.map-cartographic-overlay::before[\\s\\S]*?background:none/);
  assert.match(css, /body\\[data-cartographic-era="revolution"\\] \\.map-compass[\\s\\S]*?opacity:\\.?38/);
  assert.match(css, /body\\.debug-mode \\.map-diagnostics \\{ display:block/);
  assert.match(css, /\\.map-diagnostics \\{ display:none/);
});

test("les variables de thème ne sont réécrites que lors d'un changement d'année et les diagnostics exigent debug=1", () => {
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(js, /new URLSearchParams\\(window\\.location\\.search\\)\\.get\\("debug"\\) === "1"/);
  assert.match(js, /let lastThemeYear = null/);
  assert.match(js, /if \\(lastThemeYear !== year\\) \\{/);
  assert.match(js, /lastThemeYear = year/);
});
