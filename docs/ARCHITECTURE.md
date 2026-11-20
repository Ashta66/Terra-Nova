# Architecture technique — TERRA NOVA

## Principes non négociables
- Le monde physique et les entités politiques sont deux modèles distincts.
- La géographie de référence est conservée séparément de la géographie courante.
- Les changements géographiques sont des commandes validées, historisées et reproductibles.
- Le temps de campagne avance par jours, sans date de fin codée en dur.
- Les systèmes futurs fonctionneront sur des cadences adaptées (quotidienne, mensuelle, annuelle ou événementielle).
- Les sauvegardes sont locales et versionnées ; aucune API payante ni backend n'est obligatoire.
- La simulation ne dépend jamais de la projection ou du style graphique de la carte.
- Les données physiques, politiques, stratégiques et les thèmes de rendu restent séparés.

## Modules actuels
- `src/core/clock.js` : calendrier UTC, vitesse et progression.
- `src/core/save.js` : persistance locale versionnée.
- `src/game/state.js` : état racine et validation.
- `src/world/geography.js` : modèle géographique mutable et historique.
- `src/main.js` : interface de démonstration des fondations.

## Géographie dynamique : contrat
Les géométries sont des objets GeoJSON Polygon ou MultiPolygon en longitude/latitude. Le moteur accepte des résultats géométriques calculés en amont : création, remodelage, suppression, division et fusion. Il ne prétend pas encore calculer une fracture, un cratère ou une submersion physique. Les opérations géométriques robustes (découpe, union, validation topologique), la projection cartographique, le relief, les côtes et les données Natural Earth seront intégrés dans les lots cartographiques suivants.

Chaque modification incrémente une révision et ajoute une entrée à l'historique. Les frontières politiques ne sont pas stockées dans les objets de géographie physique.

## Direction cartographique validée
La caméra visée est hybride : globe planétaire manipulable, puis transition vers un atlas détaillé au zoom. La direction artistique combine atlas historique et cartographie stratégique moderne, avec une dominante atlas et des accents spectaculaires mesurés.

Le style de la carte évolue progressivement avec la date simulée : conventions d'atlas ancien au départ en 1444, cartographie plus précise à l'époque moderne, topographie et réseaux à l'ère industrielle, imagerie numérique à l'époque contemporaine, puis visualisations futuristes pour les futurs possibles. Les repères chronologiques ne sont pas des ruptures rigides : technologies et connaissances des civilisations peuvent influencer leur style cartographique.

Le niveau géographique **C** est la cible d'architecture (altitude, climat, sols, hydrographie, biomes et écosystèmes). Le premier rendu jouable visera le niveau **B** : continents et côtes crédibles, relief visuel, fleuves, lacs, grandes zones de végétation et territoires politiques en couches distinctes. Le niveau D n'est pas une exigence du premier produit.

Voir [la direction cartographique détaillée](ART_DIRECTION.md).

## Données cartographiques
Aucun fond cartographique factice n'est présenté comme une carte du monde réelle. Le socle accepte les géométries géographiques ; l'import de données mondiales documentées sera une étape distincte avec attribution et validation des données.

## Exécution locale
Node.js 20+ :
```sh
npm run check
python3 -m http.server 8080
```
Puis ouvrir `http://localhost:8080`.

## CI et publication
GitHub Actions vérifie la syntaxe et les tests sur `dev`, `staging`, `main` et les pull requests. Aucun déploiement Pages automatique n'est activé tant que la version jouable n'a pas été validée.

## Préparation du relief ETOPO

Le modèle de terrain cible est ETOPO 2022. Le premier rendu mondial utilisera un aperçu raster compact 2160 × 1080 à 10 minutes d'arc, encodé en Int16 little-endian (mètres). Les données sont préparées hors ligne par GDAL via `scripts/build-etopo-overview.sh`. Le navigateur ne doit recevoir que le raster léger prétraité et les métadonnées ; aucune dépendance GDAL ne doit être nécessaire en jeu. Les niveaux de détail régionaux seront fournis ultérieurement par tuiles. Voir `docs/DATA_SOURCES.md`.
