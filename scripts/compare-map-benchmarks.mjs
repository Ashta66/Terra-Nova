#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function assertBenchmark(result, label = "benchmark") {
  if (!result || typeof result !== "object" || !result.metadata || typeof result.metadata !== "object") {
    throw new TypeError(`${label}: metadata manquantes`);
  }
  if (!result.metrics || typeof result.metrics !== "object" || Array.isArray(result.metrics)) {
    throw new TypeError(`${label}: métriques manquantes`);
  }
  return result;
}

function metricValue(entry, statistic) {
  const value = typeof entry === "number" ? entry : entry?.[statistic];
  return Number.isFinite(value) ? value : null;
}

export function compareMapBenchmarks(baselineInput, candidateInput, { statistic = "median" } = {}) {
  if (!["median", "p95", "min", "max"].includes(statistic)) {
    throw new RangeError("Statistique attendue : median, p95, min ou max");
  }
  const baseline = assertBenchmark(baselineInput, "baseline");
  const candidate = assertBenchmark(candidateInput, "candidate");
  const warnings = [];
  for (const key of ["scenario", "cache", "viewportWidth", "viewportHeight", "devicePixelRatio", "terrainRenderer"]) {
    const left = baseline.metadata[key];
    const right = candidate.metadata[key];
    if (left != null && right != null && left !== right) {
      warnings.push(`Métadonnée différente (${key}) : ${left} vs ${right}`);
    }
  }
  const baselineMode = baseline.metadata.geographicRendererMode;
  const candidateMode = candidate.metadata.geographicRendererMode;
  if (baselineMode && candidateMode && baselineMode === candidateMode) {
    warnings.push(`Les deux mesures utilisent le même renderer géographique (${baselineMode})`);
  }
  const keys = [...new Set([...Object.keys(baseline.metrics), ...Object.keys(candidate.metrics)])].sort();
  const metrics = keys.map(name => {
    const before = metricValue(baseline.metrics[name], statistic);
    const after = metricValue(candidate.metrics[name], statistic);
    if (before == null || after == null) {
      return { name, baseline: before, candidate: after, delta: null, deltaPercent: null, status: "missing" };
    }
    const delta = after - before;
    return {
      name, baseline: before, candidate: after, delta,
      deltaPercent: before === 0 ? null : (delta / Math.abs(before)) * 100,
      status: "compared"
    };
  });
  return {
    statistic,
    baseline: { ...baseline.metadata },
    candidate: { ...candidate.metadata },
    warnings,
    metrics
  };
}

async function main() {
  const [baselinePath, candidatePath, statistic = "median"] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    throw new Error("Usage: node scripts/compare-map-benchmarks.mjs <canvas.json> <webgl.json> [median|p95|min|max]");
  }
  const [baselineText, candidateText] = await Promise.all([
    readFile(baselinePath, "utf8"), readFile(candidatePath, "utf8")
  ]);
  const result = compareMapBenchmarks(JSON.parse(baselineText), JSON.parse(candidateText), { statistic });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.warnings.length) process.stderr.write(`Avertissements :\n- ${result.warnings.join("\n- ")}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
