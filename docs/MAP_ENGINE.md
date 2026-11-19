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

Le module `src/world/terrain.js` lit le raster Int16 little-endian, valide ses dimensions, interpole les altitudes et génère une image de terrain colorisée avec un ombrage local simplifié. Le renderer superpose ensuite les contours terrestres, côtes, lacs, rivières, glaciers et labels.

Le chargement est facultatif et ne bloque pas la carte si le binaire est absent. Chemin attendu : `data/terrain/etopo_global_10m_i16.bin`. Le binaire est désormais versionné dans `data/terrain/` sur `main` et `dev` ; seul ce fichier est lu par le navigateur. Le calcul du raster est plafonné à 1 024 × 512 pixels avant agrandissement pour limiter le coût des redessins.

Limites : palette hypsométrique illustrative, ombrage simplifié, pas de bathymétrie détaillée par couches, pas de rendu WebGL. Le raster est un échantillonnage stride 10. Cette première version n'affiche le raster que pour la projection équirectangulaire ; les projections Mercator et orthographique masquent la couche jusqu'à l'ajout d'un pipeline de reprojection adapté. Le globe et la transition globe/atlas nécessiteront un pipeline spécifique.
