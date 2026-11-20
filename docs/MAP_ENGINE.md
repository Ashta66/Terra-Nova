# Moteur cartographique — premier socle

Ce lot ajoute des briques indépendantes de rendu :
- projections équirectangulaire, Mercator bornée et orthographique ;
- thèmes cartographiques pilotés par l'année, avec un paramètre de niveau technologique ;
- rendu Canvas d'une GeoJSON FeatureCollection, grille géographique et polygones ;
- couche mondiale locale chargée depuis les fichiers du jeu, sans API, CDN ou service cartographique.

Le dépôt embarque `data/ne_110m_land.geojson`, un fond physique mondial Natural Earth à l'échelle 1:110m (127 entités Polygon, 128 anneaux et environ 5 143 positions). Deux couches physiques complémentaires sont également embarquées : 24 grands lacs et 13 grands cours d'eau. Le moteur les dessine au-dessus des terres avec des styles propres. Des hachures discrètes, limitées aux époques papier, donnent une texture d'atlas ; elles sont purement décoratives et ne prétendent pas représenter une altitude. Le relief altimétrique réel et les frontières politiques historiques restent à intégrer.

L'orthographique est une projection de globe de base ; la rotation interactive, le clipping précis des géométries traversant le limbe et la transition animée globe/atlas restent à réaliser. Les projections d'affichage ne servent jamais aux calculs de simulation.

Les thèmes constituent une première palette fonctionnelle, pas encore des textures finales : les motifs papier, gravure, topographie et holographie seront ajoutés dans le travail artistique et le rendu avancé. La palette évolue progressivement à l'approche de chaque nouvelle ère ; le niveau technologique peut accélérer cette évolution.

## Données et attribution

Le fond terrestre provient de Natural Earth Vector (`ne_110m_land`, échelle 1:110m), fichier GeoJSON issu du dépôt `nvkelso/natural-earth-vector`. Les données Natural Earth sont dans le domaine public, y compris pour un usage commercial et la redistribution. La mention « Made with Natural Earth » est facultative et conservée par transparence. Voir `docs/DATA_SOURCES.md` pour les références.


## Navigation interactive de la carte — lot 2.7 (première étape)

La carte équirectangulaire dispose maintenant d'une navigation utilisateur :
- zoom progressif avec boutons +/−, de 100 % à 2 400 % ;
- zoom à la molette autour du pointeur, pour garder la zone visée sous la souris ;
- déplacement par glisser-déposer à la souris ou au pointeur ;
- recentrage sur la vue mondiale initiale ;
- indicateur de zoom et désactivation des commandes aux limites ;
- gestes pointeur utilisables sur écran tactile.

Le zoom et le centre sont des paramètres de vue transmis au moteur de projection. Ils ne modifient ni les géométries sources, ni les données de simulation, ni les distances du monde. Les projections Mercator et équirectangulaire acceptent un centre et un facteur de zoom ; la vue active de l'interface reste équirectangulaire.

Limites connues :
- la navigation reste un planisphère 2D ; elle ne constitue pas encore une rotation de globe ;
- les géométries vectorielles qui traversent l’antiméridien sont déroulées pour suivre le trajet le plus court ; le raster de relief utilise une longitude périodique ;
- le zoom augmente le grossissement mais n'ajoute pas encore de nouvelles données régionales : le détail est limité par Natural Earth 1:110m ;
- la longitude est cyclique au zoom régional ; au zoom mondial, la caméra est recentrée pour conserver un planisphère unique.


## Labels cartographiques progressifs — choix C validé

Le joueur a retenu l'option C : un mélange de labels visibles automatiquement et de détails interactifs.

- Monde : noms des continents et océans.
- Zoom à partir de 2× : sélection de villes historiques importantes, en cohérence éditoriale avec le départ 1444.
- Survol d'un label : infobulle avec le nom et le type de lieu.
- Clic : infobulle enrichie des coordonnées géographiques.
- Le moteur dessine les labels après les couches physiques et renvoie leurs zones de détection pour l'interface.
- Les collisions entre labels sont filtrées pour limiter la surcharge visuelle.

Données : `data/ne_110m_map_labels.geojson`. Cette première couche est une sélection éditoriale de continents, océans et villes, pas un inventaire exhaustif. Les noms de pays modernes sont volontairement absents : TERRA NOVA commence en 1444, et les frontières/noms politiques doivent être établis avec des sources historiques adaptées avant affichage. Les niveaux de zoom et règles de collision seront affinés avec des données régionales plus détaillées.


## Données de relief ETOPO — extraction validée (20 novembre 2026)

Une extraction mondiale NOAA ERDDAP a été convertie en grille brute 2 160 × 1 080, Int16 little-endian, en mètres (4 665 600 octets). Les coordonnées ont été réordonnées du nord vers le sud et de −180° à +180°. Le contrôle a confirmé 1 080 × 2 160 valeurs finies, une plage d'altitude de −10 511 à 6 734 mètres après arrondi et la référence verticale EGM2008.

La source extraite est décimée par stride 10 : elle n'est pas moyennée par blocs. Le binaire, l'en-tête, les métadonnées et le script reproductible `data/terrain/convert-etopo-erddap.py` sont présents dans `data/terrain/` sur `main` et `dev`. Le chargement et le premier rendu sont intégrés sur `dev` ; la validation visuelle navigateur reste à faire.


## Première intégration du relief raster ETOPO

Le module `src/world/terrain.js` lit le raster Int16 little-endian, valide ses dimensions, interpole les altitudes et génère une image de terrain colorisée. Les altitudes émergées utilisent une palette hypsométrique progressive et un hillshade directionnel (lumière nord-ouest à 45°), calculé à partir des gradients d'altitude et corrigé par la latitude ; une surface plane conserve un facteur neutre. Les altitudes marines utilisent une gamme bleu-gris resserrée, sans ombrage local détaillé. Le renderer superpose ensuite les contours terrestres, côtes, lacs, rivières, glaciers et labels.

Le chargement est facultatif et ne bloque pas la carte si le binaire est absent. Chemin attendu : `data/terrain/etopo_global_10m_i16.bin`. Le binaire est désormais versionné dans `data/terrain/` sur `main` et `dev` ; seul ce fichier est lu par le navigateur. Le calcul du raster est plafonné à 1 024 × 512 pixels avant agrandissement pour limiter le coût des redessins.

Choix de lisibilité : les profondeurs océaniques sont regroupées en grandes masses de couleur proches ; le plateau continental est légèrement distingué près des côtes, tandis que fosses et dorsales ne reçoivent pas d'ombrage local. Cette simplification évite que les détails sous-marins concurrencent le relief terrestre et réduit les échantillonnages par pixel. Limites : palette hypsométrique illustrative, ombrage terrestre simplifié, pas encore de bathymétrie activable par couche ni de rendu WebGL. Le raster est un échantillonnage stride 10. Cette première version n'affiche le raster que pour la projection équirectangulaire ; les projections Mercator et orthographique masquent la couche jusqu'à l'ajout d'un pipeline de reprojection adapté. Le globe et la transition globe/atlas nécessiteront un pipeline spécifique.


## Classes visuelles du relief terrestre

Le raster ETOPO est maintenant interprété avec des classes locales légères dérivées de l'altitude et des quatre voisins déjà échantillonnés pour le hillshade : montagnes, plateaux, vallées, collines, plaines et basses terres. Les classes modulent très légèrement la palette hypsométrique pour rendre les formes terrestres plus lisibles sans ajouter de pictogrammes ni de couche vectorielle artificielle. Les seuils sont des heuristiques visuelles adaptées à l'aperçu global 10 minutes d'arc ; ils ne constituent pas un jeu de données géomorphologiques sourcé ni une classification scientifique. Les glaciers et les grands sommets restent rendus par leurs couches de référence dédiées. La bathymétrie reste volontairement sobre et n'est pas classifiée en micro-reliefs.


## Fluidité de navigation — optimisation initiale

- Les événements de déplacement et de molette sont regroupés sur une seule image via `requestAnimationFrame` : plusieurs événements reçus entre deux images ne déclenchent plus plusieurs rendus complets.
- Pendant un glisser-déposer, le canvas déjà rendu est déplacé par transformation GPU/compositeur (`translate3d`) : aucun recalcul du raster ou des géométries n'est nécessaire pendant le geste. Le rendu géographique complet est relancé au relâchement.
- Le relief est généré sur une surface hors écran lorsque le navigateur le permet, puis composé dans le canvas à l'échelle logique CSS. Cela évite de mélanger les coordonnées physiques du canvas haute densité et les coordonnées logiques du moteur.
- Les géométries vectorielles et les labels sont recalculés une seule fois à la fin du déplacement. Une mise en cache des couches statiques et un vrai niveau de détail régional restent des optimisations ultérieures.
- Limite : le gain doit encore être mesuré dans un navigateur réel sur plusieurs configurations ; la CI ne mesure pas les FPS.


## Zoom fluide et rendu à la demande — optimisation suivante

- La molette met à jour immédiatement le centre et le facteur de zoom, mais affiche d'abord une transformation CSS du canvas existant. Le raster ETOPO et les géométries ne sont recalculés qu'après une courte pause dans le geste (130 ms), ce qui évite de recalculer le relief à chaque cran de molette.
- Le point sous le pointeur au début d'une séquence de molette reste l'ancre du zoom pendant cette séquence. Les boutons +/− conservent leur rendu direct.
- Une signature de rendu empêche de redessiner la carte lorsque seule l'horloge avance dans la même année et que la vue n'a pas changé.
- Le canvas est préparé pour la composition graphique via `will-change: transform`. Le navigateur reste libre de décider du chemin matériel.
- Limites : le zoom à la molette est une prévisualisation transformée, légèrement moins nette pendant le geste ; le rendu haute qualité revient à la fin. Les véritables niveaux de détail géographiques régionaux nécessitent des données à plus grande échelle, non encore embarquées.


## Relief allégé et zoom étendu — 20 novembre 2026

- Le raster de terrain est plafonné à **512 × 256 pixels** pour le rendu normal (contre 768 × 384 précédemment). Le rendu adaptatif conserve ses facteurs de qualité réduite pendant les interactions.
- L'ombrage terrestre est moins contrasté (facteur limité à 0,84–1,16) et les teintes des classes de relief sont plus discrètes. Les formes principales — chaînes montagneuses, hauts plateaux et plaines — restent perceptibles sans micro-contraste excessif.
- Le zoom interactif maximal passe de **24× à 35× (3 500 %)**. Les projections équirectangulaire et Mercator acceptent maintenant la même plage.
- Attention : 35× agrandit les données mondiales actuelles, mais ne crée pas de précision géographique absente du fond Natural Earth 1:110m. Les côtes et frontières peuvent donc paraître simplifiées au zoom élevé ; les véritables détails locaux dépendront des futures données régionales.


## Niveaux de détail géographique progressifs

Le rendu du fond terrestre dispose maintenant d'un sélecteur LOD :
- zoom inférieur à 4× : fond mondial Natural Earth 1:110m ;
- zoom à partir de 4× : remplacement par Natural Earth 1:10m si le fichier régional est présent ;
- si le fichier est absent ou invalide : maintien du fond mondial, sans bloquer la carte.

Les données régionales ne sont pas téléchargées au démarrage afin de conserver une première ouverture légère. Le joueur peut installer le pack cartographique complet directement depuis l'interface, sans script ni déplacement de fichiers.


## LOD régional multi-couches — lot 2.8

À partir de 4×, le moteur tente de charger séparément les couches Natural Earth 1:10m pour les terres, les lacs, les rivières et les labels de villes. Chaque couche conserve son propre repli sur les données mondiales 1:110m : une donnée régionale absente n'empêche pas les autres couches de gagner en précision. Les labels de villes sont filtrés selon le rang et la population puis révélés progressivement à 4×, 6× et 8×. Les téléchargements sont déclenchés une seule fois au premier franchissement du seuil et ne bloquent pas le premier affichage de la carte.

Installation simplifiée : le bouton « Télécharger le pack cartographique complet » récupère les couches régionales Natural Earth et précharge aussi les couches mondiales et la grille ETOPO. Les ressources sont conservées dans le stockage local du navigateur et réutilisées automatiquement.


## Installation des données régionales depuis le navigateur

La carte propose un bouton « Télécharger le pack cartographique complet ». Il prépare sept ressources mondiales (six GeoJSON et le relief ETOPO) dans Cache Storage et les quatre couches régionales Natural Earth 1:10m dans IndexedDB. Les labels de villes sont dérivés de la couche Natural Earth des lieux peuplés. Les ressources déjà présentes sont conservées ; un téléchargement interrompu peut être repris sans recommencer les fichiers déjà installés. Le stockage est propre au navigateur et à l’origine du site. Les couches régionales sont chargées en mémoire uniquement lorsque le joueur zoome suffisamment, pour éviter un pic de mémoire au téléchargement.


## Pack cartographique complet et cache local

Le jeu démarre immédiatement avec les couches mondiales légères 1:110m. Le joueur peut ensuite télécharger le pack cartographique complet depuis le bouton sous la carte : six couches mondiales, la grille de relief ETOPO et les quatre couches régionales Natural Earth 1:10m. Les ressources locales sont conservées dans Cache Storage ; les couches régionales sont conservées dans IndexedDB. Les téléchargements déjà présents sont détectés et ignorés lors d’une reprise. Les couches régionales restent chargées à la demande au franchissement du zoom 4× : le pack prépare les données en local sans forcer le chargement de toute la géométrie en mémoire, afin de limiter les pics de mémoire et préserver la fluidité. Les données cartographiques restent disponibles après actualisation et peuvent être réutilisées sans réseau tant que le navigateur conserve le stockage du site. Cela concerne les données de carte, pas les fichiers de l’application elle-même. Cette installation ne garantit pas une hausse des FPS : elle réduit surtout les attentes réseau et les chargements répétés.


## Rendu interactif sans zones vides

Pendant le panoramique et le zoom à la molette, la carte est redessinée à chaque frame avec une qualité temporairement réduite : raster de relief à 35 %, pixel ratio 1, labels et repères détaillés différés. Le canvas reste à sa taille normale et n'est plus déplacé ou agrandi par transformation CSS ; les bords de la fenêtre ne révèlent donc plus le fond vide. À la fin du geste, un rendu complet restaure la qualité du relief, les labels et les repères. Cette stratégie privilégie la continuité visuelle ; les performances finales restent à mesurer sur les navigateurs et matériels réels.


## Navigation cartographique : rendu cohérent dans un seul viewport

Le rendu à double canvas et le fond mondial de secours ont été retirés : ils créaient une seconde échelle visible et une incohérence de projection pendant les gestes. Le moteur utilise un seul canvas, dont la géométrie est recalculée à partir du viewport réel à chaque frame d'interaction (les événements sont regroupés par `requestAnimationFrame`). Pendant le geste, le rendu simplifié désactive le raster ETOPO, les hachures, les repères d'altitude et les labels ; le fond océanique et les géométries terrestres restent projetés avec le même centre et le même zoom que le viewport. À la fin du geste, un rendu complet restaure relief, hydrographie et labels.

Cette stratégie privilégie la cohérence géographique : aucune carte mondiale étirée n'est affichée sous une vue régionale et le canvas ne sort pas de son viewport. Elle peut encore demander une optimisation CPU si le jeu est utilisé sur une machine modeste ; les performances doivent être mesurées en navigateur réel avant d'introduire un cache de tuiles ou un moteur WebGL.

## Carte mondiale unique et optimisation du rendu régional — 20 novembre 2026

- Le viewport équirectangulaire est maintenant borné aux limites géographiques du monde : à 100 %, le centre est fixé sur le méridien central ; en zoom, le joueur peut se déplacer dans les limites visibles du planisphère sans faire apparaître une seconde copie horizontale.
- Le centre vertical est lui aussi borné à la latitude réellement visible, ce qui évite de faire défiler le planisphère au-delà des pôles.
- Le raster ETOPO échantillonne périodiquement les longitudes pour gérer la grille mondiale ; le bornage du viewport empêche cette périodicité de produire des répétitions visuelles en dehors du monde vectoriel et de ses labels.
- Le moteur calcule et mémorise les emprises géographiques des entités GeoJSON, puis écarte celles qui sont hors écran avant leur projection. Ce filtrage s'applique aux terres, glaciers, lacs, rivières, repères d'altitude et labels. À l'échelle mondiale, les collections restent intactes ; en zoom régional, seules les entités susceptibles d'être visibles sont dessinées.
- Les tests couvrent les limites du viewport et le filtrage spatial. Les gains réels de FPS et la consommation mémoire doivent encore être vérifiés dans le navigateur ; cette étape prépare une future mise en cache de tuiles cohérentes, sans afficher de carte de secours à une autre échelle.


## Index spatial par secteurs — 20 novembre 2026

Les collections GeoJSON sont maintenant indexées à la demande dans une grille géographique de secteurs de 10° × 10°. L'index conserve les indices des entités dans chaque cellule et les géométries trop étendues dans une liste globale afin de ne jamais les perdre. Pendant le panoramique et le zoom, le moteur interroge les cellules qui recouvrent le viewport puis restitue les entités dans leur ordre d'origine. L'index est conservé par collection avec une WeakMap : il n'est pas reconstruit à chaque image et peut être libéré lorsque la collection n'est plus référencée. Les géométries originales ne sont ni découpées ni altérées ; ce mécanisme est un index spatial vectoriel, pas encore un cache de tuiles raster ni un rendu WebGL. Les tests couvrent les secteurs régionaux, les grandes géométries et le maintien de l'ordre des données.


## Réutilisation des sélections spatiales — 20 novembre 2026

Le résultat des requêtes de secteurs est maintenant mis en cache par fenêtre de cellules. Tant que le viewport se déplace à l'intérieur des mêmes secteurs, le moteur réutilise le même sous-ensemble GeoJSON au lieu de recréer et retrier son tableau à chaque frame. Le cache applique une politique LRU simple et reste plafonné à 48 fenêtres par index afin de maîtriser la mémoire. Les données et géométries d'origine restent inchangées. Cette optimisation réduit les allocations et le travail de sélection ; elle ne remplace pas encore un cache de pixels/tuiles et ne doit pas être présentée comme une mesure de FPS garantie.


## Placement des labels et détection de collision — 20 novembre 2026

Le classement des labels géographiques par priorité est maintenant calculé une seule fois par collection et conservé dans une WeakMap. Le seuil de zoom reste évalué à chaque rendu, ce qui préserve l'apparition progressive des villes et des noms régionaux. La détection de collision utilise une grille d'écran de 64 px : chaque libellé ne compare ses limites qu'aux libellés présents dans les mêmes cellules, au lieu de parcourir toute la liste déjà placée. L'ordre de priorité et les règles d'affichage restent inchangés. Le cache est attaché à la collection et peut être libéré avec elle. Cette optimisation vise surtout les catalogues denses de noms ; les performances réelles doivent être mesurées dans le navigateur.


## Cache des chemins projetés et du raster ETOPO — 20 novembre 2026

Les géométries polygonales disposent maintenant d'un cache de chemins `Path2D` attaché aux objets GeoJSON. La clé inclut projection, dimensions et viewport (zoom/centre), afin de ne jamais réutiliser un chemin décalé après un déplacement ou un changement d'échelle. Chaque feature conserve au maximum trois variantes récentes ; les références faibles permettent au ramasse-miettes de libérer les objets lorsque les collections disparaissent. Les navigateurs sans `Path2D` conservent le chemin de rendu classique.

Le raster ETOPO conserve également jusqu'à six surfaces calculées par grille et par viewport exact. Une surface déjà calculée est redessinée directement au lieu de recalculer les échantillons d'altitude et le hillshade. Le cache est attaché à la grille, borné et ne modifie aucune donnée géographique. Les nouvelles positions pendant un panoramique produisent de nouvelles clés ; ce mécanisme accélère surtout les rendus répétés d'un même cadrage. Il ne constitue pas encore un cache de tuiles géographiques et aucun gain de FPS n'est annoncé sans mesure navigateur.


## Cache des tracés hydrographiques — 20 novembre 2026

Les cours d'eau (LineString et MultiLineString) utilisent désormais le même cache de chemins projetés `Path2D` que les polygones. Les segments discontinus restent séparés dans le même chemin ; les navigateurs sans `Path2D` gardent le tracé Canvas classique. La clé conserve les dimensions, la projection et le viewport, et chaque feature reste limitée à trois variantes récentes. Un test confirme que les chemins des rivières ne sont pas reconstruits lors d'un second rendu identique. Cela évite la reprojection répétée des coordonnées hydrographiques sur un cadrage réutilisé, sans constituer encore un cache de tuiles ni une mesure de FPS.


## Compatibilité du comptage hydrographique — 20 novembre 2026

Le cache `Path2D` regroupe les sous-lignes d'un `MultiLineString` dans un seul chemin graphique pour réduire les appels Canvas. Le compteur de rendu conserve toutefois le nombre de lignes individuelles, comme avant l'optimisation, afin que les statistiques de couches restent comparables. Un test couvre explicitement les entités hydrographiques multi-segments.


## Préchargement des secteurs voisins — étape 1/5

Après un rendu complet, le navigateur prépare au repos les sélections spatiales des secteurs adjacents au cadrage. Le travail est reporté via `requestIdleCallback` (ou un court délai de repli) et annulé/remplacé si un nouveau cadrage arrive. Il ne télécharge aucune donnée supplémentaire, ne duplique pas la carte et ne modifie pas les collections GeoJSON : il préchauffe uniquement le cache borné de requêtes spatiales. Au zoom mondial, le préchargement est désactivé car la vue couvre déjà l'ensemble du monde.


## Cache spatial borné et observable — étape 2/5

Chaque index spatial conserve au maximum 48 sélections de fenêtres géographiques (LRU). Deux fonctions de diagnostic permettent de lire le nombre d'entités, de cellules et de requêtes conservées, ou de vider uniquement le cache des sélections d'une collection. Les géométries sources et l'index de cellules ne sont pas détruits lors de cette opération. Le préchargement voisin utilise exactement le même budget, ce qui empêche son accumulation sans limite.


## Chargement régional échelonné par zoom — étape 3/5

Les couches régionales ne partent plus toutes ensemble au même seuil :
- à partir de 3× : les noms de villes et repères régionaux, peu volumineux et immédiatement utiles à l'orientation ;
- à partir de 4× : les contours terrestres régionaux ;
- à partir de 5× : les lacs et les cours d'eau détaillés.

Chaque couche est activée dès sa propre arrivée. Les données mondiales restent le fond de secours tant que les ressources régionales ne sont pas disponibles. Les tentatives sont mémorisées pour ne pas relancer les mêmes téléchargements à chaque mouvement.


## Budgets mémoire des caches — étape 4/5

Les caches ont maintenant des plafonds documentés et vérifiables :
- requêtes spatiales : 48 fenêtres LRU par collection ;
- préchargement : un seul anneau de voisins (au plus 8 fenêtres par collection) ;
- chemins projetés : 3 variantes récentes par entité géographique ;
- surfaces ETOPO : 6 variantes par grille de terrain ;
- index et chemins attachés aux collections/features via `WeakMap`, afin qu'ils puissent être récupérés par le ramasse-miettes lorsque les données ne sont plus référencées.

Le préchargement ne s'exécute qu'après le rendu complet et est remplacé lorsqu'un nouveau cadrage est demandé. Aucun cache ne conserve une seconde copie du monde.


## Validation des limites de navigation — étape 5/5

Les tests de régression couvrent maintenant aussi les limites du planisphère : au zoom mondial, le centre reste au milieu du monde ; au zoom maximal, le centre est contraint pour empêcher l'apparition de copies supplémentaires au-delà des bords. Les tests vérifient en parallèle le préchargement voisin sans mutation des GeoJSON et le plafonnement/vidage du cache spatial. La validation CI reste nécessaire pour confirmer l'ensemble des suites.


## Navigation cyclique est-ouest — étape 1 à 5

La longitude de la caméra est désormais cyclique pendant le déplacement : elle peut dépasser +180° ou -180° sans être rabattue brutalement. La projection choisit pour chaque coordonnée sa copie longitudinale la plus proche du centre de caméra. Les coordonnées GeoJSON originales ne sont jamais dupliquées ni modifiées.

L'index spatial découpe les fenêtres qui traversent l'antiméridien en deux plages de longitude (est et ouest), puis fusionne les identifiants avec un `Set`. Alaska et Russie orientale peuvent donc être sélectionnés ensemble autour de 180°, sans doubler les entités ni les collections. Le cache spatial reste plafonné à 48 fenêtres.

Au zoom mondial, la caméra revient au centre pour préserver l'affichage d'un seul planisphère. Au zoom régional, elle peut poursuivre indéfiniment vers l'est ou l'ouest. Les latitudes restent contraintes pour éviter de sortir des limites utiles de la projection.


## Budget mémoire global des chemins projetés

Le cache Path2D est limité à trois variantes par entité, à 512 chemins au total et à 250 000 sommets projetés cumulés, tous calques confondus. Une politique LRU retire les chemins les moins récemment utilisés et supprime aussi leur entrée de la WeakMap de l'entité. Le cache ne peut donc pas croître proportionnellement au nombre de secteurs explorés. Les géométries sources restent intactes.


## Moteur de tuiles vectorielles géographiques — lot 3.0

Le moteur organise maintenant les entités GeoJSON dans une matrice de secteurs stables de 10° × 10°. Chaque secteur possède une sélection d'identifiants d'entités mise en cache ; le viewport assemble uniquement les secteurs qu'il recouvre, déduplique les entités et rétablit leur ordre source avant le rendu. Les géométries ne sont pas découpées aux frontières des secteurs : cela évite les fissures artificielles sur les côtes, les rivières et les polygones, et préserve la continuité à l'antiméridien.

Le cache de secteurs vectoriels est LRU et plafonné à 96 entrées par collection ; le cache des plans de viewport reste plafonné à 48. Le préchargement au repos prépare un anneau de huit secteurs voisins au maximum, avec longitude cyclique et latitude bornée. Les statistiques exposent les tuiles conservées, les hits et les misses. Il s'agit de tuiles vectorielles de sélection/organisation des données, pas de tuiles d'images pré-rendues ni d'un moteur WebGL : le Canvas dessine toujours les entités sélectionnées. Cette approche évite de créer une seconde copie du monde ou des coutures de clipping. Les LOD mondiaux/régionaux existants restent responsables de la résolution des données ; le système de tuiles ne prétend pas créer du détail absent des fichiers installés.


## Simplification adaptative des côtes et zoom 3 500 % — 20 novembre 2026

Les contours terrestres sont simplifiés au moment de leur projection avec Douglas-Peucker en espace écran (tolérance de 0,55 pixel). Le niveau de simplification est ainsi naturellement lié au zoom : à l'échelle mondiale, les détails très fins et les îlots sous-pixel sont écartés ; en zoomant, la même tolérance représente une zone géographique plus petite et les détails reviennent. Les petits polygones dont la surface projetée est inférieure à 0,7 pixel carré ne sont pas dessinés. Les géométries GeoJSON sources ne sont jamais modifiées. Les lacs, rivières et labels conservent leurs couches et règles existantes.

Le zoom maximal passe de 24× à **35× (3 500 %)** pour les projections équirectangulaire et Mercator. Ce changement n'augmente pas la taille des données ni la mémoire du cache à lui seul ; il peut toutefois rendre plus visibles les limites de résolution du jeu de données installé. Le niveau 35× est un agrandissement, pas une promesse de précision locale supplémentaire : les détails fins dépendent des couches régionales téléchargées.


## Refonte du relief ETOPO — hillshade directionnel renforcé

Le calcul du hillshade utilise une exagération verticale par défaut de **18×** (RELIEF_EXAGGERATION), avec possibilité de fournir une autre valeur à calculateHillshade. La lumière principale vient du nord-ouest (azimut 315°, altitude 35°, poids 0,8), avec un appoint nord-est plus faible (45°, 55°, 0,2). Cette direction dominante évite l'annulation des gradients est-ouest produite par quatre éclairages croisés. La sortie conserve strictement l'intervalle **0,48–1,52**, également utilisé par l'encodage/décodage du worker.

La palette terrestre est progressive : teintes de terrain et de roche aux altitudes intermédiaires, éclaircissement minéral au-dessus, puis neige de plus en plus claire aux altitudes élevées. Il n'y a pas de seuil blanc brutal à 2 000 m. Pour éviter un contraste excessif cumulé, la couleur hypsométrique reçoit seulement 35 % de l'écart du hillshade par rapport à la neutralité ; la passe overlay conserve le modelé avec une opacité réduite (0,72 en mode standard, 0,90 en mode relief). Le worker réutilise la même fonction importée et ne possède pas de formule parallèle.

Les tests automatisés vérifient la neutralité des surfaces planes, l'effet du facteur 18, les orientations est-ouest et nord-sud, les bornes du facteur d'ombrage et la continuité de la palette autour de 2 000 m. La validation esthétique finale reste à faire dans un navigateur réel.
