# Architecture technique — TERRA NOVA

## Principes non négociables
- Le monde physique et les entités politiques sont deux modèles distincts.
- La géographie de référence est conservée séparément de la géographie courante.
- Les changements géographiques sont des commandes validées, historisées et reproductibles.
- Le temps de campagne avance par jours, sans date de fin codée en dur.
- Les systèmes futurs fonctionneront sur des cadences adaptées (quotidienne, mensuelle, annuelle ou événementielle).
- Les sauvegardes sont locales et versionnées ; aucune API payante ni backend n'est obligatoire.

## Modules actuels
- `src/core/clock.js` : calendrier UTC, vitesse et progression.
- `src/core/save.js` : persistance locale versionnée.
- `src/game/state.js` : état racine et validation.
- `src/world/geography.js` : modèle géographique mutable et historique.
- `src/main.js` : interface de démonstration des fondations.

## Géographie dynamique : contrat
Les géométries sont des objets GeoJSON Polygon ou MultiPolygon en longitude/latitude. Le moteur accepte des résultats géométriques calculés en amont : création, remodelage, suppression, division et fusion. Il ne prétend pas encore calculer une fracture, un cratère ou une submersion physique. Les opérations géométriques robustes (découpe, union, validation topologique), la projection cartographique, le relief, les côtes et les données Natural Earth seront intégrés dans les lots cartographiques suivants.

Chaque modification incrémente une révision et ajoute une entrée à l'historique. Les frontières politiques ne sont pas stockées dans les objets de géographie physique.

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