const DEFAULT_CELL_SIZE = 96;
const MAX_CELLS_PER_HIT = 256;

function readBounds(hit) {
  const bounds = hit?.bounds;
  if (!bounds) return null;
  const value = {
    left: Number(bounds.left), right: Number(bounds.right),
    top: Number(bounds.top), bottom: Number(bounds.bottom)
  };
  if (!Object.values(value).every(Number.isFinite)
    || value.left > value.right || value.top > value.bottom) return null;
  return value;
}

/** Construit un index de grille sur les emprises visibles, en conservant leur indice de dessin. */
export function createMapLabelHitIndex(hits, cellSize = DEFAULT_CELL_SIZE) {
  const size = Number(cellSize);
  if (!Array.isArray(hits) || !Number.isFinite(size) || size <= 0) {
    return { hits: Array.isArray(hits) ? hits : [], cellSize: DEFAULT_CELL_SIZE, cells: new Map(), overflow: [] };
  }
  const cells = new Map();
  const overflow = [];
  hits.forEach((hit, index) => {
    const bounds = readBounds(hit);
    if (!bounds) return;
    const minX = Math.floor(bounds.left / size);
    const maxX = Math.floor(bounds.right / size);
    const minY = Math.floor(bounds.top / size);
    const maxY = Math.floor(bounds.bottom / size);
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
    if (!Number.isSafeInteger(cellCount) || cellCount > MAX_CELLS_PER_HIT) {
      overflow.push(index);
      return;
    }
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = x + ":" + y;
        let bucket = cells.get(key);
        if (!bucket) cells.set(key, bucket = []);
        bucket.push(index);
      }
    }
  });
  return { hits, cellSize: size, cells, overflow };
}

/** Résout le label supérieur sous le pointeur ; l'index réduit les candidats sans changer l'ordre visuel. */
export function findMapLabelHitAtPoint(hits, x, y, index = null) {
  const pointX = Number(x);
  const pointY = Number(y);
  if (!Array.isArray(hits) || !Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
  let candidates = null;
  if (index?.hits === hits && index.cells instanceof Map && Number.isFinite(index.cellSize) && index.cellSize > 0) {
    const cellX = Math.floor(pointX / index.cellSize);
    const cellY = Math.floor(pointY / index.cellSize);
    const local = index.cells.get(cellX + ":" + cellY) ?? [];
    if (local.length || index.overflow.length) {
      candidates = [...new Set(local.concat(index.overflow))].sort((a, b) => b - a);
    } else {
      return null;
    }
  }
  const visit = candidates ?? Array.from({ length: hits.length }, (_, i) => hits.length - 1 - i);
  for (const hitIndex of visit) {
    const hit = hits[hitIndex];
    const bounds = readBounds(hit);
    if (!bounds) continue;
    if (pointX >= bounds.left && pointX <= bounds.right
      && pointY >= bounds.top && pointY <= bounds.bottom) return hit;
  }
  return null;
}
