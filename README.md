# TERRA NOVA

**Jeu de grande stratégie et simulation mondiale de civilisations, d'exploration, de commerce et de transformations géographiques.**

Départ : **1er janvier 1444** · Monde : **Terre** · Temps : **quotidien** · Fin de partie : **aucune**.

Le projet est un jeu web HTML/CSS/JavaScript, conçu pour fonctionner localement sans API ou service payant obligatoire. L'exploration, le commerce et les transformations des civilisations sont les trois piliers prioritaires. La guerre et la diplomatie sont des systèmes de soutien.

## Documents de référence — à lire en premier

- **[Cahier des charges maître](docs/PROJECT_MASTER.md)** — vision complète, décisions validées, systèmes prévus, contraintes, état réel du prototype et règles pour reprendre le projet dans une nouvelle conversation.
- **[Feuille de route](docs/ROADMAP.md)** — tous les lots, leur contenu, leur statut et la prochaine tâche.
- [Architecture technique](docs/ARCHITECTURE.md)
- [Direction artistique et cartographique](docs/ART_DIRECTION.md)
- [Moteur cartographique](docs/MAP_ENGINE.md)
- [Sources de données et licences](docs/DATA_SOURCES.md)

## État du projet

Prototype technique en construction. La branche `dev` contient les fondations de simulation, le rendu mondial Natural Earth, les couches physiques de référence et une interface plein écran à trois colonnes. La carte domine le centre, les outils temporels sont à gauche et le panneau préparatoire de l'assistant IA à droite. Les systèmes de simulation avancés ne sont pas encore implémentés.

Consulter la feuille de route pour les statuts précis. Ne pas confondre une maquette d'interface avec une fonctionnalité opérationnelle.

## Démarrage local

- Installer Node.js 20 ou supérieur.
- Exécuter `npm run check`.
- Lancer un serveur statique : `python3 -m http.server 8080`.
- Ouvrir `http://localhost:8080`.

## Branches et règles de développement

- `main` : version stable.
- `staging` : intégration candidate.
- `dev` : développement actif.

Développer sur `dev`, tester chaque lot, mettre à jour la roadmap et les documents concernés. Ne pas fusionner vers `main` ni publier sans validation des tests et accord explicite.

**Pour toute nouvelle conversation : lire d'abord [PROJECT_MASTER.md](docs/PROJECT_MASTER.md) et [ROADMAP.md](docs/ROADMAP.md), vérifier l'état GitHub/CI, puis reprendre la prochaine tâche non terminée sans redemander les décisions déjà validées.**
