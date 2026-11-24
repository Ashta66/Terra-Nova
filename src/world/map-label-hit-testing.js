/** Résout le label ciblé en conservant l'ordre visuel de composition (dernier dessiné au-dessus). */
export function findMapLabelHitAtPoint(hits, x, y) {
  const pointX = Number(x);
  const pointY = Number(y);
  if (!Array.isArray(hits) || !Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
  for (let index = hits.length - 1; index >= 0; index--) {
    const hit = hits[index];
    const bounds = hit?.bounds;
    if (!bounds) continue;
    const left = Number(bounds.left);
    const right = Number(bounds.right);
    const top = Number(bounds.top);
    const bottom = Number(bounds.bottom);
    if (![left, right, top, bottom].every(Number.isFinite)
      || left > right || top > bottom) continue;
    if (pointX >= left && pointX <= right && pointY >= top && pointY <= bottom) return hit;
  }
  return null;
}
