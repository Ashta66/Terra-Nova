import { calculateHillshade } from "./terrain.js";
self.addEventListener("message", event => {
  const { width, height, values, exaggeration = 14 } = event.data ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || !(values instanceof ArrayBuffer) || values.byteLength !== width * height * 2 || !Number.isFinite(exaggeration)) {
    self.postMessage({ ok: false });
    return;
  }
  const elevation = new Int16Array(values), shades = new Uint8Array(width * height), dx = 360 / width;
  for (let y = 0; y < height; y++) {
    const latitude = 90 - (y + 0.5) / height * 180, north = Math.max(0, y - 1), south = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (elevation[index] < 0) { shades[index] = Math.round((1 - 0.4) / 1.2 * 255); continue; }
      const west = elevation[y * width + ((x - 1 + width) % width)], east = elevation[y * width + ((x + 1) % width)];
      const shade = calculateHillshade(west, east, elevation[north * width + x], elevation[south * width + x], latitude, dx, exaggeration);
      shades[index] = Math.round(Math.max(0, Math.min(1, (shade - 0.4) / 1.2)) * 255);
    }
  }
  self.postMessage({ ok: true, width, height, exaggeration, shades }, [shades.buffer]);
});