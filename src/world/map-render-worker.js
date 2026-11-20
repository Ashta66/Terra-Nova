import { renderWorldMap } from "./map-renderer.js";

const families = {
  physical: Object.create(null),
  political: Object.create(null),
  dynamic: Object.create(null)
};
const familyModes = [
  ["physical", { physical: true, political: false, dynamic: false }],
  ["political", { physical: false, political: true, dynamic: false }],
  ["dynamic", { physical: false, political: false, dynamic: true }]
];
const surfaces = {
  physical: new OffscreenCanvas(1, 1),
  political: new OffscreenCanvas(1, 1),
  dynamic: new OffscreenCanvas(1, 1)
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
    const bitmaps = {};
    const results = {};
    for (const [family, renderFamilies] of familyModes) {
      const surface = surfaces[family];
      results[family] = renderWorldMap(surface, layers.land, {
        ...options,
        renderFamilies,
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
      bitmaps[family] = surface.transferToImageBitmap();
    }
    const physical = results.physical;
    const political = results.political;
    const dynamic = results.dynamic;
    const result = {
      ...physical,
      territoryCount: political.territoryCount,
      territoryOutlineCount: political.territoryOutlineCount,
      politicalBoundaryCount: political.politicalBoundaryCount,
      administrativeBoundaryCount: political.administrativeBoundaryCount,
      labelHits: political.labelHits,
      physicalChangeCount: dynamic.physicalChangeCount,
      renderTimings: { ...physical.renderTimings, ...political.renderTimings, ...dynamic.renderTimings },
      totalRenderMs: physical.totalRenderMs + political.totalRenderMs + dynamic.totalRenderMs
    };
    self.postMessage({ id, result, bitmaps }, Object.values(bitmaps));
  } catch (error) {
    self.postMessage({ id, error: error?.message ?? String(error) });
  }
});
