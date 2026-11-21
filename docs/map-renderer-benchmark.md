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

## Généralisation géographique adaptative

Les profils de simplification des côtes et du masque terrestre sont exprimés en pixels projetés. La tolérance et l'aire minimale des anneaux diminuent lorsque le zoom augmente : les vues mondiales éliminent davantage de détails coûteux, tandis que les vues rapprochées restaurent progressivement les petites formes côtières et les îles. Le masque physique reste volontairement plus simplifié que les contours d'habillage, sans inverser cette progression.

Les collections terrestres possèdent également un cache LOD paresseux : les versions mondiales grossière, intermédiaire et de base, ainsi que la variante régionale, sont générées à la première entrée dans leur palier puis réutilisées. Un déplacement dans un même palier conserve donc les mêmes objets GeoJSON, ce qui permet aussi au cache des chemins projetés de rester efficace. Les niveaux plus détaillés sont calculés depuis la collection de base et les ancres de coordonnées partagées continuent de préserver les frontières communes.

Les tests de profils vérifient les niveaux mondial, régional et rapproché, ainsi que la cohérence des profils utilisés par les aplats et les contours territoriaux. Ces tests valident la sélection des tolérances ; seul un benchmark visuel et temporel sur navigateur permet de quantifier le gain et de contrôler la fidélité des côtes.

**Important :** la cadence mesurée est l'intervalle entre deux rendus complets terminés, pas le FPS continu de l'écran. La mémoire JS n'est pas disponible dans tous les navigateurs. Les temps d'upload GPU ne sont pas encore exposés par tous les chemins WebGL et ne sont donc pas inventés. Les tests automatisés valident le collecteur, mais ne remplacent pas une session navigateur sur le matériel cible.

## Transitions entre niveaux LOD

Le sélecteur de détail applique une hystérésis autour du seuil régional afin d'éviter les bascules répétées lorsque le zoom oscille à proximité de la limite. Lorsqu'un changement de source terrestre est effectivement rendu, le moteur conserve temporairement l'image de la scène précédente et compose un fondu croisé de 220 ms avec la nouvelle scène. Les deux images sont réutilisées pendant cette courte transition : les géométries ne sont pas recalculées à chaque frame, seule leur composition alpha est synchronisée par `requestAnimationFrame`.

Le fondu porte sur la scène cartographique complète afin de préserver la cohérence visuelle des couches qui partagent la projection. Il est interrompu et recapturé proprement si une nouvelle transition LOD intervient avant sa fin. Cette transition ajoute temporairement une surface bitmap de la taille de la scène ; son coût mémoire et son impact sur la fluidité doivent être vérifiés sur les appareils cibles. Aucun gain de performance n'est présumé avant un nouveau benchmark navigateur.

## Préparation prédictive et instrumentation LOD

Le moteur prépare désormais le palier terrestre adjacent dans la direction du zoom, après le rendu courant et pendant une période d'inactivité. La tâche est annulable dès qu'un nouveau rendu prend la main et elle est abandonnée si une interaction a repris. Le préchauffage ne change jamais la géométrie affichée : il remplit simplement le cache du prochain palier. Sur les navigateurs sans `requestIdleCallback`, un délai différé sert de repli.

La simplification elle-même reste synchrone à l'intérieur de cette tâche différée ; elle n'est pas encore exécutée dans un Worker dédié. Le mécanisme évite donc de la lancer au milieu d'un geste, mais une préparation particulièrement volumineuse peut encore occuper le thread principal pendant une période d'inactivité. Ce point devra être mesuré avant toute migration vers un Worker, car le transfert structuré des collections GeoJSON peut lui-même coûter du temps et de la mémoire.

Le cache LOD expose le nombre de niveaux générés et conservés, le temps cumulé et le dernier temps de génération, le nombre de sommets supprimés et les tolérances mises en cache. Le collecteur de benchmark exporte ces valeurs avec la durée nominale de transition et la taille de la surface de fondu. Le fondu est désactivé lorsque la surface temporaire dépasserait 48 Mio, ou 24 Mio sur les appareils déclarant au plus 4 Gio de mémoire. Cette limite réduit le risque d'une allocation bitmap excessive ; elle ne remplace pas une mesure réelle du pic mémoire.

Les tests couvrent le préchauffage vers un niveau plus détaillé et vers un niveau plus grossier, la réutilisation du cache et l'export des nouvelles métriques. Les mesures réelles de fluidité, de mémoire et de coût de préparation restent à effectuer dans le navigateur cible.


## Instrumentation WebGL détaillée et conservation des buffers

Le renderer géographique exporte maintenant, pour chaque passage de couche, le temps de préparation des géométries, le temps d'upload des buffers, le coût de construction du cache, le temps de soumission des commandes GPU, les octets transférés, les octets des buffers conservés, les draw calls et les triangles. Le collecteur expose ces valeurs sous les clés `webgl:*`. Les mesures de temps et les compteurs d'octets sont séparés : les octets ne sont jamais présentés comme des millisecondes.

Le renderer est appelé successivement pour plusieurs familles indépendantes (terres/côtes, détails géographiques, frontières). Les caches de buffers sont désormais conservés entre ces appels. Ils sont gérés par un LRU plafonné à 12 couches, suffisant pour les familles actuelles, et libérés explicitement ou lors de l'éviction. Cela évite qu'un appel consacré aux frontières invalide les buffers du littoral, qui seraient sinon reconstruits au rendu suivant. Le test d'intégration vérifie la réutilisation entre familles et la libération explicite.

Le benchmark expose aussi les tailles et les compteurs de succès/échec des caches de chemins projetés et du masque terrestre composé. L'estimation mémoire du cache de chemins projetés utilise 32 octets par sommet et ne constitue pas une mesure native de Path2D ; elle sert uniquement à suivre le budget logiciel. Les buffers GPU conservés sont comptabilisés séparément à partir des tableaux CPU associés.

## Généralisation LOD dans un Worker

Le préchauffage du prochain palier LOD utilise désormais un Worker module lorsque le navigateur le permet. Le thread principal conserve la géométrie de base pendant le calcul ; la version généralisée est ajoutée au cache à la réception du résultat, puis la carte est invalidée pour afficher le nouveau palier préparé. Si Worker est indisponible ou échoue, le moteur conserve le chemin de repli local existant. Le transfert structuré de la collection GeoJSON a lui-même un coût mémoire et de copie ; les benchmarks doivent donc comparer la fluidité et la mémoire sur appareil réel avant de conclure au bénéfice net.

Les métriques `lod:generationTimeMs` et `lod:lastGenerationMs` mesurent désormais le temps écoulé jusqu'à la réception du résultat worker lorsqu'il est utilisé, et non uniquement le temps CPU interne du worker. Elles ne doivent donc pas être interprétées comme un profilage CPU pur.

## Protocole après optimisation

Pour mesurer l'effet de la conservation des buffers, exécuter le même scénario monde zoom 20 / pan avec cache chaud, DPR et viewport identiques. Vérifier en particulier :

- `layer:land-feature-classification`, `layer:land-mask-path` et `layer:terres-et-cotes` ;
- `webgl:cacheHit`, `webgl:geometryBuildMs`, `webgl:bufferUploadMs`, `webgl:drawSubmitMs` ;
- `webgl:uploadedBytes` et `webgl:cachedGpuBytes` ;
- `geometryCache:cachedPaths`, `geometryCache:cachedVertices` et `geometryCache:estimatedBytes` ;
- `lod:lastGenerationMs`, cadence des rendus et mémoire JS.

Les changements réduisent les reconstructions de buffers prévues par l'architecture ; aucun gain chiffré n'est revendiqué avant un nouvel export Pixel 10.
