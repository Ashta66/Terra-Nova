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
- zoom progressif avec boutons +/−, de 100 % à 800 % ;
- zoom à la molette autour du pointeur, pour garder la zone visée sous la souris ;
- déplacement par glisser-déposer à la souris ou au pointeur ;
- recentrage sur la vue mondiale initiale ;
- indicateur de zoom et désactivation des commandes aux limites ;
- gestes pointeur utilisables sur écran tactile.

Le zoom et le centre sont des paramètres de vue transmis au moteur de projection. Ils ne modifient ni les géométries sources, ni les données de simulation, ni les distances du monde. Les projections Mercator et équirectangulaire acceptent un centre et un facteur de zoom ; la vue active de l'interface reste équirectangulaire.

Limites connues :
- la navigation reste un planisphère 2D ; elle ne constitue pas encore une rotation de globe ;
- les géométries qui traversent l'antiméridien peuvent être coupées pendant le panoramique ;
- le zoom augmente le grossissement mais n'ajoute pas encore de nouvelles données régionales : le détail est limité par Natural Earth 1:110m ;
- les limites de déplacement sont volontairement simples et seront revues avec le globe et les niveaux de détail.


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
- Le zoom interactif maximal passe de **8× à 24×**. Les projections équirectangulaire et Mercator acceptent maintenant la même plage.
- Attention : 24× agrandit les données mondiales actuelles, mais ne crée pas de précision géographique absente du fond Natural Earth 1:110m. Les côtes et frontières peuvent donc paraître simplifiées au zoom élevé ; les véritables détails locaux dépendront des futures données régionales.


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
