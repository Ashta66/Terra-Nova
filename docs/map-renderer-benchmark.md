# Comparaison des benchmarks cartographiques

Ce dépôt possède actuellement son propre moteur de tuiles Canvas et son ordonnanceur de rendu. Le comparateur ci-dessous est indépendant du moteur : il peut comparer deux exports JSON dès lors qu'ils contiennent `metadata` et `metrics`.

## Comparer deux exports

```bash
node scripts/compare-map-benchmarks.mjs baseline.json candidate.json
node scripts/compare-map-benchmarks.mjs baseline.json candidate.json p95
```

Statistiques acceptées : `median`, `p95`, `min`, `max`. Le rapport indique les écarts absolus et relatifs. Les métriques absentes sont marquées non comparables ; les différences de scénario, cache, dimensions, DPR ou renderer terrain déclenchent un avertissement.

## Format d'export attendu

```json
{
  "metadata": {
    "scenario": "zoom-4-pan",
    "cache": "warm",
    "viewportWidth": 1440,
    "viewportHeight": 900,
    "devicePixelRatio": 2,
    "terrainRenderer": "canvas",
    "geographicRendererMode": "canvas"
  },
  "metrics": {
    "renderTotalMs": { "median": 12.4, "p95": 18.1 }
  }
}
```

Le comparateur ne collecte pas lui-même les mesures et ne prétend pas que les exports sont comparables si les conditions réelles diffèrent. Sur la branche `main`, l'instrumentation et le collecteur navigateur spécifiques au renderer WebGL de la branche `dev` ne sont pas encore intégrés : les métriques doivent donc être collectées par un protocole externe ou ajoutées après adaptation au moteur de `main`.

## Tests

```bash
node --test tests/map-benchmark.test.js
npm test
```

Les tests vérifient les calculs, les métadonnées divergentes, les métriques manquantes et les entrées invalides.
