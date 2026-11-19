const THEMES = [
  { from: 1444, to: 1600, id: "manuscript", label: "Atlas manuscrit", colors: { ocean: "#172f3a", land: "#c7b68c", landAlt: "#b6a27a", coast: "#6f5a3d", grid: "#8d7957", text: "#eadbb8", accent: "#b8874e" }, texture: "parchment", detail: "engraved" },
  { from: 1600, to: 1800, id: "engraved-atlas", label: "Atlas gravé", colors: { ocean: "#203c49", land: "#d4c7a4", landAlt: "#c5b58c", coast: "#77684f", grid: "#9c8b69", text: "#eee2c5", accent: "#c19b5d" }, texture: "paper", detail: "hachures" },
  { from: 1800, to: 1950, id: "topographic", label: "Carte topographique", colors: { ocean: "#263f4a", land: "#b6b99a", landAlt: "#a8ad8d", coast: "#6f806e", grid: "#71877e", text: "#e5e9dc", accent: "#d1b36f" }, texture: "paper", detail: "contours" },
  { from: 1950, to: 2025, id: "digital", label: "Cartographie numérique", colors: { ocean: "#102b3a", land: "#526c65", landAlt: "#637a68", coast: "#a8c2b6", grid: "#587b83", text: "#e5f0e9", accent: "#75c7c0" }, texture: "digital", detail: "layers" },
  { from: 2025, to: Infinity, id: "future", label: "Cartographie prospective", colors: { ocean: "#071d31", land: "#284d55", landAlt: "#315f62", coast: "#75d6d0", grid: "#245b69", text: "#d9f8f2", accent: "#7ce5d5" }, texture: "holographic", detail: "network" }
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
  const current = THEMES[Math.max(0, index)];
  const next = THEMES[Math.min(THEMES.length - 1, Math.max(0, index) + 1)];
  const span = current.to === Infinity ? 1 : current.to - current.from;
  const chronologicalBlend = current.to === Infinity ? 0 : clamp((year - current.from) / span, 0, 1) * 0.22;
  const technologyBlend = clamp(technologyLevel, 0, 1) * 0.18;
  const t = Math.max(chronologicalBlend, technologyBlend);
  return {
    ...current,
    year,
    colors: Object.fromEntries(Object.keys(current.colors).map(key => [key, blendHex(current.colors[key], next.colors[key], t)]))
  };
}

export function listCartographicEras() {
  return THEMES.map(({ id, label, from, to }) => ({ id, label, from, to }));
}
