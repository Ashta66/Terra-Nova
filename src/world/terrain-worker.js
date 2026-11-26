const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Les directions lumineuses sont constantes : leurs trigonométries sont calculées
// une seule fois, pas 2,3 millions de fois dans la boucle du raster.
const lights = [
  { east: Math.cos(35 * Math.PI / 180) * Math.sin(315 * Math.PI / 180), north: Math.cos(35 * Math.PI / 180) * Math.cos(315 * Math.PI / 180), up: Math.sin(35 * Math.PI / 180), weight: 0.8 },
  { east: Math.cos(55 * Math.PI / 180) * Math.sin(45 * Math.PI / 180), north: Math.cos(55 * Math.PI / 180) * Math.cos(45 * Math.PI / 180), up: Math.sin(55 * Math.PI / 180), weight: 0.2 }
];
const flatLight = lights.reduce((sum, light) => sum + light.up * light.weight, 0);

function hillshade(west, east, north, south, latitude, cellSizeDegrees) {
  const metersPerDegree = 111320;
  const cellWidth = metersPerDegree * Math.max(0.15, Math.cos(latitude * Math.PI / 180)) * cellSizeDegrees;
  const cellHeight = metersPerDegree * cellSizeDegrees;
  const slopeEast = 18 * (east - west) / (2 * cellWidth);
  const slopeNorth = 18 * (north - south) / (2 * cellHeight);
  const normalLength = Math.hypot(slopeEast, slopeNorth, 1);
  const normalEast = -slopeEast / normalLength;
  const normalNorth = -slopeNorth / normalLength;
  const normalUp = 1 / normalLength;
  let lit = 0;
  for (const light of lights) {
    lit += Math.max(0, normalEast * light.east + normalNorth * light.north + normalUp * light.up) * light.weight;
  }
  const steepness = Math.min(1, Math.hypot(slopeEast, slopeNorth));
  return clamp(1 + (lit - flatLight) * 1.35 - steepness * 0.10, 0.52, 1.48);
}

self.addEventListener("message", event => {
  const { width, height, values } = event.data ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || !(values instanceof ArrayBuffer) || values.byteLength !== width * height * 2) {
    self.postMessage({ ok: false });
    return;
  }
  const elevation = new Int16Array(values);
  const shades = new Uint8Array(width * height);
  const dx = 360 / width;
  for (let y = 0; y < height; y++) {
    const latitude = 90 - (y + 0.5) / height * 180;
    const north = Math.max(0, y - 1);
    const south = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (elevation[index] < 0) {
        shades[index] = 128;
        continue;
      }
      const west = elevation[y * width + ((x - 1 + width) % width)];
      const east = elevation[y * width + ((x + 1) % width)];
      const shade = hillshade(west, east, elevation[north * width + x], elevation[south * width + x], latitude, dx);
      shades[index] = Math.round(clamp((shade - 0.48) / 1.04, 0, 1) * 255);
    }
  }
  self.postMessage({ ok: true, width, height, shades }, [shades.buffer]);
});
