import { createGeographicMeshCache, buildGeographicLineMesh } from "./geographic-webgl.js";

const VERTEX_SHADER = `
attribute vec2 a_coordinate;
uniform vec2 u_center;
uniform float u_zoom;
void main() {
  float longitude = a_coordinate.x;
  longitude += 360.0 * floor((u_center.x - longitude) / 360.0 + 0.5);
  float x = (longitude - u_center.x) * u_zoom / 180.0;
  float y = (a_coordinate.y - u_center.y) * u_zoom / 90.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
  return shader;
}

function makeBatch() { return { positions: [], indices: [], features: 0 }; }

function buildLineBatch(features, gl) {
  const positions = [];
  let drawnFeatures = 0, skippedFeatures = 0;
  for (const feature of features) {
    const mesh = buildGeographicLineMesh(feature);
    if (!mesh.supported || Array.from(mesh.positions).some((value, index) => index % 2 === 0 && (value < -180 || value > 180))) { skippedFeatures++; continue; }
    for (const value of mesh.positions) positions.push(value);
    drawnFeatures++;
  }
  if (!positions.length) return { lineBuffer: null, vertexCount: 0, drawnFeatures, skippedFeatures, positions: new Float32Array() };
  const data = new Float32Array(positions);
  const lineBuffer = gl.createBuffer();
  if (!lineBuffer) throw new Error("Impossible de créer le buffer de lignes géographiques.");
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
  } catch (error) {
    gl.deleteBuffer(lineBuffer);
    throw error;
  }
  return { lineBuffer, vertexCount: data.length / 2, drawnFeatures, skippedFeatures, positions: data };
}

function buildBoundaryLineBatch(features, gl) {
  const positions = [];
  let drawnFeatures = 0, skippedFeatures = 0;
  for (const feature of features) {
    const geometry = feature?.geometry;
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
    if (!polygons?.length) { skippedFeatures++; continue; }
    const featurePositions = [];
    let valid = true;
    for (const polygon of polygons) for (const ring of polygon ?? []) {
      const mesh = buildGeographicLineMesh({ geometry: { type: "LineString", coordinates: ring } });
      if (!mesh.supported || Array.from(mesh.positions).some((value, index) => index % 2 === 0 && (value < -180 || value > 180))) { valid = false; break; }
      for (const value of mesh.positions) featurePositions.push(value);
    }
    if (!valid || !featurePositions.length) { skippedFeatures++; continue; }
    for (const value of featurePositions) positions.push(value);
    drawnFeatures++;
  }
  if (!positions.length) return { lineBuffer: null, vertexCount: 0, drawnFeatures, skippedFeatures, positions: new Float32Array() };
  const data = new Float32Array(positions);
  const lineBuffer = gl.createBuffer();
  if (!lineBuffer) throw new Error("Impossible de créer le buffer des contours géographiques.");
  try { gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW); }
  catch (error) { gl.deleteBuffer(lineBuffer); throw error; }
  return { lineBuffer, vertexCount: data.length / 2, drawnFeatures, skippedFeatures, positions: data };
}
function appendMesh(batch, mesh) {
  const offset = batch.positions.length / 2;
  if (offset + mesh.vertexCount > 65535) return false;
  for (const value of mesh.positions) batch.positions.push(value);
  for (const index of mesh.indices) batch.indices.push(offset + index);
  batch.features++;
  return true;
}

/** Rendu GPU des remplissages polygonaux; Canvas conserve les contours et les géométries complexes. */
export function createGeographicWebGLRenderer(gl) {
  if (!gl || typeof gl.createShader !== "function" || typeof gl.drawElements !== "function") {
    throw new TypeError("Contexte WebGL requis.");
  }
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram();
  if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); return null; }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return null;
  }
  const positionLocation = gl.getAttribLocation(program, "a_coordinate");
  const centerLocation = gl.getUniformLocation(program, "u_center");
  const zoomLocation = gl.getUniformLocation(program, "u_zoom");
  const colorLocation = gl.getUniformLocation(program, "u_color");
  const meshCache = createGeographicMeshCache();
  const featureIds = new WeakMap();
  let nextFeatureId = 1;
  const layerCaches = new Map();
  let disposed = false;

  function featureId(feature) {
    if (!feature || typeof feature !== "object") return 0;
    let id = featureIds.get(feature);
    if (!id) { id = nextFeatureId++; featureIds.set(feature, id); }
    return id;
  }

  function releaseBatches(batches) {
    for (const batch of batches ?? []) {
      if (batch.vertexBuffer) gl.deleteBuffer(batch.vertexBuffer);
      if (batch.elementBuffer) gl.deleteBuffer(batch.elementBuffer);
      if (batch.lineBuffer) gl.deleteBuffer(batch.lineBuffer);
    }
  }

  function buildBatches(features) {
    const batches = [makeBatch()];
    let drawnFeatures = 0;
    let skippedFeatures = 0;
    for (const feature of features) {
      const mesh = meshCache.get(feature);
      if (!mesh?.supported) { skippedFeatures++; continue; }
      let batch = batches[batches.length - 1];
      if (batch.positions.length / 2 + mesh.vertexCount > 65535) {
        batch = makeBatch();
        batches.push(batch);
      }
      if (!appendMesh(batch, mesh)) { skippedFeatures++; continue; }
      drawnFeatures++;
    }
    const gpuBatches = [];
    try {
      for (const batch of batches) {
        if (!batch.indices.length) continue;
        const positions = new Float32Array(batch.positions);
        const indices = new Uint16Array(batch.indices);
        const vertexBuffer = gl.createBuffer();
        const elementBuffer = gl.createBuffer();
        if (!vertexBuffer || !elementBuffer) {
          if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
          if (elementBuffer) gl.deleteBuffer(elementBuffer);
          throw new Error("Impossible de créer les buffers géographiques.");
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
        gpuBatches.push({ positions, indices, vertexBuffer, elementBuffer, triangles: indices.length / 3 });
      }
    } catch (error) {
      releaseBatches(gpuBatches);
      throw error;
    }
    return { batches: gpuBatches, drawnFeatures, skippedFeatures };
  }

  function renderLayers(layers, width, height, viewport = {}) {
    const empty = { drawnFeatures: 0, skippedFeatures: 0, drawCalls: 0, triangles: 0,
      cacheHit: false, bufferUploads: 0, uploadedBytes: 0, layers: {} };
    if (disposed) return empty;
    const zoom = Number(viewport.zoom ?? 1);
    const centerLongitude = Number(viewport.centerLongitude ?? 0);
    const centerLatitude = Number(viewport.centerLatitude ?? 0);
    if (![width, height, zoom, centerLongitude, centerLatitude].every(Number.isFinite)
      || width <= 0 || height <= 0 || zoom <= 0) return empty;
    const layerList = layers ?? [];
    const seenKeys = new Set();
    const prepared = [];
    let drawnFeatures = 0, skippedFeatures = 0, drawCalls = 0, triangles = 0;
    let bufferUploads = 0, uploadedBytes = 0, allCacheHits = layerList.length > 0;
    for (let index = 0; index < layerList.length; index++) {
      const layer = layerList[index] ?? {};
      const key = String(layer.key ?? index);
      if (seenKeys.has(key)) throw new Error("Chaque couche WebGL doit avoir une clé unique.");
      seenKeys.add(key);
      const features = layer.features ?? [];
      const type = layer.type === "lines" || layer.type === "boundaries" ? layer.type : "polygons";
      const signature = type + ":" + features.map(featureId).join(",");
      let cached = layerCaches.get(key);
      const cacheHit = Boolean(cached && cached.signature === signature);
      if (!cacheHit) {
        const next = type === "lines" ? buildLineBatch(features, gl) : type === "boundaries" ? buildBoundaryLineBatch(features, gl) : buildBatches(features);
        releaseBatches(cached?.batches);
        if (cached?.lineBuffer) gl.deleteBuffer(cached.lineBuffer);
        cached = { signature, type, ...next };
        layerCaches.set(key, cached);
      }
      allCacheHits = allCacheHits && cacheHit;
      const layerDrawCalls = type === "lines" ? (cached.vertexCount ? 1 : 0) : cached.batches.length;
      const layerTriangles = cached.batches?.reduce((sum, batch) => sum + batch.triangles, 0) ?? 0;
      const layerBytes = cacheHit ? 0 : type === "lines" ? (cached.positions?.byteLength ?? 0) :
        cached.batches.reduce((sum, batch) => sum + batch.positions.byteLength + batch.indices.byteLength, 0);
      const layerUploads = cacheHit ? 0 : type === "lines" ? (cached.lineBuffer ? 1 : 0) : cached.batches.length * 2;
      prepared.push({ key, type, color: layer.color ?? [0.32, 0.39, 0.31, 1], cached });
      drawnFeatures += cached.drawnFeatures;
      skippedFeatures += cached.skippedFeatures;
      drawCalls += layerDrawCalls;
      triangles += layerTriangles;
      bufferUploads += layerUploads;
      uploadedBytes += layerBytes;
      empty.layers[key] = { type, drawnFeatures: cached.drawnFeatures, skippedFeatures: cached.skippedFeatures,
        drawCalls: layerDrawCalls, triangles: layerTriangles, vertices: cached.vertexCount ?? 0,
        cacheHit, bufferUploads: layerUploads, uploadedBytes: layerBytes };
    }
    if (gl.canvas && (gl.canvas.width !== Math.round(width) || gl.canvas.height !== Math.round(height))) {
      gl.canvas.width = Math.round(width);
      gl.canvas.height = Math.round(height);
    }
    gl.viewport(0, 0, Math.round(width), Math.round(height));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.uniform2f(centerLocation, centerLongitude, centerLatitude);
    gl.uniform1f(zoomLocation, zoom);
    for (const layer of prepared) {
      gl.uniform4fv(colorLocation, layer.color);
      if (layer.type === "lines" || layer.type === "boundaries") {
        if (!layer.cached.lineBuffer || !layer.cached.vertexCount) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.cached.lineBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, layer.cached.vertexCount);
      } else {
        for (const batch of layer.cached.batches) {
          gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertexBuffer);
          gl.enableVertexAttribArray(positionLocation);
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.elementBuffer);
          gl.drawElements(gl.TRIANGLES, batch.indices.length, gl.UNSIGNED_SHORT, 0);
        }
      }
    }
    return { drawnFeatures, skippedFeatures, drawCalls, triangles, cacheHit: allCacheHits,
      bufferUploads, uploadedBytes, layers: empty.layers };
  }

  function render(features, width, height, viewport = {}, color = [0.32, 0.39, 0.31, 1]) {
    return renderLayers([{ key: "default", features, color }], width, height, viewport);
  }

  return {
    canvas: gl.canvas ?? null,
    supports(feature) { return Boolean(meshCache.get(feature)?.supported); },
    supportsBoundary(feature) {
      const geometry = feature?.geometry;
      const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] :
        geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
      if (!polygons?.length) return false;
      for (const polygon of polygons) for (const ring of polygon ?? []) {
        const mesh = buildGeographicLineMesh({ geometry: { type: "LineString", coordinates: ring } });
        if (!mesh.supported || Array.from(mesh.positions).some((value, index) =>
          index % 2 === 0 && (value < -180 || value > 180))) return false;
      }
      return true;
    },
    supportsLine(feature) {
      const mesh = buildGeographicLineMesh(feature);
      return Boolean(mesh.supported && !Array.from(mesh.positions).some((value, index) => index % 2 === 0 && (value < -180 || value > 180)));
    },
    render,
    renderLayers,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cached of layerCaches.values()) {
        releaseBatches(cached.batches);
        if (cached.lineBuffer) gl.deleteBuffer(cached.lineBuffer);
      }
      layerCaches.clear();
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
  };
}