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

## Collecteur navigateur (branche d'intégration)

Le collecteur est maintenant raccordé aux résultats réels du renderer de la branche d'intégration. Il reste inactif tant qu'il n'est pas démarré depuis la console du navigateur.

Démarrer une mesure (préciser le scénario et l'état du cache pour pouvoir comparer deux exports) :

```js
window.collectMapBenchmark({ scenario: "zoom-4-pan", cache: "warm" });
```

Effectuer ensuite les manipulations voulues (zoom, déplacement ou vue statique), puis exporter :

```js
const report = window.exportMapBenchmark();
copy(JSON.stringify(report, null, 2));
```

Réinitialiser une session :

```js
window.clearMapBenchmark();
```

L'export contient les statistiques min, médiane, p95, max et moyenne pour le temps total de rendu, les temps par couche, la cadence entre rendus (FPS dérivés), les compteurs de géométrie et, lorsque le navigateur l'expose, la mémoire JS. Les métadonnées incluent dimensions du viewport, DPR, zoom, renderer terrain/géographique, agent utilisateur, scénario et état de cache déclaré.

**Lecture des métriques géométriques :** `land-mask-path` mesure la préparation du masque terrestre utilisé pour découper le relief. Lorsque `Path2D` est disponible, les chemins projetés des terres sont réutilisés pour le remplissage et le masque composé est conservé dans un petit cache LRU pour les cellules de viewport identiques. Une baisse de cette métrique indique moins de préparation CPU ; elle ne mesure pas le temps d'exécution GPU.

**Important :** la cadence mesurée est l'intervalle entre deux rendus complets terminés, pas le FPS continu de l'écran. La mémoire JS n'est pas disponible dans tous les navigateurs. Les temps d'upload GPU ne sont pas encore exposés par tous les chemins WebGL et ne sont donc pas inventés. Les tests automatisés valident le collecteur, mais ne remplacent pas une session navigateur sur le matériel cible.
