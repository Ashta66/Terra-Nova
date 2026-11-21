export function getMapQualityProfile(environment = globalThis) {
  const navigator = environment.navigator ?? {};
  const userAgent = String(navigator.userAgent ?? "");
  const memory = Number(navigator.deviceMemory);
  const cores = Number(navigator.hardwareConcurrency);
  const dpr = Math.max(1, Number(environment.devicePixelRatio) || 1);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (Number(navigator.maxTouchPoints) > 1 && Number(environment.innerWidth) < 900);
  const constrained = (Number.isFinite(memory) && memory > 0 && memory <= 4)
    || (Number.isFinite(cores) && cores > 0 && cores <= 4);
  const veryConstrained = (Number.isFinite(memory) && memory > 0 && memory <= 2)
    || (Number.isFinite(cores) && cores > 0 && cores <= 2);
  if (veryConstrained) {
    return { tier: "low", mobile, pixelRatio: 1, terrainQualityMultiplier: 0.76, labelDensity: 0.68 };
  }
  if (constrained) {
    return { tier: "balanced", mobile, pixelRatio: mobile ? 1.05 : 1.1, terrainQualityMultiplier: 0.88, labelDensity: 0.84 };
  }
  return {
    tier: "high",
    mobile,
    pixelRatio: Math.min(mobile ? 1.18 : 1.25, dpr),
    terrainQualityMultiplier: 1,
    labelDensity: 1
  };
}
