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
