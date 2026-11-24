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

function containsPoint(hit, x, y) {
  const bounds = hit?.bounds;
  if (!bounds) return false;
  const left = Number(bounds.left);
  const right = Number(bounds.right);
  const top = Number(bounds.top);
  const bottom = Number(bounds.bottom);
  return Number.isFinite(left) && Number.isFinite(right)
    && Number.isFinite(top) && Number.isFinite(bottom)
    && left <= right && top <= bottom
    && x >= left && x <= right && y >= top && y <= bottom;
}

/** Construit une grille spatiale ; les indices de chaque cellule restent dans l'ordre de dessin. */
export function createMapLabelHitIndex(hits, cellSize = DEFAULT_CELL_SIZE) {
  if (!Array.isArray(hits)) {
    return { hits: [], cellSize: DEFAULT_CELL_SIZE, cells: new Map(), overflow: [] };
  }
  const requestedSize = Number(cellSize);
  const size = Number.isFinite(requestedSize) && requestedSize > 0 ? requestedSize : DEFAULT_CELL_SIZE;
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

/** Résout le label supérieur sans créer de collection temporaire pendant le survol. */
export function findMapLabelHitAtPoint(hits, x, y, index = null) {
  const pointX = Number(x);
  const pointY = Number(y);
  if (!Array.isArray(hits) || !Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;

  const indexed = index?.hits === hits && index.cells instanceof Map
    && Number.isFinite(index.cellSize) && index.cellSize > 0
    && Array.isArray(index.overflow);
  if (indexed) {
    const cellX = Math.floor(pointX / index.cellSize);
    const cellY = Math.floor(pointY / index.cellSize);
    const local = index.cells.get(cellX + ":" + cellY) ?? [];
    const overflow = index.overflow;
    let localPosition = local.length - 1;
    let overflowPosition = overflow.length - 1;
    if (localPosition < 0 && overflowPosition < 0) return null;

    // Les deux listes sont ordonnées par indice croissant et disjointes.
    // Leur fusion inverse préserve le dernier label dessiné sans Set ni tri.
    while (localPosition >= 0 || overflowPosition >= 0) {
      const localIndex = localPosition >= 0 ? local[localPosition] : -1;
      const overflowIndex = overflowPosition >= 0 ? overflow[overflowPosition] : -1;
      const hitIndex = localIndex > overflowIndex ? local[localPosition--] : overflow[overflowPosition--];
      if (containsPoint(hits[hitIndex], pointX, pointY)) return hits[hitIndex];
    }
    return null;
  }

  for (let hitIndex = hits.length - 1; hitIndex >= 0; hitIndex--) {
    if (containsPoint(hits[hitIndex], pointX, pointY)) return hits[hitIndex];
  }
  return null;
}
