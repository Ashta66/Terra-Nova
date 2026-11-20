# Audit initial des frontières historiques — TERRA NOVA

Historical Basemaps fournit des GeoJSON WGS84 avec NAME, SUBJECTO (puissance coloniale), PARTOF et BORDERPRECISION. Le projet est explicitement en cours de construction et demande une vérification croisée. Les sociétés anciennes peuvent se chevaucher et les frontières sont parfois floues.

## Clichés vérifiés dans l'index
1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010. Le jeu choisit le cliché le plus proche et n'interpole pas les polygones.

## Contrôles ciblés
- France : présente dans plusieurs clichés ; extension exacte à contrôler par régions.
- Nouvelle-France : nom explicite dans le cliché 1700.
- Empire espagnol : Cuba, Hispaniola, Nouvelle-Espagne, Pérou et vice-royautés figurent dans plusieurs clichés.
- Empire britannique : British Guiana, British East India Company, British Raj et autres territoires apparaissent selon les dates.
- Empire napoléonien : aucun cliché 1812 dans l'index. 1800 et 1815 ne décrivent pas l'apogée napoléonienne : lacune majeure identifiée.

## Corrections
Les territoires coloniaux héritent de la couleur SUBJECTO, tout en conservant leur nom. Les peuples, tribus et régions culturelles ne sont plus supprimés par une heuristique : ils restent visibles comme zones translucides d'influence, sans être automatiquement déclarés souverains. Les statuts explicitement contesté, influence et non attribué sont différenciés.

## Sources complémentaires
AtlasPI annonce des géométries historiques, événements datés, sources académiques et scores de confiance ; API publique Apache 2.0. CShapes 2.0 couvre les États indépendants et territoires dépendants de 1886 à 2019 (Europe à partir de 1816), utile pour l'époque moderne mais pas pour la Nouvelle-France ou Napoléon.

L'index confirme la présence d'entités nommées, pas la justesse de chaque polygone. Un audit complet nécessite une comparaison régionale avec des atlas spécialisés.

## Intégration géophysique à la carte
Les cellules physiques modifiées sont maintenant superposées au rendu cartographique. Le raster ETOPO utilise l'altitude simulée uniquement dans les cellules modifiées ou submergées ; les cellules intactes conservent l'échantillonnage ETOPO natif afin de ne pas aplatir les montagnes. La représentation physique reste actuellement une grille d'environ 2° : le recalcul vectoriel des nouveaux contours de côte à partir d'une grille plus fine est une étape ultérieure, non prétendue comme déjà terminée.
