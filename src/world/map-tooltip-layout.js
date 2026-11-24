const DEFAULT_MARGIN = 8;
const DEFAULT_OFFSET = 14;

/** Calcule une position de tooltip dans le cadre de la carte, sans débordement. */
export function getMapTooltipPosition(x, y, viewportWidth, viewportHeight, tooltipWidth, tooltipHeight, options = {}) {
  const values = [x, y, viewportWidth, viewportHeight, tooltipWidth, tooltipHeight].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [pointX, pointY, width, height, tipWidth, tipHeight] = values;
  if (width < 0 || height < 0 || tipWidth < 0 || tipHeight < 0) return null;
  const marginValue = Number(options.margin ?? DEFAULT_MARGIN);
  const offsetValue = Number(options.offset ?? DEFAULT_OFFSET);
  const margin = Number.isFinite(marginValue) && marginValue >= 0 ? marginValue : DEFAULT_MARGIN;
  const offset = Number.isFinite(offsetValue) && offsetValue >= 0 ? offsetValue : DEFAULT_OFFSET;
  const availableWidth = Math.max(0, width - margin * 2);
  const availableHeight = Math.max(0, height - margin * 2);
  const boundedWidth = Math.min(tipWidth, availableWidth);
  const boundedHeight = Math.min(tipHeight, availableHeight);
  let left = pointX + offset;
  let top = pointY + offset;
  if (left + boundedWidth > width - margin) left = pointX - offset - boundedWidth;
  if (top + boundedHeight > height - margin) top = pointY - offset - boundedHeight;
  left = Math.min(Math.max(margin, left), Math.max(margin, width - margin - boundedWidth));
  top = Math.min(Math.max(margin, top), Math.max(margin, height - margin - boundedHeight));
  return { left, top, maxWidth: availableWidth, maxHeight: availableHeight };
}

/** Coordonnées affichables ou null si les données du label sont incomplètes. */
export function formatMapTooltipCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return latitude.toFixed(2) + "°, " + longitude.toFixed(2) + "°";
}
