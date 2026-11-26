export function shouldRenderMapAfterClockAdvance(previousDate, nextDate, previousPhysicalWorld, nextPhysicalWorld) {
  const previous = String(previousDate);
  const next = String(nextDate);
  const yearChanged = previous.charCodeAt(0) !== next.charCodeAt(0)
    || previous.charCodeAt(1) !== next.charCodeAt(1)
    || previous.charCodeAt(2) !== next.charCodeAt(2)
    || previous.charCodeAt(3) !== next.charCodeAt(3);
  return yearChanged || previousPhysicalWorld !== nextPhysicalWorld;
}
