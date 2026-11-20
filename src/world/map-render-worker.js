import { renderWorldMap } from "./map-renderer.js";

const surface = new OffscreenCanvas(1, 1);
const families = {
  physical: Object.create(null),
  political: Object.create(null),
  dynamic: Object.create(null)
};

self.addEventListener("message", event => {
  const { id, familyUpdates = {}, options } = event.data ?? {};
  try {
    for (const [family, updates] of Object.entries(familyUpdates)) {
      if (!families[family]) continue;
      Object.assign(families[family], updates);
    }
    const layers = { ...families.physical, ...families.political, ...families.dynamic };
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
