/** File d'attente déterministe des travaux de tuiles physiques. */
const queueCursors = new WeakMap();

function getQueueCursor(queue) {
  let state = queueCursors.get(queue);
  if (!state || queue.length < state.length) {
    state = { head: 0, length: queue.length };
    queueCursors.set(queue, state);
  } else {
    state.length = queue.length;
  }
  return state;
}

export function hasMapTileWork(queue) {
  if (!Array.isArray(queue) || !queue.length) return false;
  return getQueueCursor(queue).head < queue.length;
}

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
  const state = getQueueCursor(queue);
  while (state.head < queue.length) {
    const tile = queue[state.head++];
    if (state.head >= queue.length) {
      // Libérer les références consommées dès que la file est épuisée.
      queue.length = 0;
      state.head = 0;
      state.length = 0;
    }
    const key = tile?.key;
    if (typeof key !== "string" || !key || isCached(key) || isPending(key)) continue;
    return tile;
  }
  return null;
}

export function getMapTileWorkQueueStats(queue, pending) {
  const queued = Array.isArray(queue) && queue.length
    ? Math.max(0, queue.length - getQueueCursor(queue).head) : 0;
  return {
    queued,
    pending: pending instanceof Map ? pending.size : 0
  };
}
