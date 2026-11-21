import { simplifyGeoJsonCollection } from "./geometry-generalization.js";

self.addEventListener("message", event => {
  const { collection, tolerance } = event.data ?? {};
  try {
    const result = simplifyGeoJsonCollection(collection, tolerance);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
