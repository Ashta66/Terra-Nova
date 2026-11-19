# Journal des changements — TERRA NOVA

Ce journal consigne les changements réellement effectués dans le dépôt. Les documents maîtres et la roadmap décrivent l'état courant ; ce journal garde la trace des évolutions par session.

## 19 novembre 2026 — navigation interactive de la carte (branche `dev`)

### Fonctionnalités et code
- `src/world/projection.js` : ajout d'un centre géographique et d'un facteur de zoom aux projections équirectangulaire et Mercator ; bornage des latitudes et coordonnées normalisées de Mercator aux limites polaires.
- `src/world/map-renderer.js` : transmission du viewport à toutes les couches de rendu ; retour des paramètres de vue dans le résultat du rendu.
- `src/main.js` : ajout d'un état de vue cartographique, zoom 1× à 8×, déplacement au pointeur, zoom molette ancré sur la position du pointeur, recentrage et limites de déplacement.
- `index.html` : commandes de zoom avant/arrière, indicateur de grossissement et bouton de recentrage.
- `styles/main.css` : commandes compactes, focus clavier, curseurs de déplacement et prise en charge tactile via Pointer Events.
- `tests/projection.test.js` : tests de zoom/déplacement pour les projections équirectangulaire et Mercator.

### Vérification et correction
- Première exécution CI : 37 tests réussis, 1 échec sur une très petite erreur de précision flottante à la limite polaire de Mercator.
- Correction appliquée dans `src/world/projection.js` : calcul du Mercator à partir de coordonnées mondiales normalisées et bornées, ce qui stabilise exactement les limites nord/sud.
- Vérification finale du commit `5c8f5ea86b688d773e51708b9fab412fe1f31775` : syntaxe JavaScript OK (16 fichiers), 38 tests réussis, 0 échec ; vérification shell du script ETOPO réussie.
- Workflow : https://github.com/Ashta66/Terra-Nova/actions/runs/44631637016.
- Les contrôles shell du script de préparation ETOPO restent intégrés dans la CI.

### Documentation mise à jour
- `docs/MAP_ENGINE.md` : commandes, comportement, paramètres et limites de la navigation 2D.
- `docs/ROADMAP.md` : lot 2.7 passé de « à faire » à « en cours », première partie réalisée.
- `docs/PROJECT_MASTER.md` : capacités de navigation présentes et limites actuelles ajoutées.
- `README.md` : lien vers ce journal.

### Limites connues et suites
- Ce n'est pas encore un globe rotatif ; l'interface utilise toujours le planisphère équirectangulaire.
- Les géométries au passage de l'antiméridien nécessitent un traitement spécifique.
- Le grossissement ne crée pas de détail géographique supplémentaire : les données Natural Earth 1:110m restent la seule géométrie de base.
- Prochaines étapes cartographiques : récupérer/valider le raster ETOPO, générer le relief ombré réel, ajouter les niveaux de détail régionaux, puis réaliser la navigation globe → atlas.

## 19 novembre 2026 — mémoire projet et pipeline de terrain

- Création de `docs/PROJECT_MASTER.md` : cahier des charges maître, décisions de conception, architecture, limites, règles de continuité.
- Création de `docs/ROADMAP.md` : phases, lots, statuts et prochaine tâche.
- `README.md` enrichi avec les liens de reprise.
- Création de `scripts/build-etopo-overview.sh` : conversion hors ligne d'un raster ETOPO 2022 60 secondes en aperçu 2160 × 1080 Int16.
- Documentation NOAA/ETOPO, licence, DOI et limites mises à jour dans `docs/DATA_SOURCES.md` et `docs/ARCHITECTURE.md`.
- CI enrichie avec une vérification de syntaxe shell.
- Raster source ETOPO non encore téléchargé ni intégré ; le relief mesuré continu n'est pas encore actif dans le jeu.
