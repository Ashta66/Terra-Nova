export function shouldRenderMapAfterClockAdvance(previousDate, nextDate, previousPhysicalWorld, nextPhysicalWorld) {
  const previousYear = String(previousDate).slice(0, 4);
  const nextYear = String(nextDate).slice(0, 4);
  return previousYear !== nextYear || previousPhysicalWorld !== nextPhysicalWorld;
}
