const renderers = new WeakMap();

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_elevation;
uniform vec2 u_gridSize;
uniform vec2 u_viewCenter;
uniform float u_zoom;
varying vec2 v_uv;

float elevationAt(vec2 uv) {
  vec2 wrapped = vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0));
  vec2 pixel = wrapped * u_gridSize - 0.5;
  vec2 base = floor(pixel);
  vec2 f = fract(pixel);
  vec2 p00 = (base + 0.5) / u_gridSize;
  vec2 p10 = p00 + vec2(1.0 / u_gridSize.x, 0.0);
  vec2 p01 = p00 + vec2(0.0, 1.0 / u_gridSize.y);
  vec2 p11 = p00 + vec2(1.0 / u_gridSize.x, 1.0 / u_gridSize.y);
  p00.x = fract(p00.x); p10.x = fract(p10.x);
  p01.x = fract(p01.x); p11.x = fract(p11.x);
  vec4 sampleA = texture2D(u_elevation, p00);
  vec4 sampleB = texture2D(u_elevation, p10);
  vec4 sampleC = texture2D(u_elevation, p01);
  vec4 sampleD = texture2D(u_elevation, p11);
  float a = sampleA.r * 255.0 + sampleA.a * 65280.0;
  float b = sampleB.r * 255.0 + sampleB.a * 65280.0;
  float c = sampleC.r * 255.0 + sampleC.a * 65280.0;
  float d = sampleD.r * 255.0 + sampleD.a * 65280.0;
  a = mod(a + 32768.0, 65536.0) - 32768.0;
  b = mod(b + 32768.0, 65536.0) - 32768.0;
  c = mod(c + 32768.0, 65536.0) - 32768.0;
  d = mod(d + 32768.0, 65536.0) - 32768.0;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 ramp(float value, float low, float high, vec3 a, vec3 b) {
  float t = clamp((value - low) / (high - low), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return mix(a, b, t);
}

void main() {
  float longitude = u_viewCenter.x + (v_uv.x - 0.5) * 360.0 / u_zoom;
  float latitude = u_viewCenter.y + (v_uv.y - 0.5) * 180.0 / u_zoom;
  vec2 geo = vec2((longitude + 180.0) / 360.0, (90.0 - latitude) / 180.0);
  float e = elevationAt(geo);
  float dx = 1.0 / u_gridSize.x;
  float dy = 1.0 / u_gridSize.y;
  float west = elevationAt(geo - vec2(dx, 0.0));
  float east = elevationAt(geo + vec2(dx, 0.0));
  float north = elevationAt(geo - vec2(0.0, dy));
  float south = elevationAt(geo + vec2(0.0, dy));
  float cellWidth = 111320.0 * max(0.15, cos(radians(latitude))) * (360.0 / u_gridSize.x);
  float cellHeight = 111320.0 * (180.0 / u_gridSize.y);
  float slopeX = (east - west) / (2.0 * cellWidth);
  float slopeY = (north - south) / (2.0 * cellHeight);
  vec3 normal = normalize(vec3(-slopeX, -slopeY, 1.0));
  float azimuth = radians(315.0);
  float altitude = radians(45.0);
  vec3 light = normalize(vec3(cos(altitude) * sin(azimuth),
    cos(altitude) * cos(azimuth), sin(altitude)));
  float shade = clamp(1.0 + (dot(normal, light) - sin(altitude)) * 0.65, 0.72, 1.22);
  vec3 ocean = ramp(e, -11000.0, -4000.0, vec3(25.0,45.0,57.0)/255.0, vec3(27.0,50.0,62.0)/255.0);
  ocean = e > -4000.0 ? ramp(e, -4000.0, -1500.0, vec3(27.0,50.0,62.0)/255.0, vec3(30.0,57.0,68.0)/255.0) : ocean;
  ocean = e > -1500.0 ? ramp(e, -1500.0, -500.0, vec3(30.0,57.0,68.0)/255.0, vec3(36.0,68.0,77.0)/255.0) : ocean;
  ocean = e > -500.0 ? ramp(e, -500.0, -50.0, vec3(36.0,68.0,77.0)/255.0, vec3(46.0,80.0,87.0)/255.0) : ocean;
  ocean = e > -50.0 ? ramp(e, -50.0, 0.0, vec3(46.0,80.0,87.0)/255.0, vec3(55.0,91.0,96.0)/255.0) : ocean;
  vec3 lowland = ramp(e, 0.0, 250.0, vec3(105.0,126.0,88.0)/255.0, vec3(119.0,132.0,88.0)/255.0);
  lowland = e > 250.0 ? ramp(e, 250.0, 1000.0, vec3(119.0,132.0,88.0)/255.0, vec3(139.0,139.0,91.0)/255.0) : lowland;
  vec3 highland = ramp(e, 1000.0, 2500.0, vec3(139.0,139.0,91.0)/255.0, vec3(158.0,139.0,105.0)/255.0);
  highland = e > 2500.0 ? ramp(e, 2500.0, 4000.0, vec3(158.0,139.0,105.0)/255.0, vec3(179.0,165.0,143.0)/255.0) : highland;
  highland = e > 4000.0 ? ramp(e, 4000.0, 6500.0, vec3(179.0,165.0,143.0)/255.0, vec3(224.0,222.0,210.0)/255.0) : highland;
  vec3 color = e < 0.0 ? ocean : (e < 1000.0 ? lowland : highland);
  if (e >= 0.0) {
    float slope = length(vec2(slopeX, slopeY));
    float relativeHeight = e - (west + east + north + south) * 0.25;
    vec3 tint = vec3(0.0);
    float tintStrength = 0.0;
    if (e >= 1800.0 && slope >= 0.08) {
      tint = vec3(190.0,174.0,157.0) / 255.0;
      tintStrength = 0.075;
    } else if (e >= 700.0 && slope < 0.055) {
      tint = vec3(183.0,158.0,121.0) / 255.0;
      tintStrength = 0.065;
    } else if (relativeHeight <= -90.0 && e < 1800.0) {
      tint = vec3(91.0,116.0,80.0) / 255.0;
      tintStrength = 0.065;
    } else if (slope < 0.025 && e < 450.0) {
      tint = vec3(137.0,151.0,103.0) / 255.0;
      tintStrength = 0.065;
    } else if (slope >= 0.055 || e >= 1200.0) {
      tint = vec3(163.0,143.0,113.0) / 255.0;
      tintStrength = 0.065;
    }
    color = mix(color, tint, tintStrength);
  }
  gl_FragColor = vec4(color * (e < 0.0 ? 1.0 : shade), 1.0);
}`;

function compileShader(gl, type, source) {
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

export function encodeTerrainTexture(values) {
  if (!ArrayBuffer.isView(values)) throw new TypeError("Les altitudes doivent être un tableau typé.");
  const packed = new Uint8Array(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const value = values[i] & 0xffff;
    const offset = i * 2;
    packed[offset] = value & 255;
    packed[offset + 1] = value >>> 8;
  }
  return packed;
}

function createRenderer(grid) {
  if (!grid?.values || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)) return null;
  const candidates = [];
  if (typeof OffscreenCanvas !== "undefined") candidates.push(new OffscreenCanvas(1, 1));
  if (typeof document !== "undefined") candidates.push(document.createElement("canvas"));
  let canvas = null, gl = null;
  for (const candidate of candidates) {
    const context = candidate.getContext?.("webgl", {
      alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true
    });
    if (context && grid.width <= context.getParameter(context.MAX_TEXTURE_SIZE)
      && grid.height <= context.getParameter(context.MAX_TEXTURE_SIZE)) {
      canvas = candidate;
      gl = context;
      break;
    }
  }
  if (!gl) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const uploadStartedAt = globalThis.performance?.now?.() ?? Date.now();
  const packed = encodeTerrainTexture(grid.values);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // ETOPO est une texture NPOT : WebGL 1 impose CLAMP_TO_EDGE.
  // Le shader applique lui-même le wrapping longitudinal via fract().
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, grid.width, grid.height, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, packed);
  const textureUploadMs = (globalThis.performance?.now?.() ?? Date.now()) - uploadStartedAt;
  const timerExtension = gl.getExtension("EXT_disjoint_timer_query");

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_elevation"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "u_gridSize"), grid.width, grid.height);
  const renderer = {
    canvas, gl, program, grid, texture, timerExtension,
    textureUploadMs, textureBytes: packed.byteLength,
    pendingQueries: [], lastGpuMs: null, lastSubmitMs: 0,
    contextLost: false
  };
  canvas.addEventListener?.("webglcontextlost", event => {
    event.preventDefault?.();
    renderer.contextLost = true;
  });
  canvas.addEventListener?.("webglcontextrestored", () => {
    renderer.contextLost = true;
    renderers.delete(grid);
  });
  return renderer;
}

function pollGpuQueries(renderer) {
  const { gl, timerExtension: ext, pendingQueries } = renderer;
  if (!ext) return;
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
  if (disjoint) renderer.lastGpuMs = null;
  for (let i = pendingQueries.length - 1; i >= 0; i--) {
    const query = pendingQueries[i];
    if (!ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT)) continue;
    if (!disjoint) renderer.lastGpuMs = ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT) / 1e6;
    ext.deleteQueryEXT(query);
    pendingQueries.splice(i, 1);
  }
}

export function getTerrainWebGLStats(grid) {
  const renderer = grid && renderers.get(grid);
  if (!renderer || renderer.contextLost || renderer.gl.isContextLost?.()) return null;
  return {
    textureUploadMs: renderer.textureUploadMs,
    textureBytes: renderer.textureBytes,
    drawSubmitMs: renderer.lastSubmitMs,
    gpuMs: renderer.lastGpuMs,
    timerQueriesSupported: Boolean(renderer.timerExtension)
  };
}

export function renderTerrainWebGL(grid, width, height, viewport = {}) {
  if (!grid?.values || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  let renderer = renderers.get(grid);
  if (!renderer) {
    renderer = createRenderer(grid);
    if (!renderer) return null;
    renderers.set(grid, renderer);
  }
  if (renderer.contextLost || renderer.gl.isContextLost?.()) {
    renderers.delete(grid);
    return null;
  }
  const { canvas, gl, program } = renderer;
  pollGpuQueries(renderer);
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.texture);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewCenter"),
    Number(viewport.centerLongitude ?? 0), Number(viewport.centerLatitude ?? 0));
  gl.uniform1f(gl.getUniformLocation(program, "u_zoom"), Math.max(0.0001, Number(viewport.zoom ?? 1)));
  const ext = renderer.timerExtension;
  let query = null;
  if (ext && renderer.pendingQueries.length < 4) {
    try {
      query = ext.createQueryEXT();
      ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, query);
    } catch {
      if (query) ext.deleteQueryEXT(query);
      query = null;
    }
  }
  const submitStartedAt = globalThis.performance?.now?.() ?? Date.now();
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  renderer.lastSubmitMs = (globalThis.performance?.now?.() ?? Date.now()) - submitStartedAt;
  if (query) {
    try {
      ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
      renderer.pendingQueries.push(query);
    } catch {
      ext.deleteQueryEXT(query);
    }
  }
  if (gl.isContextLost?.()) {
    renderer.contextLost = true;
    renderers.delete(grid);
    return null;
  }
  return canvas;
}

export function getTerrainWebGLShaders() {
  return { vertex: VERTEX_SHADER, fragment: FRAGMENT_SHADER };
}
