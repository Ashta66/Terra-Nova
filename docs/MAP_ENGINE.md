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
