# Sources de données

## Natural Earth Vector — terres émergées 1:110m

- Fichier intégré : `data/ne_110m_land.geojson`
- Couche : `ne_110m_land` — 127 entités Polygon, 128 anneaux, environ 5 143 positions géographiques.
- Source du fichier : https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson
- Version de la source : branche `master` au moment de l'intégration ; le blob source est référencé dans l'historique Git du projet.
- Statut : domaine public selon la licence officielle Natural Earth : https://github.com/nvkelso/natural-earth-vector/blob/master/LICENSE.md
- Attribution facultative recommandée : « Made with Natural Earth ».

Natural Earth autorise explicitement les usages personnels, éducatifs et commerciaux, ainsi que la modification et la redistribution de ses données. La source précise qu'aucune permission ni attribution n'est requise ; nous conservons néanmoins la mention « Made with Natural Earth » par transparence.

Cette couche sert uniquement de fond physique mondial simplifié. Elle ne représente pas les frontières politiques de 1444. Son échelle 1:110m convient à la vue planétaire initiale ; des données à plus grande échelle seront nécessaires pour les zooms régionaux.

## World Atlas TopoJSON — source étudiée, non embarquée

Le dépôt https://github.com/topojson/world-atlas redistribue des données dérivées de Natural Earth sous forme TopoJSON. Sa licence ISC couvre le paquet et son code ; les données géographiques Natural Earth conservent leur statut propre de domaine public. Aucun fichier World Atlas n'est embarqué dans le jeu à ce stade.

## Couches hydrographiques Natural Earth 1:110m

- Lacs : `data/ne_110m_lakes.geojson` — 24 entités polygonales.
  Source : https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_lakes.geojson
- Grands cours d'eau : `data/ne_110m_rivers.geojson` — 13 entités linéaires.
  Source : https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_rivers_lake_centerlines.geojson

Ces couches sont également issues de Natural Earth Vector et relèvent du domaine public. À cette échelle, elles ne représentent que les grands éléments hydrographiques utiles à la vue planétaire ; elles ne constituent pas un réseau hydrographique exhaustif.

## Relief de référence — Natural Earth 1:110m

- Repères d'altitude : `data/ne_110m_elevation_points.geojson` — 19 points remarquables (sommets, dépressions et cols) avec altitude en mètres.
  Source : https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_geography_regions_elevation_points.geojson
- Zones glaciaires : `data/ne_110m_glaciated_areas.geojson` — 11 polygones de zones glaciaires.
  Source : https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_glaciated_areas.geojson

Ces couches Natural Earth sont dans le domaine public. Elles sont utiles comme repères visuels à l'échelle planétaire, mais ne remplacent pas un modèle numérique de terrain (MNT) continu.

## Modèle numérique de terrain étudié — NOAA ETOPO 2022

La prochaine étape de précision nécessitera un véritable raster d'altitude. La source retenue pour l'étude est ETOPO 2022 de la NOAA, modèle global topographique et bathymétrique. La NOAA propose des versions globales à 30 et 60 secondes d'arc et des tuiles plus détaillées à 15 secondes d'arc. Les données sont publiées sous CC0 selon la documentation scientifique associée ; la citation NOAA et le DOI 10.25921/fd45-gt74 doivent être conservés.

- Présentation et téléchargements : https://www.ncei.noaa.gov/products/etopo-global-relief-model
- Référence scientifique et licence CC0 : https://essd.copernicus.org/articles/17/1835/2025/

Le fichier source haute résolution n'est pas embarqué dans le jeu. Une extraction NOAA ERDDAP décimée a depuis été reçue et contrôlée : voir la section « Extraction ERDDAP validée » ci-dessous. Le raster compact est préparé comme artefact de travail, mais son branchement dans le rendu de la carte reste à faire. Aucun relief continu artificiel ne sera présenté comme une mesure réelle.

## Choix technique pour le relief global — ETOPO 2022

La source de relief est confirmée : **ETOPO 2022, version Ice Surface**, pour représenter l'altitude de la surface actuelle des glaces et des terres, et la bathymétrie des océans. NOAA fournit des formats GeoTIFF et NetCDF en résolutions 15, 30 et 60 secondes d'arc. Les données sont publiées sous CC0-1.0 ; elles sont gratuites pour la plupart des téléchargements. La publication scientifique précise une restriction d'usage pour la navigation : TERRA NOVA utilisera ces données pour la visualisation et la simulation de jeu, jamais comme aide à la navigation réelle.

Références officielles :
- NOAA NCEI : https://www.ncei.noaa.gov/products/etopo-global-relief-model
- Métadonnées, formats et licence CC0 : https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.dem%3Aetopo_2022
- Service NOAA ERDDAP (grille globale 60 secondes, Ice Surface) : https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_60s.html
- Métadonnées de la grille ERDDAP : latitude 10 800 échantillons, longitude 21 600 échantillons, altitude `z` en mètres, référence verticale EGM2008. Le service accepte les extractions par indices et pas (`stride`) ; une extraction décimée 10×10 correspond à l'ordre de grandeur du raster 10 minutes visé. Les coordonnées de longitude sont exposées sur 0–360° et devront être réordonnées/validées pour le format cartographique du jeu.
- Article scientifique : https://essd.copernicus.org/articles/17/1835/2025/
- DOI du jeu de données : https://doi.org/10.25921/fd45-gt74

### Format retenu pour le premier affichage mondial

Ne pas livrer directement au navigateur les centaines de millions de cellules du raster haute résolution. Le premier niveau de carte utilisera un aperçu global **2160 × 1080 échantillons à 10 minutes d'arc**, dérivé du raster source ETOPO 60 secondes par rééchantillonnage moyen. Stockage cible : entier signé 16 bits, little-endian, en mètres, soit 4 665 600 octets (environ 4,45 Mio) hors petit fichier d'en-tête.

- Script de préparation : `scripts/build-etopo-overview.sh`.
- Entrée : raster mondial complet ETOPO 2022 60 secondes en GeoTIFF ou VRT.
- Sorties attendues : `data/terrain/etopo_global_10m_i16.bin`, en-tête ENVI et `data/terrain/etopo_global_10m.json`.
- Dépendance de préparation uniquement : GDAL (`gdalinfo`, `gdal_translate`). Le jeu final n'a pas besoin de GDAL à l'exécution.
- Le script vérifie la taille exacte du fichier et demande de contrôler que l'en-tête ENVI indique le little-endian (`byte order = 0`).

Cette préparation est reproductible, mais le raster n'est **pas encore intégré** : aucun fichier d'altitude n'est déclaré présent avant d'avoir téléchargé la source NOAA, exécuté le script et validé les données obtenues. Les tuiles haute résolution seront étudiées ensuite pour les zooms régionaux.


## Labels géographiques et villes historiques

Le fichier `data/ne_110m_map_labels.geojson` est une couche éditoriale légère dédiée à la lisibilité de la carte : noms des continents, océans et une sélection de villes importantes existant au début de la partie (1444). Les coordonnées sont des points de placement cartographique ; elles ne définissent ni frontières ni contrôle politique.

Les noms de villes sont affichés à partir du zoom 2×. Les pays modernes ne sont pas affichés, afin de ne pas confondre géographie contemporaine et situation politique historique de 1444. Les labels sont une sélection initiale et devront être étendus/validés lors de l'intégration de données historiques. Pour les fonds et jeux de données physiques/culturels Natural Earth : https://www.naturalearthdata.com/downloads/110m-cultural-vectors/ ; le jeu de données est libre d'utilisation, attribution conseillée « Natural Earth ».


## Extraction ERDDAP validée — 20 novembre 2026

Un fichier NetCDF extrait depuis NOAA ERDDAP a été fourni et inspecté.

- Dimensions : 1 080 latitudes × 2 160 longitudes.
- Variable : `z`, flottants 32 bits, unités mètres.
- Référence verticale : EGM2008 (EPSG:3855).
- Valeurs : aucune valeur manquante/non finie détectée ; minimum observé −10 511,002 m, maximum 6 734,173 m.
- Coordonnées source : latitude ascendante, longitude ascendante sur 0–360°, pas régulier de 1/6°.
- Conversion : lignes réordonnées du nord vers le sud, colonnes décalées de 180° pour obtenir l'ordre −180° à +180°, valeurs arrondies au mètre et stockées en Int16 little-endian.
- Sortie : `etopo_global_10m_i16.bin`, 4 665 600 octets, accompagné d'un en-tête ENVI et de métadonnées JSON.
- Empreinte SHA-256 du binaire préparé : `dfbb54b8bfaf062f2589521ee96d94ba8025e2723bb2e7d2103ff0afcfa79927`.

**Précision méthodologique :** l'extraction reçue utilise un échantillonnage par pas de 10 cellules (stride), et non un rééchantillonnage moyen 10×10. Le fichier est donc un aperçu décimé, pas une moyenne surfacique. Les centres des cellules proviennent des coordonnées NOAA réelles ; les limites d'emprise doivent être respectées lors du géoréférencement.

- Script reproductible : `scripts/convert-etopo-erddap.py`.
- Dépendances de préparation : Python 3, NumPy, xarray et un backend NetCDF compatible.
- Le fichier compact est fourni dans un paquet téléchargeable de préparation. Il n'est pas encore chargé par le moteur Canvas : le relief est validé comme donnée, pas encore comme fonctionnalité visible du jeu.


### Consommation par le jeu
Le renderer charge facultativement `data/terrain/etopo_global_10m_i16.bin`. Pour activer le relief dans une copie locale, extraire le pack dans `data/terrain/`. Le NetCDF source et le TIFF complet ne sont pas requis au runtime.


## Fond terrestre régional Natural Earth 1:10m

- Jeu : Natural Earth Vector, couche physique « Land » à l'échelle 1:10m.
- Source officielle : https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/
- Archive de préparation : https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip
- Usage : détails des côtes et des îles lorsque le zoom atteint 4× ; chargement local à la demande.
- Licence : domaine public selon les conditions Natural Earth ; conserver la mention « Natural Earth » dans les crédits du jeu.
- Préparation : `bash scripts/prepare-natural-earth-lod.sh` (curl, unzip, GDAL/ogr2ogr).
- Sortie attendue : `data/ne_10m_land.geojson`. L'asset n'est pas encore présent dans le dépôt ; la carte utilise donc le fond 1:110m tant qu'il n'a pas été préparé.


## Couches régionales Natural Earth 1:10m — téléchargement à la demande

Le jeu télécharge depuis le dépôt officiel `nvkelso/natural-earth-vector` les terres, lacs, cours d’eau et lieux peuplés à l’échelle 1:10m. Les trois premières couches sont conservées en GeoJSON ; la couche des lieux peuplés est réduite à des labels de villes avec nom, population et seuil de zoom. Le bouton de la carte stocke les GeoJSON dans IndexedDB, sans écrire dans le système de fichiers de l’utilisateur. Les données restent locales au profil du navigateur et peuvent être supprimées en effaçant les données du site. Source et licence : Natural Earth Vector, domaine public.


## Pack cartographique complet

Le pack optionnel regroupe les six couches mondiales Natural Earth 1:110m, la grille ETOPO binaire déjà préparée (4 665 600 octets) et les quatre couches régionales Natural Earth 1:10m. Les couches mondiales et ETOPO sont mises en cache avec Cache Storage ; les couches régionales sont stockées dans IndexedDB. Le joueur peut continuer à jouer avec les couches mondiales légères sans télécharger le pack. Le cache est local à l’origine du site et peut être supprimé depuis les paramètres de stockage du navigateur.


## Frontières et chronologie

- Les frontières politiques modernes proviennent des lignes terrestres Admin 0 de Natural Earth (échelle 1:110m, domaine public).
- Les frontières administratives modernes proviennent des lignes Admin 1 de Natural Earth (1:110m au niveau mondial, puis 1:10m à partir du zoom 4, domaine public). Elles ne sont affichées qu'à partir de 2026 afin de ne pas projeter les divisions administratives actuelles dans les siècles précédents.
- Les frontières politiques historiques proviennent de [Historical Basemaps](https://github.com/aourednik/historical-basemaps), distribuées sous GPL-3.0. Le jeu extrait les segments partagés entre territoires pour ne pas redessiner les côtes comme des frontières politiques, puis choisit le cliché temporel le plus proche de l'année simulée ; il ne crée pas de frontière interpolée entre deux clichés.
- Pour les périodes anciennes, les frontières peuvent être des zones d'influence reconstruites et leur précision varie. Les propriétés de précision disponibles dans les données commandent un style de trait différencié. Les limites physiques (côtes, lacs et relief) restent issues des couches géographiques Natural Earth/ETOPO et ne sont pas assimilées à des frontières politiques.


- Les noms des provinces et régions modernes utilisent la couche polygonale Admin 1 Natural Earth au 1:50m (chargée à la demande), afin d'obtenir une couverture mondiale plus complète sans télécharger les 40 Mo de géométries au 1:10m.
