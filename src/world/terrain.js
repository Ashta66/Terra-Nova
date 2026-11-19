const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function createTerrainGrid(buffer, width = 2160, height = 1080) {
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) throw new TypeError("Tampon binaire requis.");
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || bytes.byteLength !== width * height * 2) throw new RangeError("Dimensions ou taille du raster ETOPO invalides.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Int16Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = view.getInt16(i * 2, true);
  let min = Infinity, max = -Infinity;
  for (const value of values) { if (value < min) min = value; if (value > max) max = value; }
  return { width, height, values, min, max };
}

export function sampleElevation(grid, longitude, latitude) {
  if (!grid?.values || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const lon = ((longitude + 180) % 360 + 360) % 360;
  const x = lon / 360 * grid.width - 0.5;
  const y = clamp((90 - latitude) / 180 * grid.height - 0.5, 0, grid.height - 1);
  const rawX = Math.floor(x), x0 = ((rawX % grid.width) + grid.width) % grid.width, x1 = (x0 + 1) % grid.width;
  const y0 = Math.floor(y), y1 = Math.min(grid.height - 1, y0 + 1), fx = x - rawX, fy = y - y0;
  const at = (column, row) => grid.values[row * grid.width + column];
  const a = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const b = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return a * (1 - fy) + b * fy;
}

function colorForElevation(e, shade) {
  const stops = e < -5000 ? [13,48,76] : e < -1000 ? [24,76,103] : e < 0 ? [48,111,132] : e < 250 ? [105,126,88] : e < 1000 ? [133,139,91] : e < 2500 ? [151,130,98] : e < 4000 ? [166,151,132] : [222,222,211];
  return stops.map(c => Math.round(clamp(c * shade, 0, 255)));
}

export function drawTerrainRaster(context, width, height, grid, viewport = {}) {
  if (!context?.createImageData || !context?.putImageData || !grid?.values) return false;
  const image = context.createImageData(width, height), pixels = image.data;
  const zoom = Number(viewport.zoom ?? 1), cx = Number(viewport.centerLongitude ?? 0), cy = Number(viewport.centerLatitude ?? 0);
  const dx = 360 / grid.width, dy = 180 / grid.height;
  for (let py = 0; py < height; py++) {
    const lat = cy - ((py + 0.5) / height - 0.5) * 180 / zoom;
    for (let px = 0; px < width; px++) {
      const lon = cx + ((px + 0.5) / width - 0.5) * 360 / zoom;
      const e = sampleElevation(grid, lon, lat);
      const west = sampleElevation(grid, lon - dx, lat), east = sampleElevation(grid, lon + dx, lat);
      const north = sampleElevation(grid, lon, lat + dy), south = sampleElevation(grid, lon, lat - dy);
      const shade = clamp(1.04 - (((east ?? e) - (west ?? e)) * 0.000035 + ((south ?? e) - (north ?? e)) * 0.00005), 0.68, 1.28);
      const color = colorForElevation(e, shade), i = (py * width + px) * 4;
      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return true;
}
