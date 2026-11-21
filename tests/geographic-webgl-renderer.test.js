import test from "node:test";
import assert from "node:assert/strict";
import { createGeographicWebGLRenderer } from "../src/world/geographic-webgl-renderer.js";

function createMockGl() {
  let nextId = 0;
  const uploaded = [];
  const deleted = new Set();
  const gl = {
    canvas: { width: 0, height: 0 },
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7, DYNAMIC_DRAW: 8,
    COLOR_BUFFER_BIT: 9, BLEND: 10, SRC_ALPHA: 11, ONE_MINUS_SRC_ALPHA: 12,
    FLOAT: 13, TRIANGLES: 14, UNSIGNED_SHORT: 15,
    createShader: () => ({ id: ++nextId }),
    shaderSource() {}, compileShader() {}, getShaderParameter: () => true, deleteShader() {},
    createProgram: () => ({ id: ++nextId }), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}),
    deleteProgram() {},
    createBuffer: () => ({ id: ++nextId }),
    deleteBuffer(buffer) { deleted.add(buffer); },
    bindBuffer() {},
    bufferData(_target, data) { uploaded.push(data.byteLength); },
    viewport() {}, clearColor() {}, clear() {}, enable() {}, blendFunc() {},
    useProgram() {}, uniform2f() {}, uniform1f() {}, uniform4fv() {},
    enableVertexAttribArray() {}, vertexAttribPointer() {}, drawArrays() {}, drawElements() {}
  };
  return { gl, uploaded, deleted };
}

function polygonFeature(offset = 0) {
  return {
    type: "Feature",
    properties: { id: offset },
    geometry: { type: "Polygon", coordinates: [[
      [offset, 0], [offset + 0.8, 0], [offset + 0.8, 0.8],
      [offset, 0.8], [offset, 0]
    ]] }
  };
}

test("le cache WebGL polygonal ne reconstruit que le bloc de features modifié", () => {
  const { gl, uploaded } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const features = Array.from({ length: 65 }, (_, index) => polygonFeature(index));
  const viewport = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };

  const first = renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400, viewport);
  assert.equal(first.cacheHit, false);
  assert.equal(first.bufferUploads, 4, "deux blocs polygonaux produisent chacun un buffer vertex et index");
  assert.equal(first.drawCalls, 2);
  const initialUploadBytes = first.uploadedBytes;
  assert.ok(initialUploadBytes > 0);

  const changed = features.slice();
  changed[10] = polygonFeature(10.25);
  const second = renderer.renderLayers([{ key: "land", type: "polygons", features: changed }], 800, 400, viewport);
  assert.equal(second.cacheHit, false);
  assert.equal(second.bufferUploads, 2, "le bloc inchangé doit conserver ses deux buffers GPU");
  assert.equal(second.drawCalls, 2);
  assert.ok(second.uploadedBytes < initialUploadBytes);

  const third = renderer.renderLayers([{ key: "land", type: "polygons", features: changed.slice() }], 800, 400, viewport);
  assert.equal(third.cacheHit, true, "une nouvelle liste avec les mêmes références doit réutiliser les deux blocs");
  assert.equal(third.bufferUploads, 0);
  assert.equal(third.uploadedBytes, 0);
  assert.equal(uploaded.length, 6);
  renderer.dispose();
});

test("le renderer expose le budget mémoire GPU et libère les buffers à dispose", () => {
  const { gl, deleted } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const features = [polygonFeature(0)];
  const result = renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  assert.equal(result.cacheBudgetBytes, 128 * 1024 * 1024);
  assert.ok(result.cachedGpuBytes > 0);
  renderer.dispose();
  assert.ok(deleted.size >= 2);
});
