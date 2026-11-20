import { renderWorldMap } from "./map-renderer.js";

const surface = new OffscreenCanvas(1, 1);
const layers = Object.create(null);

self.addEventListener("message", event => {
  const { id, layerUpdates = {}, options } = event.data ?? {};
  try {
    Object.assign(layers, layerUpdates);
    if (!layers.land) throw new Error("Couche terrestre absente du moteur de rendu.");
    const result = renderWorldMap(surface, layers.land, {
      ...options,
      lakes: layers.lakes,
      rivers: layers.rivers,
      glaciers: layers.glaciers,
      elevationPoints: layers.elevationPoints,
      labels: layers.labels,
      territories: layers.territories,
      physicalWorld: layers.physicalWorld,
      politicalBoundaries: layers.politicalBoundaries,
      administrativeBoundaries: layers.administrativeBoundaries,
      terrain: layers.terrain
    });
    const bitmap = surface.transferToImageBitmap();
    self.postMessage({ id, result, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ id, error: error?.message ?? String(error) });
  }
});
