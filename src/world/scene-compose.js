const clampPositive = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

/**
 * Calcule la taille et le viewport de rendu d'une scène avec une marge d'overscan.
 * Le zoom de rendu ne descend jamais sous 1, limite imposée par projectEquirectangular.
 */
export function fitMapFrame(width, height, aspectRatio = 2) {
  const availableWidth = clampPositive(width);
  const availableHeight = clampPositive(height);
  const ratio = clampPositive(aspectRatio, 2);
  const maxWidth = Math.floor(Math.min(availableWidth, availableHeight * ratio));
  // Pour le ratio 2:1, une largeur paire garantit des dimensions entières
  // strictement cohérentes, sans un pixel de débordement vertical.
  const fittedWidth = ratio === 2 && maxWidth >= 2
    ? maxWidth - (maxWidth % 2)
    : Math.max(1, maxWidth);
  const fittedHeight = Math.max(1, Math.floor(fittedWidth / ratio));
  return { width: fittedWidth, height: fittedHeight };
}

/**
 * En zoom, couvre le cadre sans déformer la projection : le côté long
 * déborde sous overflow:hidden. Le cadrage initial reste en mode contain.
 */
export function coverMapFrame(width, height, aspectRatio = 2) {
  const availableWidth = clampPositive(width);
  const availableHeight = clampPositive(height);
  const ratio = clampPositive(aspectRatio, 2);
  if (availableWidth / availableHeight < ratio) {
    return { width: Math.max(1, Math.ceil(availableHeight * ratio)), height: Math.ceil(availableHeight) };
  }
  if (ratio === 2) {
    const fittedWidth = Math.ceil(availableWidth / 2) * 2;
    return { width: fittedWidth, height: fittedWidth / 2 };
  }
  return { width: Math.ceil(availableWidth), height: Math.max(1, Math.ceil(availableWidth / ratio)) };
}

export function sceneRenderParams(view = {}, width, height, overscan = 1.4) {
  const W = Math.max(1, Math.round(clampPositive(width)));
  const H = Math.max(1, Math.round(clampPositive(height)));
  const zoom = clampPositive(view.zoom);
  const f = Math.min(clampPositive(overscan), zoom);
  const Ws = Math.max(1, Math.round(W * f));
  const Hs = Math.max(1, Math.round(H * f));
  const renderViewport = {
    ...view,
    zoom: Math.max(1, zoom * W / Ws)
  };
  return { f, Ws, Hs, renderViewport };
}

export function snapSceneViewportCenter(view = {}, renderZoom = view.zoom ?? 1) {
  const step = 1 / Math.max(1, Number(renderZoom) || 1);
  return {
    ...view,
    centerLongitude: Math.round((Number(view.centerLongitude) || 0) / step) * step,
    centerLatitude: Math.round((Number(view.centerLatitude) || 0) / step) * step
  };
}

const normalizeLongitudeDelta = value => ((value + 180) % 360 + 360) % 360 - 180;
const intersectsScreen = (rect, width, height) =>
  rect.x < width && rect.x + rect.w > 0 && rect.y < height && rect.y + rect.h > 0;

/**
 * Transforme la scène rendue pour sceneViewport vers le viewport courant.
 * Les rectangles sont exprimés en pixels CSS, pas en pixels du bitmap.
 */
export function composeRects(view = {}, sceneViewport = {}, sceneSize = {}, width, height) {
  const W = Math.max(1, Number(width) || 1);
  const H = Math.max(1, Number(height) || 1);
  const sceneZoom = clampPositive(sceneViewport.zoom);
  const viewZoom = clampPositive(view.zoom);
  const sceneWidth = Math.max(1, Number(sceneSize.w) || W);
  const sceneHeight = Math.max(1, Number(sceneSize.h) || H);
  const k = viewZoom / sceneZoom;
  const dLon = normalizeLongitudeDelta(
    (Number(sceneViewport.centerLongitude) || 0) - (Number(view.centerLongitude) || 0)
  );
  const dLat = (Number(sceneViewport.centerLatitude) || 0) - (Number(view.centerLatitude) || 0);
  const dx = W / 2 + (dLon / 360) * W * viewZoom - (sceneWidth / 2) * k;
  const dy = H / 2 - (dLat / 180) * H * viewZoom - (sceneHeight / 2) * k;
  const dw = sceneWidth * k;
  const dh = sceneHeight * k;
  const base = { x: dx, y: dy, w: dw, h: dh };
  const coversWorld = Number(sceneSize.f) >= sceneZoom - 1e-6;

  if (coversWorld) {
    const period = W * viewZoom;
    const rects = [];
    for (let index = -1; index <= 1; index++) {
      const x = base.x + index * period;
      if (base.x + base.w + index * period <= 0 || x >= W
        || base.y + base.h <= 0 || base.y >= H) continue;
      rects.push({ x, y: base.y, w: base.w, h: base.h });
    }
    return {
      rects,
      covered: dy <= 0 && dy + dh >= H
    };
  }

  return {
    rects: [base],
    covered: dx <= 0 && dx + dw >= W && dy <= 0 && dy + dh >= H
  };
}


/** Évite de lancer un rendu vectoriel coûteux au milieu d'un panoramique. */
export function shouldRecenterScene(covered, dragging = false) {
  return !covered && !dragging;
}
