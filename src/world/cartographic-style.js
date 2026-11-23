const THEMES = [
  {
    from: 1492, to: 1648, id: "exploration", label: "Explorations",
    colors: { ocean: "#354b50", land: "#c9ad78", landAlt: "#b99a64", coast: "#765638", grid: "#a58a5c", text: "#f0dfbd", accent: "#c18b43" },
    texture: "parchment", detail: "engraved", typography: { display: "Cinzel", body: "EB Garamond" },
    interfaceTitle: "Chambre des Cartographes", interfaceSubtitle: "Registres des explorations"
  },
  {
    from: 1648, to: 1789, id: "westphalia", label: "Paix de Westphalie",
    colors: { ocean: "#263d4c", land: "#d8cfb5", landAlt: "#c8b99b", coast: "#66594e", grid: "#9b8d78", text: "#eee8d8", accent: "#8b3944" },
    texture: "vellum", detail: "engraved", typography: { display: "Cormorant Garamond", body: "Libre Baskerville" },
    interfaceTitle: "Chancellerie", interfaceSubtitle: "Ordres et traités"
  },
  {
    from: 1789, to: 1914, id: "revolution", label: "Révolutions",
    colors: { ocean: "#68777a", land: "#c4c2b6", landAlt: "#b2b1a6", coast: "#42484a", grid: "#8c8580", text: "#f1eee7", accent: "#a8323e" },
    texture: "newsprint", detail: "print", typography: { display: "Playfair Display", body: "Newsreader" },
    interfaceTitle: "La Gazette", interfaceSubtitle: "Bulletin des nations"
  },
  {
    from: 1914, to: 2026, id: "modern", label: "XXe siècle",
    colors: { ocean: "#344b59", land: "#858d7d", landAlt: "#747e70", coast: "#4b5960", grid: "#71818a", text: "#e4e9e7", accent: "#b39a62" },
    texture: "military", detail: "topographic", typography: { display: "Oswald", body: "IBM Plex Mono" },
    interfaceTitle: "État-Major", interfaceSubtitle: "Situation opérationnelle"
  },
  {
    from: 2026, to: 2100, id: "present", label: "Présent",
    colors: { ocean: "#b7d0dc", land: "#9eaa9e", landAlt: "#899b91", coast: "#526b78", grid: "#91aeb9", text: "#263b49", accent: "#287fa5" },
    texture: "clean", detail: "vector", typography: { display: "Inter", body: "Plus Jakarta Sans" },
    interfaceTitle: "Centre de Veille", interfaceSubtitle: "Réseau mondial en temps réel"
  },
  {
    from: 2100, to: Infinity, id: "future", label: "Futur",
    colors: { ocean: "#071d31", land: "#284d55", landAlt: "#315f62", coast: "#75d6d0", grid: "#245b69", text: "#d9f8f2", accent: "#e5ae55" },
    texture: "holographic", detail: "network", typography: { display: "Orbitron", body: "JetBrains Mono" },
    interfaceTitle: "Console Orbitale", interfaceSubtitle: "Réseau planétaire prospectif"
  }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => Math.round(a + (b - a) * t);
function blendHex(a, b, t) {
  const parse = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  const aa = parse(a), bb = parse(b);
  return "#" + aa.map((v, i) => mix(v, bb[i], t).toString(16).padStart(2, "0")).join("");
}

export function getCartographicTheme(year, technologyLevel = 0) {
  if (!Number.isFinite(year)) throw new TypeError("Année cartographique invalide.");
  const index = THEMES.findIndex(theme => year >= theme.from && year < theme.to);
  const currentIndex = index < 0 ? 0 : index;
  const current = THEMES[currentIndex];
  const next = THEMES[Math.min(THEMES.length - 1, currentIndex + 1)];
  const span = current.to === Infinity ? 1 : current.to - current.from;
  const transitionStart = current.from + span * 0.8;
  const chronologicalBlend = current.to === Infinity ? 0 : clamp((year - transitionStart) / (span * 0.2), 0, 1);
  const technologyBlend = clamp(Number(technologyLevel) || 0, 0, 1) * 0.65;
  const t = Math.max(chronologicalBlend, technologyBlend);
  return {
    ...current,
    year,
    colors: Object.fromEntries(Object.keys(current.colors).map(key => [key, blendHex(current.colors[key], next.colors[key], t)]))
  };
}

export function listCartographicEras() {
  return THEMES.map(({ id, label, from, to, interfaceTitle }) => ({ id, label, from, to, interfaceTitle }));
}
