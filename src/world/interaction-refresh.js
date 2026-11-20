// Cadence des actualisations cartographiques pendant le panoramique et le zoom.
// Le rendu intermédiaire est plafonné ; le rendu final est déclenché rapidement
// après le dernier événement de pointeur ou de molette.
export const INTERACTION_PREVIEW_INTERVAL_MS = 120;
export const INTERACTION_SETTLE_DELAY_MS = 90;
