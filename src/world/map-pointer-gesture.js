/** Règles déterministes de filtrage des gestes pointeur de la carte. */
export function shouldStartMapPointerGesture(event, activePointerId = null) {
  if (!event || activePointerId !== null) return false;
  if (event.isPrimary === false) return false;
  if (event.pointerType === "mouse" && event.button !== 0) return false;
  return Number.isFinite(Number(event.pointerId));
}

export function shouldHandleMapPointerGesture(event, activePointerId) {
  return Boolean(event && activePointerId !== null
    && Number(event.pointerId) === Number(activePointerId));
}

export function getMapPointerGestureEndState(gesture, eventType = "pointerup") {
  if (!gesture) return { moved: false, cancelled: false };
  return {
    moved: Boolean(gesture.moved),
    cancelled: eventType !== "pointerup"
  };
}
