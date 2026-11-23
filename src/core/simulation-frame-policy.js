export function shouldRenderMapAfterClockAdvance(previousDate, nextDate, previousPhysicalWorld, nextPhysicalWorld) {
  const previousYear = Number(String(previousDate).charCodeAt(0)) * 1000
    + Number(String(previousDate).charCodeAt(1)) * 100
    + Number(String(previousDate).charCodeAt(2)) * 10
    + Number(String(previousDate).charCodeAt(3));
  const nextYear = Number(String(nextDate).charCodeAt(0)) * 1000
    + Number(String(nextDate).charCodeAt(1)) * 100
    + Number(String(nextDate).charCodeAt(2)) * 10
    + Number(String(nextDate).charCodeAt(3));
  return previousYear !== nextYear || previousPhysicalWorld !== nextPhysicalWorld;
}
