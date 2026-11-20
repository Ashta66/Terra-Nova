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

export function sampleElevation(grid, longitude, latitude, level = 0) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  // Le magasin de tuiles expose son propre échantillonneur afin que le rendu
  // lise les révisions locales sans recopier la grille mondiale à chaque frame.
  if (typeof grid?.sampleLod === "function") return grid.sampleLod(longitude, latitude, level);
  if (typeof grid?.sampleBilinear === "function") return grid.sampleBilinear(longitude, latitude, level);
  if (!grid?.values) return null;
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

export function classifyLandform(elevation, west, east, north, south, latitude, cellSizeDegrees = 1 / 6) {
  if (![elevation, west, east, north, south, latitude, cellSizeDegrees].every(Number.isFinite) || cellSizeDegrees <= 0) return "lowlands";
  if (elevation < 0) return "ocean";
  const metersPerDegree = 111320;
  const cellWidth = metersPerDegree * Math.max(0.15, Math.cos(latitude * Math.PI / 180)) * cellSizeDegrees;
  const cellHeight = metersPerDegree * cellSizeDegrees;
  const slopeEast = (east - west) / (2 * cellWidth);
  const slopeNorth = (north - south) / (2 * cellHeight);
  const slope = Math.hypot(slopeEast, slopeNorth);
  const neighbourMean = (west + east + north + south) / 4;
  const relativeHeight = elevation - neighbourMean;

  // Classes heuristiques dérivées du MNT : elles décrivent la forme locale,
  // pas une cartographie géomorphologique scientifique indépendante.
  if (elevation >= 1800 && slope >= 0.08) return "mountains";
  if (elevation >= 700 && slope < 0.055) return "plateaus";
  if (relativeHeight <= -90 && elevation < 1800) return "valleys";
  if (slope < 0.025 && elevation < 450) return "plains";
  if (slope >= 0.055 || elevation >= 1200) return "hills";
  return "lowlands";
}

function applyLandformTint(color, landform) {
  const tints = {
    mountains: [190, 174, 157],
    plateaus: [183, 158, 121],
    valleys: [91, 116, 80],
    plains: [137, 151, 103],
    hills: [163, 143, 113]
  };
  const tint = tints[landform];
  if (!tint) return color;
  const strength = landform === "mountains" ? 0.075 : 0.065;
  return color.map((channel, index) => Math.round(channel * (1 - strength) + tint[index] * strength));
}

export function terrainColorForElevation(elevation, shade = 1, landform = "lowlands") {
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
  return applyLandformTint(land.map(channel => Math.round(clamp(channel * shade, 0, 255))), landform);
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

export function drawTerrainRaster(context, width, height, grid, viewport = {}, dirtyRect = null) {
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
  const scaleX = renderWidth / width, scaleY = renderHeight / height;
  const x0 = dirtyRect ? Math.max(0, Math.floor(dirtyRect.x * scaleX)) : 0;
  const y0 = dirtyRect ? Math.max(0, Math.floor(dirtyRect.y * scaleY)) : 0;
  const x1 = dirtyRect ? Math.min(renderWidth, Math.ceil((dirtyRect.x + dirtyRect.width) * scaleX)) : renderWidth;
  const y1 = dirtyRect ? Math.min(renderHeight, Math.ceil((dirtyRect.y + dirtyRect.height) * scaleY)) : renderHeight;
  if (x1 <= x0 || y1 <= y0) return true;
  const image = renderContext.createImageData(x1 - x0, y1 - y0), pixels = image.data;
  const zoom = Number(viewport.zoom ?? 1), cx = Number(viewport.centerLongitude ?? 0), cy = Number(viewport.centerLatitude ?? 0);
  const dx = 360 / grid.width, dy = 180 / grid.height;
  // Choisit un niveau selon la densité de pixels : faible zoom = parent simplifié,
  // zoom rapproché = retour progressif vers les échantillons natifs.
  const lod = clamp(Math.log2(Math.max(1, grid.width / renderWidth / Math.max(1, zoom))), 0, 4);
  for (let py = y0; py < y1; py++) {
    const lat = cy - ((py + 0.5) / renderHeight - 0.5) * 180 / zoom;
    for (let px = x0; px < x1; px++) {
      const lon = cx + ((px + 0.5) / renderWidth - 0.5) * 360 / zoom;
      const e = sampleElevation(grid, lon, lat, lod);
      // Les océans n'effectuent pas les quatre échantillonnages voisins :
      // leur palette reste calme et évite de dessiner chaque fosse/dorsale.
      let shade = 1;
      if (e >= 0) {
        const west = sampleElevation(grid, lon - dx, lat, lod), east = sampleElevation(grid, lon + dx, lat, lod);
        const north = sampleElevation(grid, lon, lat + dy, lod), south = sampleElevation(grid, lon, lat - dy, lod);
        shade = calculateHillshade(west ?? e, east ?? e, north ?? e, south ?? e, lat, dx);
        const landform = classifyLandform(e, west ?? e, east ?? e, north ?? e, south ?? e, lat, dx);
        const color = terrainColorForElevation(e, shade, landform);
        const i = ((py - y0) * (x1 - x0) + (px - x0)) * 4;
        pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
        continue;
      }
      const color = terrainColorForElevation(e, shade, "ocean"), i = ((py - y0) * (x1 - x0) + (px - x0)) * 4;
      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
    }
  }
  renderContext.putImageData(image, x0, y0);
  if (surface && typeof context.drawImage === "function") {
    context.save?.();
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(surface, x0, y0, x1 - x0, y1 - y0, x0 / scaleX, y0 / scaleY, (x1 - x0) / scaleX, (y1 - y0) / scaleY);
    context.restore?.();
  } else if (renderContext === context) {
    // Fallback DOM-less pour les tests et les contextes Canvas minimaux.
  } else {
    return false;
  }
  return true;
}
