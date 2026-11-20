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


## Complément 1812, nomenclature française et géophysique locale
Pour 1812, le chargeur tente désormais un cliché AtlasPI (API publique Apache-2.0) avant le repli Historical Basemaps 1815. Seules les entités retournant une géométrie Polygon/MultiPolygon exploitable sont admises ; chaque feature conserve son identifiant, sa provenance et son score de confiance lorsqu'ils sont fournis. En cas d'indisponibilité réseau, de CORS ou de réponse sans géométries, le chargeur revient au cliché historique précédent sans bloquer la carte. Ce chemin est un complément conditionnel, pas une validation manuelle de toutes les frontières de 1812.
Les labels et les listes de nations appliquent une première nomenclature française, complétée par les noms français natifs fournis par AtlasPI et les codes ISO-2 via Intl.DisplayNames. Les enclaves connues comme l'Aquitaine sous souveraineté anglaise reçoivent un libellé distinct (« Aquitaine anglaise »). Les noms historiques rares non couverts par le dictionnaire peuvent encore rester dans leur langue source et devront être enrichis par lots.
Lors d'un impact météoritique de test, le moteur remplace localement les cellules grossières par une grille issue du MNT ETOPO à pas de 2 pixels (~1/3°), puis rejoue les événements antérieurs dans cette zone. Le reste du monde conserve sa grille légère d'environ 2°. Le raster physique sait maintenant consulter les niveaux de résolution les plus fins en priorité.


## Rendu continu des impacts météoritiques
Les cellules fines de calcul d'un impact ne sont plus dessinées comme des aplats bleus/oranges. Les cellules crater/impact-zone restent utilisées par le moteur d'altitude, tandis que le rendu ajoute des anneaux continus centrés sur l'événement. Cela supprime la mosaïque visuelle sans annuler la déformation géologique. Les autres événements (submersion, lave, cendres et soulèvement) conservent leurs couches dédiées.
