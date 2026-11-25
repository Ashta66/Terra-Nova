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
    const selector = new RegExp(`body\\[data-cartographic-era="${era}"\\]\\s+\\.map-frame`, "g");
    const matches = [...css.matchAll(selector)];
    assert.ok(matches.length, `cadre dédié absent pour ${era}`);
    assert.ok(matches.some(match => treatment.test(css.slice(match.index, match.index + 850))),
      `traitement du cadre absent pour ${era}`);
  }
});


test("les ères 1789–1913 ne superposent pas de points rouges ni de grille carrée à la carte", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  const modern = css.match(/body\[data-cartographic-era="modern"\] \.map-cartographic-overlay::before \{([^}]*)\}/);
  assert.ok(modern, "cadre cartographique moderne présent");
  assert.match(modern[1], /background:\s*none/);
  assert.doesNotMatch(modern[1], /repeating-linear-gradient/);
  assert.doesNotMatch(css, /body\[data-cartographic-era="revolution"\] \.map-frame::after\s*\{[^}]*radial-gradient/);
});

test("le thème reste mis à jour par année et la progression de la frise suit la date simulée", () => {
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(js, /let lastThemeYear = null/);
  assert.match(js, /if \(lastThemeYear !== year\) \{/);
  assert.match(js, /lastThemeYear = year/);
  assert.match(js, /--timeline-progress/);
  assert.match(css, /--timeline-progress/);
  assert.match(css, /#year-scrubber:focus-visible/);
  assert.doesNotMatch(js, /debugMode|debug-mode|URLSearchParams\(window\.location\.search\)/);
});

test("le curseur de date de création de campagne possède son propre style tactile et sa progression", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(css, /\.setup-date input::-webkit-slider-runnable-track/);
  assert.match(css, /\.setup-date input::-webkit-slider-thumb/);
  assert.match(css, /--start-year-progress/);
  assert.match(js, /function updateStartYearSliderProgress\(\)/);
  assert.match(js, /startYearSlider\.addEventListener\("input"/);
  assert.match(js, /updateStartYearSliderProgress\(\);/);
});


test("le HUD expose des finitions tactiles cohérentes sur ses commandes et ses panneaux", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(css, /\.topbar\s*\{[^}]*inset 0 1px 0/s);
  assert.match(css, /\.brand-mark::after\s*\{[^}]*pointer-events:none/s);
  assert.match(css, /\.side-panel::-webkit-scrollbar-thumb/);
  assert.match(css, /\.date-display\s*\{[^}]*font-variant-numeric:tabular-nums/s);
  assert.match(css, /\.country-result\.is-selected\s*\{[^}]*inset 3px 0 var\(--theme-accent\)/s);
  assert.match(css, /\.country-selected\s*\{[^}]*box-shadow:/s);
  assert.match(css, /\.map-stage-heading\s*\{[^}]*border-bottom:/s);
  assert.match(css, /\.map-tools \.map-tool:active\s*\{[^}]*translateY\(1px\)/s);
  assert.match(css, /\.map-zoom-level\s*\{[^}]*font-variant-numeric:tabular-nums/s);
  assert.match(css, /\.map-tooltip\s*\{[^}]*backdrop-filter:blur\(10px\)/s);
  assert.match(css, /\.map-legend i\s*\{[^}]*box-shadow:/s);
  assert.match(css, /\.map-data-button:active:not\(:disabled\)\s*\{[^}]*translateY\(1px\)/s);
});

test("les finitions du HUD respectent les matériaux d'époque et la réduction des animations", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(css, /color-mix\(in srgb,var\(--theme-accent\)/);
  assert.match(css, /background:\s*linear-gradient\(135deg,color-mix\(in srgb,var\(--theme-accent\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.country-result,[\s\S]*?transition:none!important/);
});


test("la campagne s'ouvre sur un atlas plein cadre avec une frise de départ en tête", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(html, /class="campaign-datebar"/);
  assert.match(html, /id="start-year" type="range"/);
  assert.match(css, /body:not\(\.campaign-started\) \.game-layout\s*\{[^}]*position:fixed/s);
  assert.match(css, /body:not\(\.campaign-started\) \.time-sidebar,[\s\S]*?\.ai-sidebar\s*\{display:none\}/);
  assert.match(css, /body:not\(\.campaign-started\) \.campaign-datebar\s*\{[^}]*backdrop-filter:blur\(14px\)/s);
  assert.match(css, /body:not\(\.campaign-started\) \.setup-card\s*\{[^}]*backdrop-filter:blur\(16px\)/s);
});

test("les nations peuvent être choisies directement depuis les repères de la carte", () => {
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(js, /!document\.body\.classList\.contains\("campaign-started"\) && hit\.kind === "country"/);
  assert.match(js, /selectCampaignCountry\(country\.raw\)/);
  assert.match(js, /item\.label\.toLocaleLowerCase\("fr"\) === hitName/);
});

test("le bandeau chronologique disparaît après le lancement de la campagne", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(css, /\.campaign-datebar\s*\{display:none\}/);
  assert.match(css, /body:not\(\.campaign-started\) \.campaign-datebar\s*\{[^}]*display:grid/s);
});

test("les infobulles cartographiques exposent les données stratégiques des nations jouables", () => {
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(js, /function normalizeCampaignCountryName\(value\)/);
  assert.match(js, /function findCampaignCountryForMapHit\(hit\)/);
  const tooltip = readFileSync(new URL("../src/world/map-tooltip-layout.js", import.meta.url), "utf8");
  assert.match(js, /getMapTooltipDescriptor\(label, selected, campaignPreview, MAP_LABEL_KIND_NAMES\)/);
  assert.match(tooltip, /campaignPreview\.rank/);
  assert.match(tooltip, /campaignPreview\.region/);
  assert.match(tooltip, /"Difficulté " \+ campaignPreview\.difficulty \+ "\/5"/);
  assert.match(tooltip, /\bdetail,/);
  assert.match(tooltip, /campaign: isCampaignCountry/);
  assert.match(css, /\.map-tooltip\.is-campaign-country/);
});

test("la liste des nations fournit une navigation clavier et des attributs de sélection accessibles", () => {
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(js, /btn\.setAttribute\("role","option"\)/);
  assert.match(js, /btn\.setAttribute\("aria-selected",String\(isSelected\)\)/);
  assert.match(js, /btn\.dataset\.difficulty=String\(x\.difficulty\)/);
  assert.match(js, /event\.key==="ArrowDown"/);
  assert.match(js, /event\.key==="Home"/);
  assert.match(css, /\.country-result:focus-visible/);
});

test("les clics cartographiques résolvent les noms de pays sans dépendre des accents", () => {
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(js, /normalize\("NFD"\)/);
  assert.match(js, /findCampaignCountryForMapHit\(hit\)/);
  assert.match(js, /normalized\.startsWith\(name\) \|\| name\.startsWith\(normalized\)/);
});

test("la fiche de campagne présente statut, situation territoriale et lecture historique",()=>{const js=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");const css=readFileSync(new URL("../styles/main.css",import.meta.url),"utf8");assert.match(js,/dossier\.stateStatus/);assert.match(js,/dossier\.territory/);assert.match(js,/dossier\.historicalLens/);assert.match(css,/\.dossier-status/);assert.match(css,/\.dossier-situation/);assert.match(css,/\.dossier-historical-lens/);});


test("la préparation propose deux boutons de mode synchronisés avec le mode réellement lancé", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  assert.match(html, /data-campaign-mode="grand-strategy"[^>]*aria-pressed="true"/);
  assert.match(html, /data-campaign-mode="sandbox"[^>]*aria-pressed="false"/);
  assert.match(html, /id="campaign-mode" class="visually-hidden"/);
  assert.match(js, /button\.dataset\.campaignMode/);
  assert.match(js, /\$\("campaign-mode"\)\.value = mode/);
  assert.match(js, /const mode = \$\("campaign-mode"\)\.value/);
  assert.match(css, /\.campaign-mode-button\.is-active/);
  assert.match(css, /\.campaign-mode-button:focus-visible/);
});

test("les panneaux de pré-campagne sont des éléments frères ancrés dans le viewport", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  const setupStart = html.indexOf('id="campaign-setup"');
  const setupEnd = html.indexOf('<main class="game-layout">', setupStart);
  const campaignMarkup = html.slice(setupStart, setupEnd);
  assert.ok(campaignMarkup.indexOf('class="setup-card"') < campaignMarkup.indexOf('class="country-selected country-dossier-panel"'));
  assert.match(campaignMarkup, /<\/div>\s*<section class="country-selected country-dossier-panel"/);
  assert.match(css, /#campaign-setup>\.setup-card\{[\s\S]*?position:absolute;left:clamp\(12px/);
  assert.match(css, /#campaign-setup>\.country-dossier-panel\{[\s\S]*?position:absolute;right:clamp\(12px/);
  assert.match(css, /#campaign-setup\.campaign-setup\{[\s\S]*?display:block/);
  assert.match(css, /#campaign-setup \.setup-grid\{display:contents\}/);
  assert.match(css, /@media\(max-width:999px\)[\s\S]*?#campaign-setup>\.country-dossier-panel\{[\s\S]*?position:relative/);
});


test("les panneaux de commandement prolongent la matière et la typographie de chaque époque", () => {
  const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");
  for (const selector of [
    ".side-heading::after",
    ".ai-orb {",
    ".era-milestones button.is-active",
    ".topbar .brand-mark::after"
  ]) {
    assert.ok(css.includes(selector), `règle CSS absente : ${selector}`);
  }
  assert.ok(css.includes("background:var(--theme-accent)"));
  assert.ok(css.includes("radial-gradient(circle at 34% 28%"));
  assert.ok(css.includes("pointer-events:none"));
  for (const [era, texture] of [
    ["exploration", "parchment"],
    ["westphalia", "vellum"],
    ["revolution", "newsprint"],
    ["modern", "military"],
    ["present", "glass"],
    ["future", "obsidian"]
  ]) {
    assert.ok(css.includes(`body[data-cartographic-era="${era}"] .time-sidebar,`), `panneau gauche absent pour ${era}`);
    assert.ok(css.includes(`body[data-cartographic-era="${era}"] .ai-sidebar`), `panneau droit absent pour ${era}`);
    assert.ok(css.includes(`assets/textures/${texture}.svg`), `matière absente pour ${era}`);
    assert.ok(css.includes(`body[data-cartographic-era="${era}"] .ai-orb`), `instrument d'époque absent pour ${era}`);
  }
  assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
  assert.ok(css.includes(".era-milestones button { transition:none!important; }"));
});
