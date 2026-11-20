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
  float a = texture2D(u_elevation, p00).r * 255.0 + texture2D(u_elevation, p00).g * 65280.0;
  float b = texture2D(u_elevation, p10).r * 255.0 + texture2D(u_elevation, p10).g * 65280.0;
  float c = texture2D(u_elevation, p01).r * 255.0 + texture2D(u_elevation, p01).g * 65280.0;
  float d = texture2D(u_elevation, p11).r * 255.0 + texture2D(u_elevation, p11).g * 65280.0;
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
  float slopeX = (east - west) / max(100.0, 22000.0 * cos(radians(latitude)));
  float slopeY = (north - south) / 22000.0;
  vec3 normal = normalize(vec3(-slopeX, -slopeY, 1.0));
  vec3 light = normalize(vec3(-0.35, 0.35, 0.87));
  float shade = clamp(0.92 + dot(normal, light) * 0.28, 0.72, 1.18);
  vec3 ocean = ramp(e, -6000.0, 0.0, vec3(0.035,0.12,0.19), vec3(0.19,0.36,0.40));
  vec3 lowland = ramp(e, 0.0, 900.0, vec3(0.30,0.39,0.27), vec3(0.60,0.57,0.39));
  vec3 highland = ramp(e, 900.0, 4200.0, vec3(0.60,0.57,0.39), vec3(0.88,0.86,0.78));
  vec3 color = e < 0.0 ? ocean : highland;
  if (e >= 0.0 && e < 900.0) color = lowland;
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

function createRenderer(grid) {
  if (!grid?.values || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)) return null;
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(1, 1)
    : typeof document !== "undefined" ? document.createElement("canvas") : null;
  const gl = canvas?.getContext?.("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl || grid.width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || grid.height > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const packed = new Uint8Array(grid.values.length * 4);
  for (let i = 0; i < grid.values.length; i++) {
    const value = grid.values[i] & 0xffff;
    const offset = i * 4;
    packed[offset] = value & 255;
    packed[offset + 1] = value >>> 8;
    packed[offset + 3] = 255;
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // ETOPO est une texture NPOT : WebGL 1 impose CLAMP_TO_EDGE.
  // Le shader applique lui-même le wrapping longitudinal via fract().
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, grid.width, grid.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_elevation"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "u_gridSize"), grid.width, grid.height);
  return { canvas, gl, program, grid, texture };
}

export function renderTerrainWebGL(grid, width, height, viewport = {}) {
  if (!grid?.values || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  let renderer = renderers.get(grid);
  if (!renderer) {
    renderer = createRenderer(grid);
    if (!renderer) return null;
    renderers.set(grid, renderer);
  }
  const { canvas, gl, program } = renderer;
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.texture);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewCenter"),
    Number(viewport.centerLongitude ?? 0), Number(viewport.centerLatitude ?? 0));
  gl.uniform1f(gl.getUniformLocation(program, "u_zoom"), Math.max(0.0001, Number(viewport.zoom ?? 1)));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}

export function getTerrainWebGLShaders() {
  return { vertex: VERTEX_SHADER, fragment: FRAGMENT_SHADER };
}
