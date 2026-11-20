# Protocole de benchmark du moteur cartographique

Ce protocole complète les tests Node : ils vérifient les invariants et la stabilité, mais ne remplacent pas un essai avec un navigateur et un pilote GPU réels.

## Préparation

1. Utiliser la même machine, le même navigateur, la même taille de fenêtre et le même niveau de zoom pour chaque comparaison.
2. Désactiver les extensions qui injectent du code dans la page et fermer les onglets consommateurs de GPU.
3. Charger la carte jusqu'à la fin des téléchargements et attendre 10 secondes.
4. Refaire chaque scénario trois fois et retenir médiane, minimum et maximum.

## Scénarios

- Monde : zoom 1, déplacement horizontal d'environ un écran, puis retour.
- Régional : zoom 4, pan continu pendant 10 secondes.
- Rapproché : zoom 8, pan dans les deux directions pendant 10 secondes.
- Zoom répété : alterner zoom avant/arrière pendant 10 secondes.
- Pression atlas : viewport large et zoom régional, en surveillant le LOD sélectionné et le fallback.

## Mesures à relever

Les valeurs sont exposées sur le canvas cartographique via ses attributs `data-*` :

- `renderTotalMs`, `renderTerrainMs`, `renderPoliticalMs`, `renderLabelsMs`, `renderDynamicMs`
- `terrainRenderer`
- `terrainWebglTileDrawCalls`, `terrainWebglTileVisible`, `terrainWebglTileLod`
- `terrainWebglTileHits`, `terrainWebglTileMisses`, `terrainWebglTileUploads`
- `terrainWebglTileUploadedBytes`, `terrainWebglTileBuildMs`, `terrainWebglTileUploadMs`
- `terrainWebglTileFallback`, `terrainWebglTileTransition`, `terrainWebglTileCapacity`
- `terrainWebglTileAtlasBytes`, `terrainWebglTileCapacityLimited`
- `terrainWebglTilePending`, `terrainWebglTileWaiting`
- `geographicWebglCacheBuildMs` : construction CPU des meshes et upload des buffers lors d'un cache miss
- `geographicWebglDrawSubmitMs` : temps CPU de soumission des commandes WebGL pour les couches géographiques
- `geographicWebglTotalMs` : temps total du passage du renderer géographique (construction éventuelle + soumission)

Dans la console du navigateur, sélectionner le canvas puis exécuter :

```js
const canvas = document.querySelector("canvas");
const keys = [
  "renderTotalMs", "renderTerrainMs", "renderPoliticalMs",
  "renderLabelsMs", "renderDynamicMs", "terrainRenderer",
  "terrainWebglTileDrawCalls", "terrainWebglTileVisible",
  "terrainWebglTileLod", "terrainWebglTileHits",
  "terrainWebglTileMisses", "terrainWebglTileUploads",
  "terrainWebglTileUploadedBytes", "terrainWebglTileBuildMs",
  "terrainWebglTileUploadMs", "terrainWebglTileFallback",
  "terrainWebglTileCapacity", "terrainWebglTileAtlasBytes",
  "terrainWebglTileCapacityLimited",
  "terrainWebglTileTransition", "terrainWebglTilePending",
  "terrainWebglTileWaiting", "geographicWebglCacheBuildMs",
  "geographicWebglDrawSubmitMs", "geographicWebglTotalMs"
];
Object.fromEntries(keys.map(key => [key, canvas?.dataset?.[key] ?? null]));
```

## Matrice de scénarios reproductibles
Effectuer les relevés suivants à dimensions de canvas, ratio de pixels et jeu de données identiques. Pour chaque scénario, répéter au moins 5 fois et conserver médiane et percentile 95 ; séparer le premier passage (cache froid) des passages suivants (cache chaud).

| Scénario | Zoom | Interaction | Cache | Objectif |
| --- | --- | --- | --- | --- |
| Vue mondiale | 1× | immobile | froid puis chaud | coût initial et coût stable des couches globales |
| Vue régionale | 2× | immobile | froid puis chaud | coût des frontières et détails intermédiaires |
| Vue rapprochée | 4× | immobile | froid puis chaud | coût des détails locaux et densité des lignes |
| Vue très rapprochée | 8× | immobile | froid puis chaud | comportement à forte densité géométrique |
| Pan continu | 2× puis 4× | déplacement régulier | chaud | stabilité des temps et réutilisation des caches |
| Zoom progressif | 1× → 8× → 1× | zoom ancré | chaud | transitions, uploads et pics de soumission |
| Aller-retour géographique | 3 zones éloignées | pan rapide | froid puis chaud | évictions, reconstructions et efficacité du cache |

Pour chaque passage, relever `renderTotalMs`, `renderTerrainMs`, les trois métriques géographiques globales, les métriques par couche, les draw calls, triangles, uploads, octets et l'intervalle entre rendus. Ne pas agréger les mesures froides et chaudes. Documenter le navigateur, la version, le GPU, le système, le ratio de pixels et la taille du canvas.

## Comparaison

Comparer Canvas 2D et WebGL sur les mêmes scénarios, lorsque le mode de rendu peut être sélectionné sans modifier les données. Relever séparément :

- temps CPU de soumission ;
- temps GPU, uniquement si l'extension de mesure est disponible ;
- intervalle entre rendus (ne pas l'assimiler à un FPS continu) ;
- uploads et octets transférés ;
- trous, raccords visibles, scintillements et transitions incomplètes ;
- mémoire GPU si le navigateur fournit une mesure fiable.

Ne pas conclure à un gain de performances sur la seule base du temps de soumission CPU. Un résultat n'est validé qu'après vérification visuelle et répétition sur au moins deux classes de GPU.


## Mesures par couche géographique
Le canvas expose des métriques dédiées pour chaque couche GPU, y compris les couches de contours et les limites administratives :

- `data-geographic-webgl-layer-{nom}-build-ms` (dataset `geographicWebglLayer{Nom}BuildMs`) : construction des buffers et upload CPU associés, uniquement sur cache miss.
- `data-geographic-webgl-layer-{nom}-draw-submit-ms` : temps CPU de soumission des commandes pour cette couche.
- `data-geographic-webgl-layer-{nom}-total-ms` : somme des deux temps précédents.
- `data-geographic-webgl-layer-{nom}-features` et `-skipped-features` : entités dessinées par le GPU et entités refusées lors de la construction du mesh.
- `data-geographic-webgl-layer-{nom}-fallback-features` : nombre d'entités redessinées par Canvas parce que le chemin WebGL ne les prend pas en charge. Le compteur agrégé est exposé par `geographicWebglFallbackLayerFeatures` : il additionne les entités de fallback couche par couche, donc une même géométrie peut compter plusieurs fois si elle est dessinée dans plusieurs couches (par exemple remplissage et contour).

Le compteur de fallback compte les entités dirigées vers Canvas, pas seulement celles dont la géométrie produit effectivement des pixels dans le viewport. Il mesure donc la charge de compatibilité, pas le nombre de primitives visibles.
- `data-geographic-webgl-layer-{nom}-draw-calls` et `-cache-hit` : commandes GPU soumises et état du cache de buffers.
- `data-geographic-webgl-layer-{nom}-triangles`, `-uploads` et `-uploaded-bytes` : volume géométrique et transferts. Pour les rubans de lignes et de contours, le nombre de triangles inclut les quads des segments ainsi que les disques de raccord et de cap.

Les métriques de chaque couche sont réinitialisées lorsqu'elle n'est plus soumise au renderer ou lorsque le rendu géographique repasse entièrement sur Canvas, afin de ne pas conserver des valeurs obsolètes entre deux frames.

Les noms `{Nom}` correspondent aux clés `land`, `glaciers`, `lakes`, `landBoundaries`, `glacierBoundaries`, `lakeBoundaries`, `rivers`, `administrativeBoundaryLines` et `administrativeBoundaryPolygons`. Ces durées sont des mesures CPU d'instrumentation, pas des temps GPU ni une mesure de FPS.

## Contrôle des contours WebGL
- Les lignes et frontières sont dessinées comme rubans triangulés, pas avec `gl.LINES`.
- La largeur est fournie en pixels de la surface GPU (largeur CSS multipliée par le ratio de rendu).
- Vérifier les épaisseurs à plusieurs densités d'écran, aux angles aigus, aux jonctions de segments et autour de l'antiméridien.
- Les segments partagent des disques de raccord en espace écran aux sommets communs (12 facettes), ce qui ferme les jours aux angles et intersections.
- Les extrémités réellement libres des lignes ouvertes reçoivent également des caps circulaires de 12 facettes ; les anneaux fermés n'en reçoivent pas.
- La détection utilise le degré des extrémités, regroupées à 5 décimales et calculées séparément pour chaque tracé (chaque LineString, anneau ou partie d'un MultiLineString). Deux entités indépendantes qui se touchent ne sont donc plus fusionnées en une jonction.
- Les croisements au milieu de segments, sans sommet partagé, ne sont pas détectés comme des jonctions. Contrôler les réseaux denses, les lignes distinctes très proches et les croisements à plusieurs densités d'écran ; le contrôle visuel réel reste obligatoire.

## Instrumentation des couches géographiques
- Le renderer expose séparément le temps CPU de construction des meshes (`geographicWebglCacheBuildMs`), le temps CPU de soumission des commandes (`geographicWebglDrawSubmitMs`) et le temps total de son passage (`geographicWebglTotalMs`).
- Les temps de construction sont nuls sur un cache hit ; ils ne comprennent pas une mesure fiable du temps d'exécution GPU.
- Pour comparer les images, relever ces trois valeurs en même temps que les uploads, octets transférés, triangles, draw calls et métriques du relief.
