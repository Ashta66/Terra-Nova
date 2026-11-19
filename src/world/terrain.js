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

function interpolateStops(value, stops) {
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      const [low, a] = stops[i - 1], [high, b] = stops[i];
      const t = clamp((value - low) / (high - low), 0, 1);
      const smooth = t * t * (3 - 2 * t);
      return a.map((channel, index) => Math.round(channel + (b[index] - channel) * smooth));
    }
  }
  return [...stops.at(-1)[1]];
}

export function terrainColorForElevation(elevation, shade = 1) {
  if (elevation < 0) {
    // Mer volontairement sobre : grandes masses bathymétriques, sans ombrage
    // local des fosses/dorsales qui surchargerait la lecture stratégique.
    const sea = interpolateStops(elevation, [
      [-11000, [25, 45, 57]],
      [-4000, [27, 50, 62]],
      [-1500, [30, 57, 68]],
      [-500, [36, 68, 77]],
      [-50, [46, 80, 87]],
      [0, [55, 91, 96]]
    ]);
    const restrainedShade = clamp(1 + (shade - 1) * 0.12, 0.98, 1.02);
    return sea.map(channel => Math.round(clamp(channel * restrainedShade, 0, 255)));
  }

  const land = interpolateStops(elevation, [
    [0, [105, 126, 88]],
    [250, [119, 132, 88]],
    [1000, [139, 139, 91]],
    [2500, [158, 139, 105]],
    [4000, [179, 165, 143]],
    [6500, [224, 222, 210]]
  ]);
  return land.map(channel => Math.round(clamp(channel * shade, 0, 255)));
}

export function calculateHillshade(west, east, north, south, latitude, cellSizeDegrees = 1 / 6) {
  if (![west, east, north, south, latitude, cellSizeDegrees].every(Number.isFinite) || cellSizeDegrees <= 0) return 1;
  const metersPerDegree = 111320;
  const cellWidth = metersPerDegree * Math.max(0.15, Math.cos(latitude * Math.PI / 180)) * cellSizeDegrees;
  const cellHeight = metersPerDegree * cellSizeDegrees;
  const slopeEast = (east - west) / (2 * cellWidth);
  const slopeNorth = (north - south) / (2 * cellHeight);
  const normalLength = Math.hypot(slopeEast, slopeNorth, 1);
  const normalEast = -slopeEast / normalLength;
  const normalNorth = -slopeNorth / normalLength;
  const normalUp = 1 / normalLength;
  const azimuth = 315 * Math.PI / 180;
  const altitude = 45 * Math.PI / 180;
  const lightEast = Math.cos(altitude) * Math.sin(azimuth);
  const lightNorth = Math.cos(altitude) * Math.cos(azimuth);
  const lightUp = Math.sin(altitude);
  const illumination = normalEast * lightEast + normalNorth * lightNorth + normalUp * lightUp;
  return clamp(1 + (illumination - lightUp) * 0.65, 0.72, 1.22);
}

export function drawTerrainRaster(context, width, height, grid, viewport = {}) {
  if (!context?.createImageData || !context?.putImageData || !grid?.values) return false;
  // Limite le calcul du raster à 1024 × 512 pixels, puis agrandit le résultat.
  // Cela évite plusieurs millions d'échantillonnages à chaque déplacement/zoom.
  const scale = Math.min(1, 1024 / width, 512 / height);
  const renderWidth = Math.max(1, Math.round(width * scale));
  const renderHeight = Math.max(1, Math.round(height * scale));
  let renderContext = context;
  let surface = null;
  if (scale < 1 && typeof OffscreenCanvas !== "undefined") {
    surface = new OffscreenCanvas(renderWidth, renderHeight);
    renderContext = surface.getContext("2d");
  } else if (scale < 1 && typeof document !== "undefined" && context.drawImage) {
    surface = document.createElement("canvas");
    surface.width = renderWidth;
    surface.height = renderHeight;
    renderContext = surface.getContext("2d");
  }
  if (!renderContext?.createImageData || !renderContext?.putImageData) return false;
  const image = renderContext.createImageData(renderWidth, renderHeight), pixels = image.data;
  const zoom = Number(viewport.zoom ?? 1), cx = Number(viewport.centerLongitude ?? 0), cy = Number(viewport.centerLatitude ?? 0);
  const dx = 360 / grid.width, dy = 180 / grid.height;
  for (let py = 0; py < renderHeight; py++) {
    const lat = cy - ((py + 0.5) / renderHeight - 0.5) * 180 / zoom;
    for (let px = 0; px < renderWidth; px++) {
      const lon = cx + ((px + 0.5) / renderWidth - 0.5) * 360 / zoom;
      const e = sampleElevation(grid, lon, lat);
      // Les océans n'effectuent pas les quatre échantillonnages voisins :
      // leur palette reste calme et évite de dessiner chaque fosse/dorsale.
      let shade = 1;
      if (e >= 0) {
        const west = sampleElevation(grid, lon - dx, lat), east = sampleElevation(grid, lon + dx, lat);
        const north = sampleElevation(grid, lon, lat + dy), south = sampleElevation(grid, lon, lat - dy);
        shade = calculateHillshade(west ?? e, east ?? e, north ?? e, south ?? e, lat, dx);
      }
      const color = terrainColorForElevation(e, shade), i = (py * renderWidth + px) * 4;
      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
    }
  }
  renderContext.putImageData(image, 0, 0);
  if (surface && typeof context.drawImage === "function") {
    context.save?.();
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(surface, 0, 0, width, height);
    context.restore?.();
  } else if (renderContext === context) {
    // Fallback DOM-less pour les tests et les contextes Canvas minimaux.
  } else {
    return false;
  }
  return true;
}
