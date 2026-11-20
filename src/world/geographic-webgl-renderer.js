import { createGeographicMeshCache } from "./geographic-webgl.js";

const VERTEX_SHADER = `
attribute vec2 a_coordinate;
uniform vec2 u_center;
uniform float u_zoom;
void main() {
  float longitude = a_coordinate.x;
  longitude += 360.0 * floor((u_center.x - longitude) / 360.0 + 0.5);
  float x = (longitude - u_center.x) * u_zoom / 180.0;
  float y = (u_center.y - a_coordinate.y) * u_zoom / 90.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_color;
void main() {
  gl_FragColor = u_color;
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function appendMesh(batch, mesh, shift) {
  const vertexOffset = batch.positions.length / 2;
  if (vertexOffset + mesh.vertexCount > 65535) return false;
  for (let i = 0; i < mesh.positions.length; i += 2) {
    batch.positions.push(mesh.positions[i] + shift, mesh.positions[i + 1]);
  }
  for (const index of mesh.indices) batch.indices.push(vertexOffset + index);
  return true;
}

function makeBatch() {
  return { positions: [], indices: [], features: 0 };
}

/**
 * Renderer de remplissage polygonal pour une surface WebGL dédiée.
 * Le caller conserve le rendu Canvas pour les contours et les géométries non supportées.
 */
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
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  const buffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!buffer || !indexBuffer) {
    if (buffer) gl.deleteBuffer(buffer);
    if (indexBuffer) gl.deleteBuffer(indexBuffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  const positionLocation = gl.getAttribLocation(program, "a_coordinate");
  const centerLocation = gl.getUniformLocation(program, "u_center");
  const zoomLocation = gl.getUniformLocation(program, "u_zoom");
  const colorLocation = gl.getUniformLocation(program, "u_color");
  const meshCache = createGeographicMeshCache();
  let disposed = false;

  function render(features, width, height, viewport = {}, color = [0.32, 0.39, 0.31, 1]) {
    if (disposed) return { drawnFeatures: 0, skippedFeatures: 0, drawCalls: 0, triangles: 0 };
    const zoom = Number(viewport.zoom ?? 1);
    const centerLongitude = Number(viewport.centerLongitude ?? 0);
    const centerLatitude = Number(viewport.centerLatitude ?? 0);
    if (![width, height, zoom, centerLongitude, centerLatitude].every(Number.isFinite)
      || width <= 0 || height <= 0 || zoom <= 0) {
      return { drawnFeatures: 0, skippedFeatures: features?.length ?? 0, drawCalls: 0, triangles: 0 };
    }
    const batches = [makeBatch()];
    let drawnFeatures = 0, skippedFeatures = 0;
    for (const feature of features ?? []) {
      const mesh = meshCache.get(feature);
      if (!mesh?.supported) {
        skippedFeatures++;
        continue;
      }
      let batch = batches[batches.length - 1];
      if (batch.positions.length / 2 + mesh.vertexCount > 65535) {
        batch = makeBatch();
        batches.push(batch);
      }
      if (!appendMesh(batch, mesh, 0)) {
        skippedFeatures++;
        continue;
      }
      batch.features++;
      drawnFeatures++;
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
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    let drawCalls = 0, triangles = 0;
    for (const batch of batches) {
      if (!batch.indices.length) continue;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batch.positions), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(batch.indices), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, batch.indices.length, gl.UNSIGNED_SHORT, 0);
      drawCalls++;
      triangles += batch.indices.length / 3;
    }
    return { drawnFeatures, skippedFeatures, drawCalls, triangles };
  }

  return {
    canvas: gl.canvas ?? null,
    supports(feature) {
      return Boolean(meshCache.get(feature)?.supported);
    },
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteBuffer(buffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
  };
}
