const sceneContexts = new WeakMap();

function getSceneContext(target) {
  let context = sceneContexts.get(target);
  if (context) return context;
  context = target?.getContext?.("2d") ?? null;
  if (context) sceneContexts.set(target, context);
  return context;
}

export function getSceneTransform(sceneViewport = {}, viewport = {}, width = 1, height = 1) {
  const oldZoom = Math.max(0.0001, Number(sceneViewport.zoom) || 1);
  const newZoom = Math.max(0.0001, Number(viewport.zoom) || 1);
  const scale = newZoom / oldZoom;
  const centerLongitude = Number(sceneViewport.centerLongitude) || 0;
  const centerLatitude = Number(sceneViewport.centerLatitude) || 0;
  const nextLongitude = Number(viewport.centerLongitude) || 0;
  const nextLatitude = Number(viewport.centerLatitude) || 0;
  return {
    scale,
    x: width * 0.5 * (1 - scale) + (centerLongitude - nextLongitude) * width * newZoom / 360,
    y: height * 0.5 * (1 - scale) + (nextLatitude - centerLatitude) * height * newZoom / 180
  };
}
export function composeSceneCanvas(target, scene, transform, pixelRatio = 1) {
  const context = target?.getContext?.("2d");
  if (!context || !scene) return false;
  if (target.width !== scene.width) target.width = scene.width;
  if (target.height !== scene.height) target.height = scene.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, target.width, target.height);
  context.setTransform(transform.scale, 0, 0, transform.scale, transform.x * pixelRatio, transform.y * pixelRatio);
  context.drawImage(scene, 0, 0);
  context.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}
