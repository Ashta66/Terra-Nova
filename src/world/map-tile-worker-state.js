/** Garde-fous pour les réponses du worker de tuiles physiques. */
export function isMapTileWorkerReplyCurrent(message, pending) {
  if (!message || !pending || typeof pending.get !== "function") return false;
  const key = message.tile?.key;
  const requestId = message.requestId;
  return typeof key === "string" && key.length > 0
    && Number.isSafeInteger(requestId) && requestId > 0
    && pending.get(key) === requestId;
}

/** Ne libère une tuile que si la réponse correspond à sa requête active. */
export function releaseMapTileWorkerReply(message, pending) {
  if (!isMapTileWorkerReplyCurrent(message, pending)) return false;
  pending.delete(message.tile.key);
  return true;
}
