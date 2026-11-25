/**
 * Tracks the lifecycle of a WebGL canvas without owning its renderer resources.
 * Lost contexts are prevented from triggering browser default teardown behavior;
 * callers decide when to release/recreate their GPU resources.
 */
export function createWebGLContextLifecycle(canvas, { onLost = null, onRestored = null } = {}) {
  if (!canvas || typeof canvas.addEventListener !== "function") {
    throw new TypeError("Un canvas WebGL événementiel est requis.");
  }
  let lost = false;
  let disposed = false;
  let generation = 0;
  const handleLost = event => {
    if (disposed || lost) return;
    event?.preventDefault?.();
    lost = true;
    generation++;
    try { onLost?.({ event, generation }); } catch { /* la télémétrie ne doit pas interrompre le cycle */ }
  };
  const handleRestored = event => {
    if (disposed || !lost) return;
    lost = false;
    generation++;
    try { onRestored?.({ event, generation }); } catch { /* le prochain rendu peut retenter l'initialisation */ }
  };
  canvas.addEventListener("webglcontextlost", handleLost);
  canvas.addEventListener("webglcontextrestored", handleRestored);
  return {
    get lost() { return lost; },
    get disposed() { return disposed; },
    get generation() { return generation; },
    canRender() { return !disposed && !lost; },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      canvas.removeEventListener?.("webglcontextlost", handleLost);
      canvas.removeEventListener?.("webglcontextrestored", handleRestored);
    }
  };
}

/** Calcule une surface Canvas bornée en pixels, sans agrandir inutilement les écrans denses. */
export function getCanvasBackingSize(width, height, pixelRatio = 1, {
  maxPixelRatio = 2,
  maxPixels = 16_777_216
} = {}) {
  const cssWidth = Number(width), cssHeight = Number(height);
  const requestedRatio = Number(pixelRatio);
  const ratioLimit = Number(maxPixelRatio);
  const pixelLimit = Number(maxPixels);
  if (![cssWidth, cssHeight, requestedRatio, ratioLimit, pixelLimit].every(Number.isFinite)
    || cssWidth <= 0 || cssHeight <= 0 || requestedRatio <= 0 || ratioLimit <= 0 || pixelLimit < 1) {
    return { width: 1, height: 1, pixelRatio: 1, valid: false };
  }
  const cssArea = cssWidth * cssHeight;
  if (!Number.isFinite(cssArea) || cssArea <= 0) return { width: 1, height: 1, pixelRatio: 1, valid: false };
  const ratio = Math.min(requestedRatio, ratioLimit, Math.sqrt(pixelLimit / cssArea));
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    width: Math.max(1, Math.floor(cssWidth * safeRatio)),
    height: Math.max(1, Math.floor(cssHeight * safeRatio)),
    pixelRatio: safeRatio,
    valid: true
  };
}
