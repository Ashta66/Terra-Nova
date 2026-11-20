import { createGeographicMeshCache } from "./geographic-webgl.js";

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
  let cachedSignature = null;
  let cachedBatches = null;
  let disposed = false;

  function featureId(feature) {
    if (!feature || typeof feature !== "object") return 0;
    let id = featureIds.get(feature);
    if (!id) { id = nextFeatureId++; featureIds.set(feature, id); }
    return id;
  }

  function releaseBatches(batches) {
    for (const batch of batches ?? []) {
      gl.deleteBuffer(batch.vertexBuffer);
      gl.deleteBuffer(batch.elementBuffer);
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

  function render(features, width, height, viewport = {}, color = [0.32, 0.39, 0.31, 1]) {
    if (disposed) return { drawnFeatures: 0, skippedFeatures: 0, drawCalls: 0, triangles: 0, cacheHit: false, bufferUploads: 0, uploadedBytes: 0 };
    const zoom = Number(viewport.zoom ?? 1);
    const centerLongitude = Number(viewport.centerLongitude ?? 0);
    const centerLatitude = Number(viewport.centerLatitude ?? 0);
    if (![width, height, zoom, centerLongitude, centerLatitude].every(Number.isFinite) || width <= 0 || height <= 0 || zoom <= 0) {
      return { drawnFeatures: 0, skippedFeatures: features?.length ?? 0, drawCalls: 0, triangles: 0, cacheHit: false, bufferUploads: 0, uploadedBytes: 0 };
    }
    const featureList = features ?? [];
    const signature = featureList.map(featureId).join(",");
    const cacheHit = signature === cachedSignature && cachedBatches !== null;
    if (!cacheHit) {
      const next = buildBatches(featureList);
      releaseBatches(cachedBatches?.batches);
      cachedBatches = next;
      cachedSignature = signature;
    }
    const batches = cachedBatches.batches;
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
    gl.uniform4fv(colorLocation, color);
    let drawCalls = 0;
    let triangles = 0;
    for (const batch of batches) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertexBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.elementBuffer);
      gl.drawElements(gl.TRIANGLES, batch.indices.length, gl.UNSIGNED_SHORT, 0);
      drawCalls++;
      triangles += batch.triangles;
    }
    const bufferUploads = cacheHit ? 0 : batches.length * 2;
    const uploadedBytes = cacheHit ? 0 : batches.reduce((total, batch) => total + batch.positions.byteLength + batch.indices.byteLength, 0);
    return { drawnFeatures: cachedBatches.drawnFeatures, skippedFeatures: cachedBatches.skippedFeatures, drawCalls, triangles, cacheHit, bufferUploads, uploadedBytes };
  }

  return {
    canvas: gl.canvas ?? null,
    supports(feature) { return Boolean(meshCache.get(feature)?.supported); },
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseBatches(cachedBatches?.batches);
      cachedBatches = null;
      cachedSignature = null;
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
  };
}