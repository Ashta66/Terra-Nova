import { simplifyGeoJsonCollection } from "./geometry-generalization.js";

let sourceCollection = null;

self.addEventListener("message", event => {
  const message = event.data ?? {};
  try {
    if (message.type === "init") {
      sourceCollection = message.collection ?? null;
      self.postMessage({ type: "ready" });
      return;
    }
    if (message.type === "simplify") {
      if (!sourceCollection?.features) throw new Error("Collection LOD non initialisée.");
      const result = simplifyGeoJsonCollection(sourceCollection, message.tolerance);
      self.postMessage({ requestId: message.requestId, result });
      return;
    }
    // Compatibilité avec les workers lancés par les versions précédentes du client.
    const result = simplifyGeoJsonCollection(message.collection, message.tolerance);
    self.postMessage({ requestId: message.requestId, result });
  } catch (error) {
    self.postMessage({
      requestId: message.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
