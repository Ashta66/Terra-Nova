# Direction cartographique et géographique — TERRA NOVA

## Décisions validées

- **Caméra hybride** : navigation depuis un globe terrestre vers une représentation cartographique détaillée à mesure que le joueur zoome. Le passage doit être fluide, sans rupture de navigation.
- **Direction artistique** : hybride entre atlas historique et cartographie stratégique moderne, avec une dominante atlas (D) et des accents spectaculaires contemporains (C).
- **Cartographie évolutive** : l'apparence de la carte suit la date simulée et l'évolution des techniques de représentation du monde.
- **Géographie** : niveau C comme cible architecturale (simulation géographique poussée), niveau B comme premier rendu jouable (géographie réaliste détaillée).

## Évolution visuelle selon la période

L'évolution est progressive et pilotée par la chronologie, pas par un simple changement brutal à une date unique.

| Période indicative | Langage visuel |
| --- | --- |
| 1444 et débuts de l'époque moderne | Parchemin, gravure, encre, rose des vents, toponymie et conventions d'atlas anciens |
| XVIIe–XVIIIe siècles | Atlas plus précis, hachures de relief, côtes affinées, routes maritimes et frontières mieux établies |
| XIXe siècle | Cartographie topographique, réseaux ferroviaires, infrastructures et données économiques |
| XXe–XXIe siècles | Imagerie satellite, relief numérique, éclairage nocturne, couches géopolitiques et données en temps réel simulées |
| Futurs possibles | Cartographie numérique avancée, visualisations holographiques discrètes, réseaux énergétiques et couches planétaires |

Ces périodes sont des repères artistiques. Le moteur doit pouvoir interpoler les styles et permettre des trajectoires historiques divergentes. Le style ne doit pas dépendre exclusivement du calendrier : les technologies, les institutions scientifiques et les connaissances géographiques d'une civilisation pourront influencer sa propre représentation cartographique.

## Caméra et niveaux d'échelle

1. **Vue planétaire** : globe 3D manipulable, silhouette terrestre et grands repères géographiques.
2. **Transition** : passage continu du globe à une projection cartographique, avec conservation de la position et de l'orientation utiles au joueur.
3. **Vue régionale** : atlas détaillé, relief, hydrographie, végétation, territoires et infrastructures connues.
4. **Vue locale** : détails stratégiques adaptés au niveau de zoom et aux données disponibles.

La projection et le rendu doivent éviter les déformations visuelles trompeuses. Les distances, surfaces et connexions utilisées par la simulation ne doivent jamais être calculées à partir des seuls pixels affichés.

## Réalisme géographique : cible C, premier jalon B

### Premier rendu jouable — niveau B

- Géométrie crédible des continents, îles et côtes.
- Relief visuel : chaînes de montagnes, hauts plateaux, plaines et vallées.
- Fleuves, lacs et grands bassins hydrographiques.
- Grandes zones de végétation, forêts, déserts et glaces.
- Territoires politiques et frontières affichés dans une couche séparée.
- Couches activables et lisibilité adaptée à l'échelle.

### Architecture cible — niveau C

Prévoir des données et interfaces permettant d'ajouter sans refonte :
- altitude et modèle de terrain ;
- climat, précipitations et températures ;
- sols, ressources et aptitude agricole ;
- biomes, végétation et écosystèmes ;
- bassins versants et évolution des cours d'eau ;
- événements géologiques et changements physiques persistants.

Le niveau D (simulation géologique et planétaire exhaustive) n'est pas une exigence du premier produit. Il pourra être évalué plus tard si les performances et la valeur ludique le justifient.

## Architecture technique et invariants

- Séparer strictement géographie physique, territoires politiques, données stratégiques et style de rendu.
- Conserver une géographie de référence et un état géographique courant versionné.
- Stocker les géométries dans un système géographique indépendant de la projection écran.
- Prévoir des données vectorielles pour les côtes, fleuves, régions et frontières ; le relief pourra utiliser une représentation raster/maillée complémentaire.
- Distinguer les données réelles de référence, les modifications simulées et les éléments simplement découverts par chaque civilisation.
- Une modification physique (impact, séisme, volcanisme, submersion) doit modifier les données du monde, pas seulement dessiner un effet visuel.
- Après modification, les systèmes concernés devront pouvoir recalculer ou invalider les côtes, territoires, connexions, ressources, habitats et routes.
- Les frontières politiques ne doivent pas être confondues avec les formes physiques du terrain.
- Les couleurs, textures, typographies, symboles et couches cartographiques doivent être fournis par des thèmes temporels remplaçables.
- Les données de simulation et les règles de gameplay ne doivent pas dépendre du thème graphique.

## Progression de réalisation

1. Importer et vérifier des données mondiales libres et attribuées (continents, côtes, hydrographie, relief de référence).
2. Construire le premier rendu atlas 2D détaillé, lisible et performant.
3. Ajouter la caméra planétaire et la transition globe/atlas.
4. Ajouter les couches de relief, hydrographie, végétation et territoires.
5. Introduire les thèmes cartographiques temporels et leurs transitions.
6. Ajouter progressivement les variables physiques niveau C.
7. Brancher les événements géographiques sur de vraies mutations du monde et leurs conséquences simulées.

## Contraintes de qualité

- Fonctionnement local sans service payant ni API obligatoire.
- Attribution et licence vérifiées pour chaque jeu de données importé.
- Chargement progressif, niveaux de détail et simplification géométrique pour préserver les performances.
- Accessibilité : contrastes, légendes, modes de couleur et informations qui ne reposent pas uniquement sur la couleur.
- Les effets visuels ne doivent jamais masquer les frontières, les informations ou les actions du joueur.
