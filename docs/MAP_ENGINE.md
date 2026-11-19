# Moteur cartographique — premier socle

Ce lot ajoute des briques indépendantes de rendu :
- projections équirectangulaire, Mercator bornée et orthographique ;
- thèmes cartographiques pilotés par l'année, avec un paramètre de niveau technologique ;
- rendu Canvas d'une GeoJSON FeatureCollection, grille géographique et polygones.

Le dépôt embarque désormais `data/ne_110m_land.geojson`, un fond physique mondial Natural Earth à l'échelle 1:110m (127 formes géographiques). Il est chargé localement par `src/main.js`, sans API ni CDN. Il fournit les continents et grandes côtes, pas le relief, les fleuves détaillés ou les frontières politiques historiques.

L'orthographique est une projection de globe de base ; la rotation interactive, le clipping précis des géométries traversant le limbe et la transition animée globe/atlas restent à réaliser. Les projections d'affichage ne servent jamais aux calculs de simulation.

Les thèmes constituent une première palette fonctionnelle, pas encore des textures finales : les motifs papier, gravure, topographie et holographie seront ajoutés dans le travail artistique et le rendu avancé.


## Données et attribution

Le fond terrestre provient de Natural Earth Vector (`ne_110m_land`, échelle 1:110m), redistribué depuis le dépôt `nvkelso/natural-earth-vector`. Les données Natural Earth sont dans le domaine public ; attribution facultative : « Made with Natural Earth ». La licence et les conditions d'utilisation sont documentées dans `docs/DATA_SOURCES.md`. Le fond est volontairement séparé des futures couches politiques : il ne représente pas les États de 1444.
