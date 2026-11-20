/**
 * Coalesce les demandes de composition visuelle dans une seule frame.
 * Les calculs lourds restent dans le Worker / les tâches différées ; ce
 * scheduler ne fait que synchroniser le rafraîchissement de l'écran.
 */
export function createMapFrameScheduler(render, requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame) {
  if (typeof render !== "function" || typeof requestFrame !== "function") {
    throw new TypeError("Un rendu et requestAnimationFrame sont requis.");
  }
  let frame = null;
  let disposed = false;
  const schedule = () => {
    if (disposed || frame !== null) return false;
    frame = requestFrame(() => {
      frame = null;
      if (!disposed) render();
    });
    return true;
  };
  schedule.cancel = () => {
    if (frame === null) return false;
    if (typeof cancelFrame === "function") cancelFrame(frame);
    frame = null;
    return true;
  };
  schedule.dispose = () => {
    schedule.cancel();
    disposed = true;
  };
  schedule.pending = () => frame !== null;
  return schedule;
}
