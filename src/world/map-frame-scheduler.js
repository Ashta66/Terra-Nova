/**
 * Coalesces visual composition requests into a single animation frame.
 * A generation token makes cancellation safe even if the browser has already
 * dequeued a callback (or a test/runtime still invokes it after cancellation).
 */
export function createMapFrameScheduler(render, requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame) {
  if (typeof render !== "function" || typeof requestFrame !== "function") {
    throw new TypeError("A render callback and requestAnimationFrame are required.");
  }
  let frame = null;
  let generation = 0;
  let disposed = false;

  const schedule = () => {
    if (disposed || frame !== null) return false;
    const scheduledGeneration = generation;
    const handle = requestFrame(() => {
      if (disposed || scheduledGeneration !== generation) return;
      frame = null;
      render();
    });
    frame = handle;
    return true;
  };

  schedule.cancel = () => {
    if (frame === null) return false;
    const handle = frame;
    frame = null;
    generation += 1;
    if (typeof cancelFrame === "function") cancelFrame(handle);
    return true;
  };

  schedule.dispose = () => {
    if (disposed) return;
    schedule.cancel();
    generation += 1;
    disposed = true;
  };

  schedule.pending = () => frame !== null;
  return schedule;
}
