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


## Relief lisible sous la souveraineté politique et impacts temporaires
Une seconde passe ETOPO en mode de composition « luminosité » restitue ombres et éclaircies au-dessus des aplats nationaux sans remplacer leurs teintes. Les impacts météoritiques de test sont ramenés à un rayon de 140 km (au lieu de 650 km), avec une couronne de lave de 10 km et une zone interdite de 55 km. La durée de l'état de surface est tirée entre 1 et 6 mois ; à expiration, lave et interdiction disparaissent, tandis que la déformation du relief reste inscrite dans la géographie. Les durées sont stockées sur les cellules et expirées selon la date de simulation.


## Révision des catastrophes et de la nomenclature française
Le rendu des cellules physiques en rectangles est supprimé : submersion, cendres, dégâts et soulèvement ne produisent plus de mosaïque de carrés. Les cellules restent un support de calcul. Lors d'un événement, le raster ETOPO est recalculé dans l'emprise locale et dessiné comme une surface continue ; les altitudes simulées peuvent déplacer la ligne de côte lorsque la surface franchit le niveau marin. Le résultat dépend de la résolution du MNT et du zoom : c'est une géomorphologie de jeu dérivée d'ETOPO, pas une reconstruction géologique scientifique.
Les impacts comprennent une cuvette et un bourrelet périphérique d'éjectas. Les boutons permettent de placer une météorite, un tsunami ou un séisme par clic sur la carte. Les tsunamis utilisent la distance côtière calculée depuis ETOPO ; les séismes modifient les altitudes et les dégâts dans leur rayon.
Les noms de pays utilisent les codes ISO-3/ISO-2 disponibles dans les propriétés GeoJSON pour obtenir une traduction française via Intl.DisplayNames, avec le dictionnaire historique en priorité. Les entités historiques sans code ISO restent à compléter au cas par cas.

Les vagues de tsunami peuvent désormais submerger temporairement les basses terres côtières selon la hauteur de vague et l'altitude ETOPO ; l'eau se retire après deux jours de simulation. Les zones réellement submergées changent temporairement la limite terre/mer dans le raster de terrain, sans laisser une mer permanente après le retrait.


## Rendu des catastrophes : côtes continues, submersion et audio
Les anneaux graphiques ne sont plus permanents : ils expirent après trois jours de simulation, sans annuler les conséquences physiques. Les altitudes modifiées sont interpolées bilinéairement entre cellules ETOPO et rendues à la résolution du canvas. Une passe locale ne peint que les pixels dont le statut terre/mer a changé : elle peut ainsi afficher une zone submergée ou une terre émergée sans mosaïque ni repeindre les frontières politiques inchangées.
La profondeur d'eau du tsunami intervient dans l'échantillonnage physique du terrain et disparaît après deux jours. Les trois catastrophes ont des signatures audio synthétisées localement avec Web Audio, sans fichier externe.


## Ajustement des catastrophes — durée, lave, séismes et villes submergées
Les anneaux d'onde et de secousse sont de nouveau visibles pendant trois jours de simulation, puis disparaissent sans annuler les déformations. La météorite affiche une couronne de lave lumineuse pendant un mois de simulation ; le tsunami conserve sa couche de submersion pendant un mois avant retrait. Un cratère terrestre isolé est maintenu au-dessus du niveau marin : il ne devient un lac que si la zone d'impact touche ou frôle une cellule océanique. Dans ce cas, les cellules du bassin passant sous le niveau marin sont marquées comme submergées durablement. Les villes dont la cellule physique la plus proche est ainsi submergée sont rendues en gris.
Le séisme produit maintenant une rupture orientée : soulèvement d'un côté, affaissement de l'autre, dégâts locaux, anneaux temporaires et cicatrice diffuse persistante. La géométrie politique reste séparée de ces modifications physiques.


## Correctifs de stabilité des catastrophes et des performances
Le contact eau/cratère est déterminé avec une marge de 3 km et privilégie les cellules ETOPO fines ; les cellules de la grille mondiale grossière ne peuvent plus déclarer à tort un impact côtier lorsqu'une grille fine est disponible. Les anneaux visuels du tsunami et de la météorite suivent la durée mensuelle de leurs effets ; ceux du séisme restent une semaine, tandis que la cicatrice et le déplacement de terrain persistent. Un déplacement tectonique non nul est calculé par défaut à partir de la magnitude.
Le raster de terrain courant est plafonné à 512 × 256 pendant les déplacements et zooms ; la passe de recalcul des côtes modifiées conserve une résolution supérieure. Une seule passe raster partagée est exécutée pour l'ensemble des événements, au lieu d'une passe complète par catastrophe.


## Réglage supplémentaire du rendu cartographique
La résolution du raster courant et de la passe de côte modifiée est plafonnée à 512 × 256 pendant les interactions. Les tests de dimensions sont alignés sur ce budget afin de limiter les allocations et les calculs par image. Le tracé de faille sismique est renforcé pour rester lisible à l'échelle mondiale.


## Lisibilité du relief et allègement du raster
Le relief est fusionné dans les aplats politiques par un mélange soft-light à contraste renforcé, plutôt que par une couche de luminosité peu perceptible. L'éclairage du relief est accentué et les teintes altimétriques sont mieux différenciées. Le raster d'affichage est abaissé de 512 × 256 à 384 × 192 pixels maximum, avec interpolation Canvas pour limiter le coût des recalculs pendant le zoom et le déplacement.
