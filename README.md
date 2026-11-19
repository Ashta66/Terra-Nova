# TERRA NOVA

**Simulation mondiale de civilisations, d'exploration et de transformations géographiques.**

Départ : **1er janvier 1444** · Monde : **Terre** · Temps : **quotidien** · Fin de partie : **aucune**.

TERRA NOVA est conçu comme une simulation ouverte : les sociétés, les économies, les territoires et même la géographie physique pourront évoluer au fil des siècles. L'exploration, le commerce et les transformations des civilisations constituent les piliers du jeu ; la guerre et la diplomatie sont des systèmes de soutien, pas une finalité.

## Direction du jeu
La carte adoptera une caméra hybride, du globe planétaire à l'atlas détaillé. Son langage visuel évoluera avec l'époque simulée : atlas ancien en 1444, cartographie moderne au fil des siècles, puis visualisations futuristes. Le niveau géographique C est la cible technique ; le premier rendu jouable sera de niveau B, avec relief, hydrographie, végétation et côtes crédibles.

## État du projet
Lot 1 — fondations techniques : horloge quotidienne, modèle de géographie mutable séparé des données politiques, sauvegarde locale versionnée et tests automatisés. La carte mondiale réelle et le rendu cartographique sont des étapes suivantes ; le dépôt ne constitue pas encore un jeu complet.

## Lancer localement
- Installer Node.js 20 ou supérieur.
- Exécuter `npm run check`.
- Lancer un serveur statique : `python3 -m http.server 8080`.
- Ouvrir `http://localhost:8080`.

## Branches
- `main` : version stable, conservée séparément.
- `dev` : développement actif.
- `staging` : intégration candidate avant validation.

## Documentation
- [Architecture technique](docs/ARCHITECTURE.md)
- [Direction artistique et cartographique](docs/ART_DIRECTION.md)
