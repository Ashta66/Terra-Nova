# TERRA NOVA

**Simulation mondiale de civilisations, d'exploration et de transformations géographiques.**

Départ : **1er janvier 1444** · Monde : **Terre** · Temps : **quotidien** · Fin de partie : **aucune**.

TERRA NOVA est conçu comme une simulation ouverte : les sociétés, les économies, les territoires et même la géographie physique pourront évoluer au fil des siècles. L'exploration, le commerce et les transformations des civilisations constituent les piliers du jeu ; la guerre et la diplomatie sont des systèmes de soutien, pas une finalité.

## État du projet
Lot 1 — fondations techniques en cours. Cette branche contient une première horloge quotidienne, un modèle de géographie mutable séparé des données politiques, une sauvegarde locale versionnée et des tests automatisés. Elle ne constitue pas encore une carte mondiale ni un jeu complet.

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
Voir [l'architecture technique](docs/ARCHITECTURE.md).