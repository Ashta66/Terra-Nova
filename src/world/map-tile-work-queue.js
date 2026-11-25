/** File d'attente déterministe des travaux de tuiles physiques. */
export function reconcileMapTileWorkQueue(planTiles, queued = [], isCached = () => false, isPending = () => false) {
  const next = [];
  const seen = new Set();
  for (const tile of Array.isArray(planTiles) ? planTiles : []) {
    const key = tile?.key;
    if (typeof key !== "string" || !key || seen.has(key)) continue;
    seen.add(key);
    if (isCached(key) || isPending(key)) continue;
    next.push(tile);
  }
  return next;
}

export function takeNextMapTileWork(queue, isCached = () => false, isPending = () => false) {
  if (!Array.isArray(queue)) return null;
  while (queue.length) {
    const tile = queue.shift();
    const key = tile?.key;
    if (typeof key !== "string" || !key || isCached(key) || isPending(key)) continue;
    return tile;
  }
  return null;
}

export function getMapTileWorkQueueStats(queue, pending) {
  return {
    queued: Array.isArray(queue) ? queue.length : 0,
    pending: pending instanceof Map ? pending.size : 0
  };
}
