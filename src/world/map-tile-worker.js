import { renderWorldMap } from "./map-renderer.js";
import { createPhysicalTileRenderOptions } from "./map-tile-renderer.js";

let layers = null;

self.addEventListener("message", event => {
  const message = event.data ?? {};
  if (message.type === "init") {
    layers = message.layers ?? null;
    self.postMessage({ type: "ready" });
    return;
  }
  if (message.type !== "render-tile" || !layers) return;
  const { requestId, tile } = message;
  let surface = null;
  try {
    const options = createPhysicalTileRenderOptions(tile, layers);
    surface = new OffscreenCanvas(options.width, options.height);
    const result = renderWorldMap(surface, layers.land, options);
    const bitmap = surface.transferToImageBitmap();
    self.postMessage({
      type: "tile-ready",
      requestId,
      tile,
      bitmap,
      stats: { totalRenderMs: result.totalRenderMs, featureCount: result.featureCount }
    }, [bitmap]);
  } catch (error) {
    self.postMessage({ type: "tile-error", requestId, tile, error: error?.message ?? String(error) });
  } finally {
    // Le bitmap transféré possède désormais les pixels ; libérer le backing store du canvas.
    if (surface) {
      surface.width = 0;
      surface.height = 0;
    }
  }
});
