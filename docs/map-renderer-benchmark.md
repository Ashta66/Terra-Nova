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
  "terrainWebglTileWaiting"
];
Object.fromEntries(keys.map(key => [key, canvas?.dataset?.[key] ?? null]));
```

## Comparaison

Comparer Canvas 2D et WebGL sur les mêmes scénarios, lorsque le mode de rendu peut être sélectionné sans modifier les données. Relever séparément :

- temps CPU de soumission ;
- temps GPU, uniquement si l'extension de mesure est disponible ;
- intervalle entre rendus (ne pas l'assimiler à un FPS continu) ;
- uploads et octets transférés ;
- trous, raccords visibles, scintillements et transitions incomplètes ;
- mémoire GPU si le navigateur fournit une mesure fiable.

Ne pas conclure à un gain de performances sur la seule base du temps de soumission CPU. Un résultat n'est validé qu'après vérification visuelle et répétition sur au moins deux classes de GPU.
