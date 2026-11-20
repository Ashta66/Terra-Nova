export function getGeographicRendererPreference(search = "") {
  const preference = new URLSearchParams(search).get("geographic-renderer");
  return preference === "canvas" || preference === "webgl" ? preference : "auto";
}

export function resolveGeographicRendererMode(preference, rendererAvailable) {
  if (preference === "canvas") return "canvas";
  return rendererAvailable ? "webgl" : "canvas-fallback";
}
