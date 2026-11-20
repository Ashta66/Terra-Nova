function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLongitude(longitude) {
  return ((longitude + 180) % 360 + 360) % 360;
}

function tileId(x, y) {
  return `0/${x}/${y}`;
}

export function calculateZoomTilePlan(input = {}) {
  const { width, height, tileSize } = input;
  if (![width, height, tileSize].every(Number.isInteger)
    || width < 2 || height < 2 || tileSize < 2) return [];
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const zoom = Math.max(0.01, Number(input.viewport?.zoom) || 1);
  const centerLongitude = Number(input.viewport?.centerLongitude) || 0;
  const centerLatitude = clamp(Number(input.viewport?.centerLatitude) || 0, -90, 90);
  const padding = clamp(Number(input.padding ?? 0.45), 0, 2);
  const zooms = [...new Set((input.zoomLevels ?? [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0 && value !== zoom))];

  function collect(targetZoom) {
    const halfLon = 180 / targetZoom * (1 + padding);
    const halfLat = 90 / targetZoom * (1 + padding);
    const firstColumn = Math.floor((centerLongitude - halfLon + 180) / 360 * width - 0.5);
    const lastColumn = Math.ceil((centerLongitude + halfLon + 180) / 360 * width - 0.5);
    const firstRow = clamp(Math.floor((90 - Math.min(90, centerLatitude + halfLat)) / 180 * height - 0.5), 0, height - 1);
    const lastRow = clamp(Math.ceil((90 - Math.max(-90, centerLatitude - halfLat)) / 180 * height - 0.5), 0, height - 1);
    const tileXs = new Set();
    if (lastColumn - firstColumn + 1 >= width) {
      for (let x = 0; x < columns; x++) tileXs.add(x);
    } else {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const wrapped = ((column % width) + width) % width;
        tileXs.add(Math.floor(wrapped / tileSize));
      }
    }
    const centerX = normalizeLongitude(centerLongitude) / 360 * width;
    const centerY = (90 - centerLatitude) / 180 * height;
    const result = [];
    for (let y = Math.floor(firstRow / tileSize); y <= Math.min(rows - 1, Math.floor(lastRow / tileSize)); y++) {
      for (const x of tileXs) {
        const tileCenterX = x * tileSize + Math.min(tileSize, width - x * tileSize) / 2;
        const tileCenterY = y * tileSize + Math.min(tileSize, height - y * tileSize) / 2;
        const rawDx = Math.abs(tileCenterX - centerX);
        const dx = Math.min(rawDx, width - rawDx);
        const dy = Math.abs(tileCenterY - centerY);
        result.push({ id: tileId(x, y), distance: dx * dx + dy * dy });
      }
    }
    return result.sort((a, b) => a.distance - b.distance).map(item => item.id);
  }

  const ordered = new Set();
  zooms.sort((a, b) => Math.abs(Math.log2(b / zoom)) - Math.abs(Math.log2(a / zoom)));
  for (const targetZoom of zooms) for (const id of collect(targetZoom)) ordered.add(id);
  return [...ordered];
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.addEventListener("message", event => {
    const { requestId, input } = event.data ?? {};
    self.postMessage({ requestId, tileIds: calculateZoomTilePlan(input) });
  });
}
