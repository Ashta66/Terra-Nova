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


## Relief topographique multidirectionnel et navigation accélérée
Le relief ETOPO utilise maintenant quatre éclairages croisés (azimuts 315°, 45°, 135° et 225°), combinés en un ombrage en niveaux de gris à contraste élevé. Cette passe est fusionnée en mode « overlay » au-dessus des couleurs nationales : les versants, crêtes, vallées et plateaux restent visibles quelle que soit leur orientation sans effacer la souveraineté politique. Le raster reste plafonné à 384 × 192 pixels pour contenir le coût mémoire et CPU ; le contraste provient du calcul d'éclairage plutôt que d'une multiplication des pixels.

Pendant un déplacement, le canvas existant est déplacé par transformation GPU et aucun recalcul GeoJSON n'est lancé à chaque événement de pointeur. Pendant le zoom molette, le canvas est mis à l'échelle autour du curseur ; le rendu géographique complet est recalculé une fois le geste terminé. Les couches détaillées, le relief et les étiquettes sont ainsi préservés dans le rendu final, sans imposer leur coût à chaque image intermédiaire.


## Correction du cadrage et des aperçus de navigation
Le canvas est dimensionné selon les deux dimensions réelles du cadre, en conservant le ratio équirectangulaire 2:1. Il ne peut plus être calculé à partir de la seule largeur puis tronqué verticalement dans un cadre moins haut.

Le pan et le zoom temporaires ne transforment plus le canvas principal. Un bitmap de prévisualisation est placé au-dessus du rendu intact ; lorsque son déplacement ou son échelle découvre une bordure, le rendu initial reste visible dessous au lieu de laisser apparaître le fond du conteneur. À la fin du geste, le bitmap temporaire est supprimé et la carte est recalculée à la nouvelle position.


## Optimisation du cache géométrique pour les micro-déplacements
Le cache Path2D ne dépend plus de chaque variation infime du centre de la carte. Les chemins sont calculés sur un centre de vue quantifié à 1°/niveau de zoom, puis réutilisés tant que le déplacement reste dans cette cellule. L'écart maximal de placement est inférieur à environ 1,34 pixel ; les grands déplacements et les changements de zoom continuent de recalculer les chemins. Les tests couvrent désormais la réutilisation après un petit déplacement et l'invalidation après un déplacement plus large.


## Chantier de fluidité — diagnostic instrumenté
Le moteur expose désormais le temps total du rendu et les durées par couche (relief, terres/côtes, territoires, ombrage, catastrophes, frontières et étiquettes). Un panneau de diagnostic repliable affiche ces mesures directement sous la carte. Il s'agit de temps CPU côté rendu Canvas observés sur la machine du joueur, pas d'une mesure FPS universelle ; ils permettent d'identifier les couches coûteuses avant de déplacer leur calcul vers des bitmaps persistants ou un worker.

Le moteur possédait déjà un cache LRU borné de chemins projetés et un cache de surfaces raster ETOPO. La prochaine étape d'architecture reste le tampon géographique avec débordement, puis la séparation effective des couches. Ces deux changements nécessitent de valider le cadrage, les hit-tests, les catastrophes et les étiquettes ensemble ; ils ne sont pas déclarés terminés par l'ajout du diagnostic.


## Tampon de navigation avec débordement géographique
Après chaque rendu complet, le moteur prépare pendant le temps libre un bitmap de navigation 1,5 fois plus grand que le viewport. Son zoom est ajusté pour conserver l'échelle au centre tout en calculant réellement les régions voisines ; le déplacement et le zoom utilisent ce tampon au lieu d'une simple copie de la carte visible. Le tampon offre environ 25 % de débordement de chaque côté et reste facultatif : si sa préparation n'est pas terminée ou échoue, l'aperçu classique reste disponible. Il est reconstruit après le rendu final. Cette première version ne garantit pas un débordement illimité lors de très grands glissements ; le diagnostic permettra de mesurer le coût de préparation et d'ajuster le facteur.


## Cache géographique à révisions locales (20 novembre 2026)

- Les collections d'étiquettes combinant les labels régionaux et territoriaux sont conservées tant que leurs deux sources ne changent pas. L'index spatial peut donc réutiliser son index entre les images.
- Introduction de tuiles géographiques stables de 10° × 10° et d'un compteur de révision par tuile.
- Une catastrophe incrémente les révisions des tuiles contenant les cellules affectées et de leur voisinage immédiat (halo d'une tuile), nécessaire aux calculs de pente et d'ombrage.
- Le calcul gère l'enroulement des longitudes à l'antiméridien.
- Cette étape prépare l'invalidation sélective des futurs caches raster/vectoriels. Elle ne prétend pas encore précalculer les tuiles ni déplacer leur rasterisation dans un Worker : le moteur de rendu existant reste la source d'affichage.


## Optimisations du cache de relief et des sauvegardes (20 novembre 2026)

- Le cache raster de relief est désormais indexé par les révisions des tuiles visibles plutôt que par la révision globale du monde physique. Une modification située hors de la vue n'invalide donc pas inutilement son image précalculée.
- L'expiration des effets temporaires (lave, zone d'impact, eau de tsunami) incrémente également les révisions des tuiles réellement modifiées et de leur voisinage, afin que le relief et les côtes se rafraîchissent à la fin d'un événement.
- Les sauvegardes sérialisent les cellules physiques modifiées sous forme de différences indexées par rapport aux cellules de base. Le chargement reconstruit le tableau complet avant validation. Les sauvegardes anciennes non compactées restent acceptées.
- Cette compression concerne les données physiques dérivées ; elle ne modifie ni la simulation, ni les identifiants des cellules.


## Première séparation effective des couches de rendu (20 novembre 2026)

- Les effets géophysiques (déformations visibles, zones d'impact, inondations et marqueurs) peuvent maintenant être rendus dans un canvas transparent indépendant, superposé au canvas cartographique.
- Pendant un déplacement ou un zoom, cette couche est masquée et le tampon de navigation inclut les effets physiques ; elle est réaffichée après le rendu stabilisé.
- Le relief, les frontières et les territoires restent dans le canvas principal à ce stade. La séparation progressive évite de déplacer toutes les couches simultanément et limite le risque de régression.


### Cache raster : test de non-invalidation hors champ

Le cache de relief calcule une signature à partir des seules tuiles géographiques visibles. Les révisions hors champ ne changent pas cette signature ; une tuile visible modifiée la change. Le calcul tient compte du passage de l'antiméridien. Ces tests valident la clé d'invalidation, pas encore un précalcul de chaque tuile dans un Worker.


## Optimisation complémentaire du relief et des catastrophes (20 novembre 2026)

- Les aplats politiques et les contours territoriaux sont rendus en deux passes. Les aplats précèdent l'ombrage indépendant ; les contours fins et la mise en évidence de la nation choisie sont dessinés ensuite.
- Les contours territoriaux ont été affinés. L'opacité des aplats est réglable en jeu, avec un mode politique et un mode relief.
- La résolution du raster de relief passe à 1024 × 512 pixels au maximum pour une vue mondiale à pleine qualité.
- Un Web Worker précalcule les ombres multidirectionnelles à la résolution native de la grille ETOPO. En cas d'indisponibilité, le calcul synchrone reste disponible.
- Les cellules géophysiques distinguent l'océan connecté au bord du monde des plans d'eau intérieurs isolés. Les distances côtières et les impacts marins se fondent sur les eaux connectées à la résolution de la grille géophysique.


### Cache raster réellement partitionné en tuiles

Le raster ETOPO est désormais précalculé et mis en cache par tuiles géographiques de 10° × 10°. Chaque tuile est réutilisée lors des déplacements et changements de zoom ; sa clé dépend de sa résolution, du type de passe (couleur, ombrage ou côtes modifiées), de l'état de précalcul Worker et de sa révision physique locale. Le cache LRU conserve jusqu'à 2 200 surfaces, avec une résolution adaptative de 48 à 192 pixels par tuile. Les environnements sans OffscreenCanvas utilisent un canvas DOM ; les contextes de test sans drawImage conservent le chemin raster synchrone de repli.


### Composition cartographique à image visible unique

- Le rendu géographique complet (relief, frontières, labels et catastrophes) est produit dans un canvas de scène détaché du DOM.
- Le seul canvas visible est `#world-map`. Il reçoit une composition bitmap de la scène, transformée par calcul matriciel selon les différences entre le viewport rendu et le viewport demandé.
- Pendant le glisser et la molette, seule la composition de l'image existante est actualisée à chaque frame ; aucune copie de canvas supplémentaire n'est ajoutée à la page et aucune transformation CSS n'est appliquée.
- Après 140 ms sans interaction, la scène est recalculée à la résolution DPR (plafonnée à 2), puis la référence de viewport est synchronisée.
- Les couches physiques sont dessinées dans le canvas de scène lui-même afin d'éviter un second canvas visible.
- Le canvas visible conserve une taille CSS indépendante de sa résolution bitmap. Le fond et le ratio 2:1 sont pilotés par CSS.


## Relief : éclairage exagéré (étape 1)

Le calcul du hillshade amplifie désormais les pentes par défaut d’un facteur 14 et combine une lumière principale à 315°/40° (70 %) et une lumière d’appoint à 20°/50° (30 %). La réponse est normalisée sur une surface plane et bornée entre 0,4 et 1,6. Le Worker reçoit le même facteur d’exagération afin que le relief pré-calculé et le calcul de secours restent cohérents.


## Palette d’altitude : ligne de neige à 2 000 m (étape 2)

La rampe terrestre a été remplacée par une palette sans neige jusqu’à 1 999 m, avec un seuil net à 2 000 m puis une neige presque blanche à 4 000 m. Cette règle est identique à toutes les latitudes ; la palette océanique reste inchangée.


## Rendu du relief en trois modes (étape 3)

Le raster expose désormais les modes `color`, `tint` et `shade`. Les caches par tuiles et par surface incluent le mode et le facteur d’exagération. Le calcul pré-calculé par Worker est indexé par facteur d’exagération. Le chemin de repli limite le raster à 1 024 × 512 pixels, ou à la taille de la grille lorsqu’elle est plus petite.


## Relief en deux passes sur un tracé terrestre partagé (étape 4)

Le renderer construit un Path2D terrestre unique, puis applique une première passe `tint` avant les aplats politiques et une seconde passe `shade` en composition `hard-light` après les aplats. L’exagération (14 par défaut) et la force d’ombrage (0,85) sont transmises depuis `renderMapFrame`. Les deux passes sont désactivées si le relief est désactivé ou si la projection n’est pas équirectangulaire.


## Transparence des aplats politiques (étape 5)

L’opacité politique par défaut passe à 0,45 (45 %) afin de laisser davantage de contraste au relief sous-jacent. La valeur est appliquée par le même chemin de peinture, qu’il utilise un Path2D ou le tracé Canvas de repli.


## Réglages visuels du relief (étape 6)

Deux curseurs permettent d’ajuster l’exagération verticale (1 à 30, valeur initiale 14) et la force de la passe d’ombrage (0 à 100 %, valeur initiale 85 %). Les changements redessinent la carte ; à la validation du curseur d’exagération, le Worker recalcule aussi sa variante pré-calculée. Aucun champ de sauvegarde n’est ajouté ou modifié.
