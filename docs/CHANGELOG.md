## 20 novembre 2026 — réception et conversion du relief ETOPO NOAA

### Données reçues et contrôlées
- Réception du NetCDF `ETOPO_2022_v1_60s` extrait via NOAA ERDDAP, de taille 9 363 244 octets.
- Dimensions contrôlées : 1 080 × 2 160 ; variable `z` en mètres ; référence verticale EGM2008.
- Aucune valeur manquante/non finie détectée ; plage source mesurée : −10 511,002 à 6 734,173 m.
- Coordonnées source validées : latitude ascendante et longitude 0–360°, pas régulier de 1/6°.

### Conversion et fichiers
- Ajout de `scripts/convert-etopo-erddap.py` : validation stricte du NetCDF, inversion des lignes pour obtenir le nord en haut, rotation des colonnes de 180° pour obtenir les longitudes −180° à +180°, arrondi au mètre et export Int16 little-endian.
- Génération d'un binaire de 4 665 600 octets (2 160 × 1 080 × 2), d'un en-tête ENVI et de métadonnées JSON.
- Empreinte SHA-256 du binaire : `dfbb54b8bfaf062f2589521ee96d94ba8025e2723bb2e7d2103ff0afcfa79927`.
- Le paquet de préparation est fourni séparément à l'utilisateur ; le binaire n'est pas encore intégré au dépôt Git.

### Correction de méthode et limites
- L'extraction ERDDAP reçue est un échantillonnage par stride 10, et non une moyenne de blocs 10×10. Les docs et métadonnées décrivent désormais cette méthode précisément.
- Le fichier est validé comme donnée préparée, mais n'est pas encore chargé par `map-renderer.js`. Aucun relief ombré réel n'est déclaré opérationnel.
- Lot 2.1 reste EN COURS jusqu'à l'intégration du fichier et à la vérification de son géoréférencement/rendu.

# Journal des changements — TERRA NOVA

## 19 novembre 2026 — amélioration du pipeline d'accès ETOPO (recherche de source)

### Recherche et constat
- Confirmation de la source NOAA NCEI ETOPO 2022 Ice Surface et de ses formats GeoTIFF/NetCDF à 60 secondes d'arc.
- Identification du service officiel NOAA ERDDAP `ETOPO_2022_v1_60s`, qui expose une grille globale de 10 800 latitudes × 21 600 longitudes, avec altitude `z` en mètres et référence verticale EGM2008.
- Le service permet des extractions par indices et pas d'échantillonnage ; une extraction décimée peut fournir un aperçu de résolution proche de la cible 10 minutes, sous réserve de validation des coordonnées et du réordonnancement des longitudes 0–360°.

### Documentation
- `docs/DATA_SOURCES.md` : ajout du point d'accès NOAA ERDDAP, des dimensions et des précautions sur les coordonnées.
- `docs/PROJECT_MASTER.md` : mise à jour de l'état du pipeline ETOPO et des étapes restantes.
- `docs/ROADMAP.md` : lot 2.1 précisé avec la voie d'extraction ERDDAP en alternative au GeoTIFF direct.

### Limites et vérification
- Aucun raster n'a encore été téléchargé, ajouté ou affiché ; le relief continu reste donc absent du jeu.
- Le format et l'orientation du fichier extrait devront être contrôlés sur les données binaires réelles avant intégration.
- Cette étape est une amélioration de la documentation et de la stratégie d'accès aux données, pas une validation du MNT.

## 19 novembre 2026 — labels géographiques progressifs (choix joueur C)

### Décision de conception
- Le joueur a choisi l'option C : noms principaux affichés progressivement selon le zoom, détails au survol et au clic.
- Monde : continents et océans ; zoom régional : villes historiques ; survol : nom/type ; clic : coordonnées géographiques.
- Les noms et frontières des pays modernes ne sont pas injectés dans la carte de 1444 : il faudra un référentiel politique historique adapté.

### Code et données
- Ajout de `data/ne_110m_map_labels.geojson` : continents, océans et sélection initiale de villes historiques (Paris, Londres, Rome, Constantinople, Le Caire, Tombouctou, Delhi, Pékin, Kyoto, Tenochtitlan, Cuzco, etc.).
- `src/world/map-renderer.js` : rendu de labels à seuil de zoom, hiérarchie typographique, évitement simple des collisions et zones de détection.
- `src/main.js` : chargement de la couche, infobulle au survol, informations au clic, maintien de la navigation par glisser-déposer.
- `index.html` et `styles/main.css` : surface d'infobulle et présentation.
- `tests/map-renderer.test.js` : test de visibilité progressive des labels et du rendu de texte.

### Documentation
- Mise à jour de `docs/PROJECT_MASTER.md`, `docs/ROADMAP.md`, `docs/MAP_ENGINE.md` et `docs/DATA_SOURCES.md`.
- Les villes affichées sont une sélection initiale éditoriale, pas une base exhaustive ni une preuve de statut politique.
- Les données pays/limites modernes ne sont pas utilisées comme carte politique 1444.

### Vérification
- Deux premières exécutions CI ont révélé que le test plaçait Paris hors du canevas après un zoom centré sur l'équateur ; le test a été corrigé pour centrer la vue sur l'Europe, sans changer le moteur.
- Vérification finale du commit `526e2f1c01a64d6417206d445f39257fc7acd0f2` : syntaxe JavaScript OK (16 fichiers), 39 tests réussis, 0 échec ; vérification shell ETOPO réussie.
- Workflow : https://github.com/Ashta66/Terra-Nova/actions/runs/44632304565.
- Limites : pas encore de sélection de territoires, fiche de lieu complète, données de pays historiques, densité de labels régionale ni gestion avancée des collisions.


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
