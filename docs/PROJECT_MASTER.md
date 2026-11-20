# TERRA NOVA — cahier des charges maître

> Document de référence du projet. À lire avant toute nouvelle session de développement. En cas de divergence entre un échange ancien et ce document, les décisions validées les plus récentes consignées ici prévalent.

- Projet : TERRA NOVA
- Dépôt : https://github.com/Ashta66/Terra-Nova
- Branche de travail : `dev`
- Branches de référence : `main` (stable), `staging` (intégration), `dev` (développement)
- Dernière mise à jour : 20 novembre 2026

## 1. Vision

TERRA NOVA est un jeu de grande stratégie et de simulation historique ouverte à l'échelle mondiale. Le joueur accompagne une société/civilisation et contribue à façonner l'histoire, les échanges, l'exploration, les territoires et, à terme, la géographie physique elle-même.

Le jeu doit devenir une expérience profonde, crédible, spectaculaire et accessible, sans être une copie d'Europa Universalis ou d'un autre jeu existant. La guerre et la diplomatie sont des systèmes de soutien : les trois piliers prioritaires sont :
1. Exploration et colonisation.
2. Commerce et expansion.
3. Civilisations et transformations des sociétés.

La simulation doit laisser émerger des histoires inattendues, et ne pas enfermer le joueur dans une chronologie prédéterminée.

## 2. Paramètres de départ validés

| Paramètre | Décision |
|---|---|
| Nom | TERRA NOVA |
| Monde initial | Terre réelle |
| Départ | 1er janvier 1444 |
| Durée | Aucune date de fin imposée ; siècles et millénaires possibles |
| Cadence | Simulation quotidienne, sous-systèmes à fréquences adaptées |
| Carte | `world`, géographie terrestre réaliste |
| Vitesse | Mode détaillé, pause et plusieurs accélérations |
| Événements historiques | Hybride : événements réels divergents + événements émergents + événements du joueur |
| Modes | Campagne et bac à sable |
| Plateforme initiale | Jeu web HTML/CSS/JavaScript |
| Persistance | Sauvegardes locales versionnées |
| Coût | Aucun service payant ni API/backend obligatoire pour jouer |
| Espace | Pas dans le premier périmètre ; extension éventuelle très lointaine |

## 3. Expérience de jeu

### 3.1 Exploration et connaissance du monde
- Expéditions terrestres et maritimes.
- Découverte progressive et brouillard de guerre.
- Les territoires inconnus ne doivent jamais être considérés automatiquement comme vides.
- Les peuples et sociétés locales sont des acteurs autonomes, avec leurs propres institutions, objectifs, diplomaties et réactions.
- La connaissance géographique d'une civilisation est distincte de la géographie physique réelle.

### 3.2 Expansion, colonisation et autonomie
- Comptoirs commerciaux, établissements, colonies d'exploitation, administrations indirectes et protectorats.
- Colonies autonomes, fédérations, autonomies croissantes et indépendances possibles.
- Développement de populations, élites, économies, identités et intérêts propres.
- Colonisation équilibrée entre voies maritimes et territoriales.
- Résistance, négociation, adaptation, échanges et alliances avec les sociétés locales.

### 3.3 Commerce et économie
- Ressources, production, consommation, marchés, prix et routes commerciales.
- Ports, infrastructures, fiscalité, transport et entreprises commerciales.
- Les compagnies peuvent financer des expéditions, exploiter des ressources, contrôler des routes et devenir des acteurs politiques puissants.
- L'économie doit être cohérente et équilibrée ; les paramètres chiffrés restent à concevoir et tester.

### 3.4 Sociétés et populations
- Groupes de population agrégés, croissance, migrations et déplacements.
- Cultures, religions, institutions, classes/élites et transformations politiques.
- Développement des colonies et émergence de nouvelles identités collectives.
- Les détails de granularité et les règles démographiques seront conçus lors du lot dédié.

### 3.5 Technologies et avenir
- Progression technologique sans plafond de date rigide.
- Évolution possible : navigation, agriculture, industrie, transport, énergie, automatisation, informatique, IA, biotechnologies et autres trajectoires plausibles.
- Les technologies et institutions peuvent diverger selon les sociétés et les choix historiques.
- Le futur doit émerger des systèmes plutôt que d'être une simple séquence de scripts.

### 3.6 Diplomatie, conflits et acteurs IA
- Nations et sociétés pilotées par des personnalités et objectifs distincts : commerciales, expansionnistes, défensives, scientifiques, diplomatiques, coloniales, etc.
- Décisions adaptatives fondées sur les informations connues par chaque acteur ; pas d'omniscience artificielle.
- Guerre et diplomatie existent, mais ne doivent pas prendre le pas sur exploration, commerce et transformations sociétales.

## 4. Fonction signature : « Le Monde en devenir » (assistant IA d'événements)

Le joueur pourra proposer en langage naturel des événements, par exemple une météorite dans l'Atlantique, une découverte minière, une révolution ou l'apparition d'une île volcanique.

Flux cible :
1. Le joueur formule son idée.
2. L'assistant transforme la demande en proposition structurée : titre, récit, date/déclencheur, lieu/portée, régions concernées, effets, durée et conséquences secondaires.
3. Le jeu affiche un aperçu et permet de modifier la proposition.
4. Le joueur confirme, programme, annule ou modifie l'événement.
5. Le moteur de simulation valide et applique les effets autorisés.
6. L'événement et ses conséquences sont consignés dans la chronique du monde.

Les événements peuvent être ponctuels, récurrents ou secrets. Des chaînes émergentes sont possibles (découverte pétrolière → compagnies → rivalités → crise). L'IA ne doit jamais écrire directement dans le code ni modifier arbitrairement l'état du jeu : elle propose des données structurées, le moteur les valide. Un éditeur manuel doit fonctionner sans fournisseur IA. Architecture multi-fournisseurs possible, sans clé privée exposée dans le navigateur. Aucune intégration IA réelle n'est encore annoncée comme opérationnelle.

## 5. Géographie physique réellement évolutive

La géographie est un élément du monde simulé, pas un décor statique. Une catastrophe doit pouvoir changer les données géographiques et la carte elle-même.

Événements visés :
- impacts de météorites : cratères, bassins, destructions et submersions ;
- séismes, failles, soulèvements, montagnes et vallées ;
- volcanisme, îles nouvelles et terres ensevelies ;
- tsunamis, inondations et changements de côtes ;
- variations du niveau marin et terres submergées ;
- évolution des îles, détournement des fleuves, érosion ;
- changements de végétation, désertification, glaciation et climat ;
- tectonique des plaques sur des échelles géologiques plausibles, de l'ordre de millions d'années, pas comme un événement annuel.

Contraintes d'architecture :
- Séparer géographie physique, territoires/frontières politiques, données stratégiques et représentation graphique.
- Conserver les géométries de référence et l'état courant modifiable.
- Géométries vectorielles et/ou terrain raster/maillé ; ne pas dépendre d'une image statique.
- Autoriser création, division, fusion, remodelage et suppression de régions.
- Recalculer ou invalider les côtes, territoires, connexions, populations, ressources, habitats et routes concernés.
- Historiser les changements et proposer un aperçu avant/après pour les événements majeurs.
- Un impact dépend de paramètres physiques (taille, vitesse, angle, lieu, nature du terrain) et non d'une suppression aléatoire de pixels.
- Ne jamais présenter des hachures ou une décoration comme de vraies altitudes.

## 6. Carte, caméra et direction artistique

### 6.1 Choix validés
- Caméra hybride : globe terrestre manipulable au départ, transition fluide vers l'atlas au zoom.
- Direction artistique hybride entre atlas historique et carte stratégique moderne, avec dominante atlas (choix D) et accents spectaculaires mesurés (C).
- La carte est l'élément principal de l'expérience.
- Géographie cible C, premier rendu jouable B ; le niveau D exhaustif n'est pas une exigence initiale.
- Palette naturelle et harmonieuse, relief crédible, côtes et rivières lisibles, couleurs politiques distinctes.
- Effets de lumière, profondeur, animations et découverte, sans surcharge futuriste.

### 6.2 Style cartographique évolutif
Le style change progressivement et peut dépendre à la fois de la date et du niveau technologique/connaissances des civilisations :
- 1444 : parchemin, manuscrit, gravure, rose des vents et typographie ancienne.
- XVIIe–XVIIIe : atlas gravé plus précis, hachures, routes maritimes.
- XIXe : topographie, chemins de fer, infrastructures et économie.
- XXe–XXIe : relief numérique, imagerie satellite, éclairage nocturne et couches géopolitiques.
- Futurs : visualisation planétaire avancée, holographie discrète, réseaux énergétiques et couches 3D.
Les transitions sont progressives ; les périodes sont indicatives et l'histoire peut diverger.

### 6.3 Niveau de géographie
Premier rendu B : continents/côtes crédibles, relief, montagnes, hauts plateaux, plaines, vallées, rivières, lacs, grandes zones de végétation, forêts, déserts, glaces, territoires politiques séparés.

Architecture C : altitude, climat, précipitations/températures, sols, ressources, aptitude agricole, biomes, écosystèmes, bassins versants et évolution hydrologique/géologique.

## 7. Interface et ergonomie validées

Sur ordinateur :
- Utiliser toute la largeur et la hauteur disponibles.
- Barre supérieure compacte.
- Panneau de temps/chronologie à gauche.
- Carte mondiale très grande et dominante au centre.
- Assistant « Le Monde en devenir » à droite.
- Le moins de défilement possible ; panneaux latéraux défilants indépendamment si nécessaire.
- Sauvegarde/chargement accessibles rapidement.
- La carte doit rester lisible et conserver son rapport de projection.

Sur mobile/petits écrans : disposition en colonne, défilement vertical autorisé et commandes adaptées.

L'interface plein écran en trois colonnes est intégrée sur `dev`. Le panneau IA visible est pour l'instant une maquette d'interface, pas une conversation fonctionnelle.

## 8. Principes techniques et qualité

- HTML/CSS/JavaScript, modules ES, dépendances réduites.
- Node.js 20+ pour les scripts de vérification.
- Fonctionnement local ; aucune API cartographique distante obligatoire.
- Données de référence sourcées, licences vérifiées et attribution documentée.
- Séparation des données, simulation, rendu et interface.
- Sauvegardes versionnées et validation avant chargement.
- Simulation quotidienne avec sous-systèmes exécutés à des cadences adaptées.
- Historique compressible et sauvegardes compactes à mesure que la partie progresse.
- Chargement progressif, niveaux de détail et simplification géométrique pour les performances.
- Accessibilité : contraste, légendes et informations qui ne reposent pas uniquement sur la couleur.
- Tests automatisés et GitHub Actions sur les branches de développement, intégration et stable.
- Ne jamais déclarer un test réussi sans résultat CI ou exécution vérifiée.

## 9. État réel du prototype au 19 novembre 2026

### Présent dans le dépôt sur `dev`
- Horloge quotidienne démarrant au 1er janvier 1444, pause, vitesses et progression.
- État de jeu racine et validation.
- Sauvegarde/chargement local versionné.
- Modèle de géographie GeoJSON mutable : création, remodelage, suppression, division/fusion à partir de géométries fournies ; historique des révisions.
- Projections équirectangulaire, Mercator bornée et orthographique de base, avec centre et zoom pour la navigation 2D.
- Thèmes cartographiques temporels et interpolation de palette.
- Rendu Canvas mondial.
- Données locales Natural Earth : terres, grands lacs, grands cours d'eau, zones glaciaires et points de repère d'altitude.
- Première couche de labels géographiques progressifs : continents et océans à l'échelle mondiale ; villes historiques à partir du zoom 2× ; infobulle au survol et coordonnées au clic.
- Hachures décoratives, clairement distinctes de l'altitude mesurée.
- Interface ordinateur plein écran à trois colonnes ; carte centrale dominante, temps à gauche, assistant à droite.
- Navigation 2D de la carte : zoom 1× à 8×, molette avec ancrage sous le pointeur, panoramique pointeur et recentrage.
- Décision d'affichage des noms : option C validée — labels progressifs selon le zoom, informations importantes visibles automatiquement, détails au survol et coordonnées au clic.
- Première couche de labels sur `dev` : continents, océans et sélection de villes historiques pertinentes pour le départ 1444. Les noms de pays modernes sont volontairement exclus tant que les frontières et noms politiques historiques ne sont pas sourcés.
- CI GitHub Actions : vérification de syntaxe et tests Node.

### Limites connues
- Extraction ETOPO 2022 NOAA ERDDAP intégrée comme grille mondiale décimée 2160 × 1080 Int16 little-endian (4 665 600 octets), en mètres et référence verticale EGM2008 ; chargement et première colorisation actifs sur `dev`.
- Le relief terrestre utilise une palette hypsométrique progressive, un hillshade directionnel nord-ouest tenant compte de la latitude et des classes visuelles heuristiques initiales (montagnes, plateaux, vallées, collines, plaines et basses terres). Ces classes ne remplacent pas une donnée géomorphologique scientifique ; le réglage artistique après inspection visuelle et les données régionales haute résolution restent à développer.
- La bathymétrie est volontairement simplifiée en grandes masses de profondeur, avec contraste réduit et sans ombrage local des fosses/dorsales pour ne pas surcharger la carte.
- Pas de rotation interactive du globe, ni de transition animée globe/atlas. La navigation du planisphère 2D est maintenant disponible sur `dev` : zoom 100–800 %, glisser-déposer, zoom à la molette centré sur le pointeur et recentrage ; les données régionales haute résolution ne sont pas encore présentes.
- Pas de frontières politiques historiques de 1444. Les labels de villes actuels sont une sélection historique éditoriale et non un référentiel exhaustif ; les noms des pays ne sont pas encore affichés pour éviter l'anachronisme.
- Pas encore de nations, populations, économie, diplomatie, exploration jouable ou IA de nations.
- Pas encore d'assistant IA fonctionnel ni d'éditeur d'événements complet.
- Les opérations de géométrie physique avancées (booléens, impact, submersion, tectonique) ne sont pas encore implémentées.
- Ce dépôt est un prototype technique en construction, pas encore un jeu complet.

### Avancement du lot relief au 20 novembre 2026
- Source : ETOPO 2022 NOAA confirmée, licence CC0-1.0 et DOI documentés.
- Résolution source retenue pour l'aperçu : 60 secondes d'arc ; sortie cible 10 minutes d'arc, 2160 × 1080, Int16 little-endian en mètres (environ 4,45 Mio).
- Script de préparation : `scripts/build-etopo-overview.sh` (GDAL hors ligne).
- L'extraction NetCDF NOAA ERDDAP a été validée, convertie et intégrée dans `data/terrain/` sur `main` et `dev` ; le renderer de `dev` charge le binaire et le colorise.
- La mer utilise désormais une palette progressive peu contrastée ; les pixels sous le niveau marin n'effectuent pas les échantillonnages voisins destinés à l'ombrage terrestre, ce qui allège aussi le calcul.
- La couche raster reste limitée à la projection équirectangulaire et son rendu visuel doit encore être contrôlé dans un navigateur.

## 10. Organisation de développement et règles de reprise

- Travailler sur `dev`.
- Garder `main` stable et ne pas fusionner/publier sans validation des tests et accord explicite.
- Utiliser `staging` comme étape d'intégration avant `main`.
- Développer par lots cohérents, tester chaque lot, documenter les décisions et limites.
- Les choix sûrs d'architecture et de qualité peuvent être pris directement ; demander au joueur les décisions créatives ou de gameplay qui changent fortement l'expérience.
- Ne pas demander une nouvelle fois une décision déjà validée dans ce document.
- À chaque lot : mettre à jour `docs/ROADMAP.md`, ce document si une décision change, et les docs techniques concernées.
- Mettre à jour le statut, les commits/PR et le résultat CI.
- Ne pas prétendre qu'un élément est terminé s'il n'existe que dans une maquette ou un document.

### Instructions pour une nouvelle conversation
1. Ouvrir le dépôt et lire ce fichier en entier.
2. Lire `docs/ROADMAP.md` pour connaître le lot actif, les lots terminés et les prochains.
3. Lire `docs/CHANGELOG.md` pour comprendre les changements récents et les corrections.
4. Lire les documents techniques liés au lot en cours.
5. Vérifier l'état réel de `dev`, les PR et les dernières GitHub Actions.
6. Continuer depuis la prochaine tâche non terminée sans redemander les choix déjà validés.
7. Si le contexte conversationnel est absent, ce document et la roadmap sont la source de vérité du projet.


### Première intégration logicielle ETOPO
Le moteur possède désormais un lecteur raster Int16, une interpolation d'altitude et un rendu hypsométrique ombré facultatif. Le binaire, son en-tête, ses métadonnées et le script de conversion sont présents dans `data/terrain/` sur `main` et `dev`. Le chargement navigateur est branché sur `dev`. Le rendu n'a pas encore été visuellement inspecté dans un navigateur réel.


### Complément relief terrestre — 20 novembre 2026
Le renderer utilise désormais les quatre échantillons voisins déjà nécessaires au hillshade pour différencier discrètement les formes de relief. Les classes sont heuristiques et purement visuelles. La bathymétrie reste volontairement simplifiée, à faible contraste, sans ombrage détaillé des fosses et dorsales. Aucun nouveau fichier de données n'est nécessaire.


## Mise à jour technique — fluidité de la carte (20 novembre 2026)

Le moteur regroupe désormais les demandes de rendu sur `requestAnimationFrame`. Pendant un glissement, le raster ETOPO est temporairement calculé à résolution réduite, puis une image plus détaillée est rendue à la fin du geste. Le rendu raster utilise les dimensions logiques du canvas et une surface hors écran lorsque disponible afin de respecter le facteur de densité de pixels. Ces optimisations sont un premier palier ; les performances réelles doivent encore être mesurées dans un navigateur et la mise en cache des couches statiques reste une piste.


### Navigation fluide — optimisation zoom
La molette affiche une prévisualisation transformée du canvas et attend 130 ms de calme avant le rendu géographique complet. Les rendus sont invalidés par la taille, l'année et le viewport ; l'horloge ne provoque donc plus un redessin inutile à chaque seconde de simulation.
