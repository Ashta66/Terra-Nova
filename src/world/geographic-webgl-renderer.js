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

const LINE_VERTEX_SHADER = `
attribute vec2 a_coordinate;
attribute vec2 a_other;
attribute float a_side;
attribute vec2 a_join_offset;
attribute float a_is_join;
uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_viewport;
uniform float u_line_width;
void main() {
  float longitude = a_coordinate.x;
  longitude += 360.0 * floor((u_center.x - longitude) / 360.0 + 0.5);
  float otherLongitude = a_other.x;
  otherLongitude += 360.0 * floor((longitude - otherLongitude) / 360.0 + 0.5);
  vec2 point = vec2((longitude - u_center.x) * u_zoom / 180.0,
                    (a_coordinate.y - u_center.y) * u_zoom / 90.0);
  vec2 other = vec2((otherLongitude - u_center.x) * u_zoom / 180.0,
                    (a_other.y - u_center.y) * u_zoom / 90.0);
  vec2 direction = (other - point) * (u_viewport * 0.5);
  vec2 normal = vec2(-direction.y, direction.x) / max(length(direction), 0.0001);
  vec2 segmentOffset = normal * a_side;
  vec2 offset = mix(segmentOffset, a_join_offset, step(0.5, a_is_join)) * (u_line_width / u_viewport);
  gl_Position = vec4(point + offset, 0.0, 1.0);
}`;

const LINE_FRAGMENT_SHADER = `
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

function hasSupportedLineCoordinates(mesh) {
  if (!mesh?.supported) return false;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 2) {
    if (positions[index] < -180 || positions[index] > 180) return false;
  }
  return true;
}

function buildRibbonBuffer(segments, gl, message) {
  if (!segments.length) return { lineBuffer: null, vertexCount: 0, drawnFeatures: 0, skippedFeatures: 0, positions: new Float32Array() };
  const vertices = [];
  const appendVertex = (ax, ay, bx, by, side, joinX = 0, joinY = 0, isJoin = 0) => {
    vertices.push(ax, ay, bx, by, side, joinX, joinY, isJoin);
  };
  const endpointCounts = new Map();
  const endpointKey = (x, y) => `${x.toFixed(5)},${y.toFixed(5)}`;
  for (let index = 0; index < segments.length; index += 4) {
    const ax = segments[index], ay = segments[index + 1];
    const bx = segments[index + 2], by = segments[index + 3];
    const startKey = endpointKey(ax, ay), endKey = endpointKey(bx, by);
    endpointCounts.set(startKey, (endpointCounts.get(startKey) ?? 0) + 1);
    endpointCounts.set(endKey, (endpointCounts.get(endKey) ?? 0) + 1);
    // Segment quad. Both ends use the same screen-space side of the segment.
    appendVertex(ax, ay, bx, by, -1);
    appendVertex(ax, ay, bx, by, 1);
    appendVertex(bx, by, ax, ay, -1);
    appendVertex(bx, by, ax, ay, -1);
    appendVertex(ax, ay, bx, by, 1);
    appendVertex(bx, by, ax, ay, 1);
  }
  // Small screen-space disks close gaps at shared endpoints and line intersections.
  const joined = new Set();
  const steps = 12;
  for (let index = 0; index < segments.length; index += 4) {
    for (const [x, y] of [[segments[index], segments[index + 1]], [segments[index + 2], segments[index + 3]]]) {
      const key = endpointKey(x, y);
      if ((endpointCounts.get(key) ?? 0) < 2 || joined.has(key)) continue;
      joined.add(key);
      for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
        const a = stepIndex * Math.PI * 2 / steps;
        const b = (stepIndex + 1) * Math.PI * 2 / steps;
        appendVertex(x, y, x, y, 0, 0, 0, 1);
        appendVertex(x, y, x, y, 0, Math.cos(a), Math.sin(a), 1);
        appendVertex(x, y, x, y, 0, Math.cos(b), Math.sin(b), 1);
      }
    }
  }
  const data = new Float32Array(vertices);
  const lineBuffer = gl.createBuffer();
  if (!lineBuffer) throw new Error(message);
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
  } catch (error) {
    gl.deleteBuffer(lineBuffer);
    throw error;
  }
  return { lineBuffer, vertexCount: data.length / 8, drawnFeatures: 0, skippedFeatures: 0, positions: data };
}

function buildLineBatch(features, gl) {
  const segments = [];
  let drawnFeatures = 0, skippedFeatures = 0;
  for (const feature of features) {
    const mesh = buildGeographicLineMesh(feature);
    if (!hasSupportedLineCoordinates(mesh)) { skippedFeatures++; continue; }
    for (const value of mesh.positions) segments.push(value);
    drawnFeatures++;
  }
  return { ...buildRibbonBuffer(segments, gl, "Impossible de créer le buffer de lignes géographiques."), drawnFeatures, skippedFeatures };
}

function buildBoundaryLineBatch(features, gl) {
  const segments = [];
  let drawnFeatures = 0, skippedFeatures = 0;
  for (const feature of features) {
    const geometry = feature?.geometry;
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
    if (!polygons?.length) { skippedFeatures++; continue; }
    const featureSegments = [];
    let valid = true;
    for (const polygon of polygons) {
      for (const ring of polygon ?? []) {
        const mesh = buildGeographicLineMesh({ geometry: { type: "LineString", coordinates: ring } });
        if (!hasSupportedLineCoordinates(mesh)) { valid = false; break; }
        for (const value of mesh.positions) featureSegments.push(value);
      }
      if (!valid) break;
    }
    if (!valid || !featureSegments.length) { skippedFeatures++; continue; }
    for (const value of featureSegments) segments.push(value);
    drawnFeatures++;
  }
  return { ...buildRibbonBuffer(segments, gl, "Impossible de créer le buffer des contours géographiques."), drawnFeatures, skippedFeatures };
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
  const lineVertex = compile(gl, gl.VERTEX_SHADER, LINE_VERTEX_SHADER);
  const lineFragment = compile(gl, gl.FRAGMENT_SHADER, LINE_FRAGMENT_SHADER);
  if (!lineVertex || !lineFragment) {
    if (lineVertex) gl.deleteShader(lineVertex);
    if (lineFragment) gl.deleteShader(lineFragment);
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return null;
  }
  const lineProgram = gl.createProgram();
  if (!lineProgram) {
    gl.deleteShader(lineVertex); gl.deleteShader(lineFragment);
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(lineProgram, lineVertex);
  gl.attachShader(lineProgram, lineFragment);
  gl.linkProgram(lineProgram);
  if (!gl.getProgramParameter(lineProgram, gl.LINK_STATUS)) {
    gl.deleteProgram(lineProgram); gl.deleteShader(lineVertex); gl.deleteShader(lineFragment);
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return null;
  }
  const lineCoordinateLocation = gl.getAttribLocation(lineProgram, "a_coordinate");
  const lineOtherLocation = gl.getAttribLocation(lineProgram, "a_other");
  const lineSideLocation = gl.getAttribLocation(lineProgram, "a_side");
  const lineCenterLocation = gl.getUniformLocation(lineProgram, "u_center");
  const lineZoomLocation = gl.getUniformLocation(lineProgram, "u_zoom");
  const lineViewportLocation = gl.getUniformLocation(lineProgram, "u_viewport");
  const lineWidthLocation = gl.getUniformLocation(lineProgram, "u_line_width");
  const lineColorLocation = gl.getUniformLocation(lineProgram, "u_color");
  const meshCache = createGeographicMeshCache();
  const featureIds = new WeakMap();
  const lineSupportCache = new WeakMap();
  const boundarySupportCache = new WeakMap();
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
      const layerDrawCalls = type !== "polygons" ? (cached.vertexCount ? 1 : 0) : cached.batches.length;
      const layerTriangles = cached.batches?.reduce((sum, batch) => sum + batch.triangles, 0) ?? 0;
      const layerBytes = cacheHit ? 0 : type !== "polygons" ? (cached.positions?.byteLength ?? 0) :
        cached.batches.reduce((sum, batch) => sum + batch.positions.byteLength + batch.indices.byteLength, 0);
      const layerUploads = cacheHit ? 0 : type !== "polygons" ? (cached.lineBuffer ? 1 : 0) : cached.batches.length * 2;
      prepared.push({ key, type, color: layer.color ?? [0.32, 0.39, 0.31, 1], lineWidth: Number(layer.lineWidth ?? (key === "rivers" ? 0.7 : 0.55)), cached });
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
      if (layer.type === "lines" || layer.type === "boundaries") {
        if (!layer.cached.lineBuffer || !layer.cached.vertexCount) continue;
        gl.useProgram(lineProgram);
        gl.uniform2f(lineCenterLocation, centerLongitude, centerLatitude);
        gl.uniform1f(lineZoomLocation, zoom);
        gl.uniform2f(lineViewportLocation, Math.round(width), Math.round(height));
        gl.uniform1f(lineWidthLocation, Math.max(0.25, Number.isFinite(layer.lineWidth) ? layer.lineWidth : 0.55));
        gl.uniform4fv(lineColorLocation, layer.color);
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.cached.lineBuffer);
        gl.enableVertexAttribArray(lineCoordinateLocation);
        gl.vertexAttribPointer(lineCoordinateLocation, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(lineOtherLocation);
        gl.vertexAttribPointer(lineOtherLocation, 2, gl.FLOAT, false, 20, 8);
        gl.enableVertexAttribArray(lineSideLocation);
        gl.vertexAttribPointer(lineSideLocation, 1, gl.FLOAT, false, 20, 16);
        gl.drawArrays(gl.TRIANGLES, 0, layer.cached.vertexCount);
      } else {
        gl.useProgram(program);
        gl.uniform4fv(colorLocation, layer.color);
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
      if (!feature || typeof feature !== "object") return false;
      const cached = boundarySupportCache.get(feature);
      if (cached !== undefined) return cached;
      const geometry = feature.geometry;
      const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] :
        geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
      let supported = Boolean(polygons?.length);
      if (supported) for (const polygon of polygons) {
        for (const ring of polygon ?? []) {
          const mesh = buildGeographicLineMesh({ geometry: { type: "LineString", coordinates: ring } });
          if (!hasSupportedLineCoordinates(mesh)) { supported = false; break; }
        }
        if (!supported) break;
      }
      boundarySupportCache.set(feature, supported);
      return supported;
    },
    supportsLine(feature) {
      if (!feature || typeof feature !== "object") return false;
      const cached = lineSupportCache.get(feature);
      if (cached !== undefined) return cached;
      const supported = hasSupportedLineCoordinates(buildGeographicLineMesh(feature));
      lineSupportCache.set(feature, supported);
      return supported;
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
      gl.deleteProgram(lineProgram);
      gl.deleteShader(lineVertex);
      gl.deleteShader(lineFragment);
    }
  };
}