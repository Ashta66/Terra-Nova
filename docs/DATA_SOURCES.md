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

Le raster ETOPO n'est pas encore embarqué dans le jeu : l'accès direct aux fichiers binaires globaux n'a pas été validé dans l'environnement de développement. Aucun relief continu artificiel ne sera présenté comme une mesure réelle.
