const EPSILON = 1e-10;

function unwrapRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const points = [];
  for (const coordinate of ring) {
    const longitude = Number(coordinate?.[0]);
    const latitude = Number(coordinate?.[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -540 || longitude > 540 || latitude < -90 || latitude > 90) return null;
    let x = longitude;
    if (points.length) {
      const previous = points[points.length - 1][0];
      while (x - previous > 180) x -= 360;
      while (x - previous < -180) x += 360;
    }
    // La triangulation doit travailler sur les mêmes coordonnées que le GPU.
    // Quantifier avant la déduplication évite de créer des sommets distincts
    // en Number qui s'effondreront ensuite vers le même Float32.
    x = Math.fround(x);
    const y = Math.fround(latitude);
    const previousPoint = points[points.length - 1];
    if (!previousPoint || Math.abs(previousPoint[0] - x) > EPSILON
      || Math.abs(previousPoint[1] - y) > EPSILON) points.push([x, y]);
  }
  if (points.length > 2) {
    const first = points[0], last = points[points.length - 1];
    if (Math.abs(first[0] - last[0]) <= EPSILON && Math.abs(first[1] - last[1]) <= EPSILON) points.pop();
  }
  return points.length >= 3 ? points : null;
}

function signedArea(points) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return area * 0.5;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle(point, a, b, c) {
  const ab = cross(a, b, point), bc = cross(b, c, point), ca = cross(c, a, point);
  return ab >= -EPSILON && bc >= -EPSILON && ca >= -EPSILON;
}

function triangulateRing(points) {
  if (!points || points.length < 3) return null;
  const vertices = points.map((_, index) => index);
  if (signedArea(points) < 0) vertices.reverse();
  const indices = [];
  let guard = vertices.length * vertices.length;
  while (vertices.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < vertices.length; i++) {
      const previous = vertices[(i + vertices.length - 1) % vertices.length];
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      const a = points[previous], b = points[current], c = points[next];
      if (cross(a, b, c) <= EPSILON) continue;
      let containsVertex = false;
      for (const candidate of vertices) {
        if (candidate === previous || candidate === current || candidate === next) continue;
        if (pointInTriangle(points[candidate], a, b, c)) {
          containsVertex = true;
          break;
        }
      }
      if (containsVertex) continue;
      indices.push(previous, current, next);
      vertices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
  }
  if (vertices.length !== 3) return null;
  indices.push(vertices[0], vertices[1], vertices[2]);
  return indices;
}

/**
 * Prépare les sommets géographiques et les triangles d'un polygone sans trous.
 * Les polygones avec anneaux intérieurs restent explicitement au rendu Canvas.
 */
export function buildGeographicPolygonMesh(feature) {
  const geometry = feature?.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    return { supported: false, reason: "unsupported-geometry", positions: new Float32Array(), indices: new Uint16Array() };
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) {
    return { supported: false, reason: "invalid-geometry", positions: new Float32Array(), indices: new Uint16Array() };
  }
  const positions = [];
  const indices = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length !== 1) {
      return { supported: false, reason: "polygon-holes-require-canvas", positions: new Float32Array(), indices: new Uint16Array() };
    }
    const ring = unwrapRing(polygon[0]);
    // Le shader normalise chaque sommet indépendamment autour du centre de vue.
    // Un anneau déroulé au-delà de +/-180° serait donc coupé visuellement à
    // l'antiméridien : on le laisse au pipeline Canvas, qui projette en continu.
    if (ring?.some(([longitude]) => longitude < -180 || longitude > 180)) {
      return { supported: false, reason: "antimeridian-requires-canvas", positions: new Float32Array(), indices: new Uint16Array() };
    }
    const triangles = triangulateRing(ring);
    if (!ring || !triangles) {
      return { supported: false, reason: "invalid-or-self-intersecting-ring", positions: new Float32Array(), indices: new Uint16Array() };
    }
    const offset = positions.length / 2;
    if (offset + ring.length > 65535) {
      return { supported: false, reason: "index-limit", positions: new Float32Array(), indices: new Uint16Array() };
    }
    for (const point of ring) positions.push(point[0], point[1]);
    for (const index of triangles) indices.push(offset + index);
  }
  return {
    supported: true,
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
    vertexCount: positions.length / 2,
    triangleCount: indices.length / 3
  };
}

export function createGeographicMeshCache() {
  const cache = new WeakMap();
  return {
    get(feature) {
      if (!feature || typeof feature !== "object") return null;
      if (!cache.has(feature)) cache.set(feature, buildGeographicPolygonMesh(feature));
      return cache.get(feature);
    },
    clear() {
      // WeakMap entries are released with their feature objects.
    }
  };
}

/**
 * Prépare les segments d'une ligne géographique pour un rendu WebGL gl.LINES.
 * Chaque segment est indépendant afin de préserver les ruptures des MultiLineString.
 */
export function buildGeographicLineMesh(feature) {
  const geometry = feature?.geometry;
  if (!geometry || !["LineString", "MultiLineString"].includes(geometry.type)) {
    return { supported: false, reason: "unsupported-geometry", positions: new Float32Array(), vertexCount: 0 };
  }
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(lines) || !lines.length) {
    return { supported: false, reason: "invalid-geometry", positions: new Float32Array(), vertexCount: 0 };
  }
  const positions = [];
  for (const line of lines) {
    if (!Array.isArray(line) || line.length < 2) return { supported: false, reason: "invalid-line", positions: new Float32Array(), vertexCount: 0 };
    const points = [];
    for (const coordinate of line) {
      const longitude = Number(coordinate?.[0]), latitude = Number(coordinate?.[1]);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -540 || longitude > 540 || latitude < -90 || latitude > 90) {
        return { supported: false, reason: "invalid-line", positions: new Float32Array(), vertexCount: 0 };
      }
      let x = longitude;
      if (points.length) {
        const previous = points[points.length - 1][0];
        while (x - previous > 180) x -= 360;
        while (x - previous < -180) x += 360;
      }
      const previousPoint = points[points.length - 1];
      if (!previousPoint || Math.abs(previousPoint[0] - x) > EPSILON || Math.abs(previousPoint[1] - latitude) > EPSILON) points.push([x, latitude]);
    }
    if (points.length < 2) return { supported: false, reason: "invalid-line", positions: new Float32Array(), vertexCount: 0 };
    for (let index = 1; index < points.length; index++) {
      positions.push(points[index - 1][0], points[index - 1][1], points[index][0], points[index][1]);
    }
  }
  if (!positions.length) {
    return { supported: false, reason: "empty-line", positions: new Float32Array(), vertexCount: 0 };
  }

  // La géométrie réellement envoyée au GPU est en Float32. Deux points
  // distincts en Number peuvent donc devenir identiques après conversion.
  // Filtrer les segments effondrés à ce stade évite les rubans de longueur nulle.
  const floatPositions = new Float32Array(positions);
  const validPositions = [];
  for (let index = 0; index < floatPositions.length; index += 4) {
    const ax = floatPositions[index], ay = floatPositions[index + 1];
    const bx = floatPositions[index + 2], by = floatPositions[index + 3];
    if (ax === bx && ay === by) continue;
    validPositions.push(ax, ay, bx, by);
  }
  if (!validPositions.length) {
    return { supported: false, reason: "empty-line", positions: new Float32Array(), vertexCount: 0 };
  }
  const resultPositions = new Float32Array(validPositions);
  return { supported: true, positions: resultPositions, vertexCount: resultPositions.length / 2 };
}
