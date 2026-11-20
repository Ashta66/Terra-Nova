## Optimisation cartographique — 20 novembre 2026
- Littoral physique et masque du relief simplifiés davantage que les frontières territoriales ; les micro-îles et détails côtiers secondaires sont écartés à toutes les échelles.
- Hillshade superposé allégé : qualité raster plafonnée à 0,62 et opacité réduite (0,52 en mode politique ; 0,66 en mode relief).
- Les villes sont strictement plafonnées à cinq labels, quel que soit le zoom.
- Le réseau hydrographique conserve les rangs 0 et 1, au maximum 18 grands cours d'eau, triés par rang puis longueur géométrique.
- La composition utilise une interpolation basse qualité pendant le geste et haute qualité au repos ; le registre de références du Worker est réinitialisé lors de chaque redémarrage.

## 20 novembre 2026 — refonte du relief ETOPO et de l'ombrage

- src/world/terrain.js : ajout de RELIEF_EXAGGERATION = 18 et d'un paramètre d'exagération à calculateHillshade ; remplacement des quatre lumières qui se neutralisaient par une lumière nord-ouest dominante et un appoint nord-est.
- Conservation stricte de la plage de sortie 0,48–1,52, compatible avec le codage Uint8 du worker et samplePreparedHillshade.
- Palette terrestre éclaircie progressivement vers les roches et la neige à haute altitude, sans rupture blanche à 2 000 m.
- Réduction à 35 % de l'effet hillshade dans la couleur de base pour éviter le double contraste ; opacité de la passe overlay ajustée à 0,72 en mode standard et 0,90 en mode relief.
- Le worker conserve une seule source de calcul : il importe la fonction commune et bénéficie automatiquement du facteur par défaut 18.
- Tests ajoutés sur surfaces planes, facteur d'exagération, orientations de pente, bornes numériques et transition de palette.
- La validation visuelle navigateur reste nécessaire ; les tests ne mesurent pas la perception esthétique ni les performances GPU.

## 20 novembre 2026 — niveaux de détail géographiques progressifs

- Ajout de `src/world/map-lod.js` : sélection du fond mondial 1:110m ou du fond régional 1:10m à partir du zoom 4×.
- Le jeu régional est chargé à la demande, une seule fois, et le fond mondial reste le repli si l'asset manque ou ne peut être lu.
- Ajout de `scripts/prepare-natural-earth-lod.sh` pour télécharger et valider directement le GeoJSON Natural Earth 1:10m « Land » (curl + Python 3, sans GDAL).
- Ajout de tests sur le seuil, le remplacement du fond, le repli et les erreurs de chargement.
- Limite actuelle : l'asset 1:10m n'est pas encore versionné ; les lacs, rivières, glaciers et labels restent en 1:110m. Le rendu régional ne sera actif qu'après préparation de `data/ne_10m_land.geojson`.

## 20 novembre 2026 — relief allégé et zoom étendu

- Réduction du raster de relief normal de 768 × 384 à 512 × 256 pixels.
- Ombrage des pentes et teintes des classes de relief adoucis pour une carte moins chargée.
- Zoom maximal porté de 8× à 24× ; projections équirectangulaire et Mercator alignées sur cette limite.
- Tests adaptés à la nouvelle résolution, à la plage de contraste et au zoom 24×.
- Limite connue : les données vectorielles mondiales Natural Earth 1:110m restent simplifiées au zoom élevé ; les niveaux de détail régionaux sont toujours à intégrer.

## 20 novembre 2026 — zoom différé et invalidation du rendu

- Zoom molette : prévisualisation CSS ancrée au point visé, puis rendu complet unique après 130 ms sans nouvel événement.
- Les boutons +/− conservent leur rendu immédiat.
- Ajout d'une signature de vue pour ignorer les appels de rendu quand taille, année et viewport sont inchangés ; évite le redessin à chaque tick de l'horloge.
- Préparation du canvas à la composition via `will-change: transform`.
- Limite : la prévisualisation du zoom est temporairement moins nette ; aucune mesure FPS navigateur n'est disponible à ce stade.

## 20 novembre 2026 — fluidité du zoom et du panoramique

- `src/main.js` : regroupement des rendus cartographiques via `requestAnimationFrame`, afin de ne pas recalculer plusieurs images lors d'une rafale d'événements pointeur ou molette.
- Pendant le glissement, le canvas déjà rendu est translaté via `translate3d` sans recalcul du raster ETOPO ni des couches vectorielles ; le rendu complet est relancé au relâchement.
- `src/world/terrain.js` : résolution normale plafonnée à 768 × 384 ; rendu sur une surface hors écran quand disponible.
- `src/world/map-renderer.js` : correction du passage des dimensions logiques CSS au raster, pour éviter le mélange entre pixels physiques haute densité et coordonnées logiques.
- Tests ajoutés sur les plafonds de résolution interactifs et normaux.
- Limites : aucune mesure FPS réelle ni inspection visuelle navigateur disponible à cette étape ; les couches vectorielles sont encore recalculées à chaque image.

## 20 novembre 2026 — premières classes visuelles du relief terrestre

- `src/world/terrain.js`: ajout d'une classification heuristique locale distinguant montagnes, plateaux, vallées, collines, plaines et basses terres à partir de l'altitude et des quatre voisins déjà lus pour le hillshade.
- Application de teintes très discrètes aux terres ; les océans ne sont pas affectés et conservent leur palette bathymétrique simplifiée.
- Aucun échantillonnage supplémentaire ni asset externe ; coût ajouté limité à quelques calculs de pente/contraste et à un mélange RGB.
- Tests ajoutés pour chaque classe principale et pour garantir que la bathymétrie reste inchangée.
- Limite : les classes sont des heuristiques de rendu, pas une cartographie géomorphologique scientifique ; validation visuelle navigateur encore nécessaire.

## 20 novembre 2026 — hillshade directionnel terrestre

- `src/world/terrain.js` : remplacement de l'ombrage local heuristique par un calcul directionnel nord-ouest (azimut 315°, hauteur 45°).
- Le gradient est converti en pente à partir de la taille approximative des cellules en mètres ; la largeur des cellules tient compte de la latitude.
- Une surface plane garde un éclairage neutre ; le facteur d'ombrage est borné pour préserver la lisibilité des couleurs.
- Tests ajoutés pour la neutralité d'une surface plane et le comportement borné de pentes opposées.
- Documentation mise à jour : moteur cartographique, roadmap, cahier des charges maître.
- CI GitHub Actions sur le commit `85e1eaa2fd1c17f720d2e58599f46d3c89a9f995` : 44 tests réussis, 0 échec ; vérification des scripts shell réussie. Workflow : https://github.com/Ashta66/Terra-Nova/actions/runs/44640970755.
- Rendu visuel navigateur non inspecté.

## 20 novembre 2026 — bathymétrie simplifiée et allègement du rendu marin

- Choix de lisibilité confirmé : les océans doivent rester visuellement secondaires par rapport aux reliefs terrestres.
- `src/world/terrain.js` : palette marine progressive et resserrée, en bleu-gris ; grandes masses de profondeur plutôt que détails contrastés ; plateau continental légèrement différencié.
- Suppression de l'ombrage local détaillé sous le niveau marin : fosses et dorsales ne sont plus accentuées pixel par pixel.
- Optimisation : les quatre échantillonnages voisins utilisés pour l'ombrage sont désormais réservés aux pixels terrestres ; les pixels marins ne font qu'un échantillonnage d'altitude.
- Palette terrestre progressive conservée ; ajout d'un hillshade directionnel nord-ouest à 45°, tenant compte de la distance réelle des cellules selon la latitude, avec éclairage neutre sur les surfaces planes et facteur borné sur les pentes.
- Optimisation marine conservée : pas de calcul de gradients locaux sous l'eau.
- Tests ajoutés pour garantir le contraste marin contenu et l'absence d'influence de l'ombrage local sur les fonds océaniques.
- Documentation mise à jour : roadmap, cahier des charges maître et moteur cartographique.
- Une première CI a détecté une assertion trop stricte sur la variation d'arrondi de la palette marine (écart maximal de 2 niveaux RGB) ; le test a été ajusté pour vérifier la faible amplitude plutôt que l'identité exacte.
- CI finale sur le commit `0a5998845d27da2fe6719e19b6b479c3235a8cb4` : 43 tests réussis, 0 échec ; vérification des scripts shell réussie. Workflow : https://github.com/Ashta66/Terra-Nova/actions/runs/44640643576.
- Rendu navigateur non inspecté visuellement.

## 20 novembre 2026 — intégration des données ETOPO dans les branches

- Le pack ETOPO a été ajouté par l'utilisateur à `main`, puis les mêmes objets Git (binaire inclus, 4 665 600 octets) ont été référencés dans `dev` sans retranscodage.
- Fichiers présents dans `data/terrain/` : `etopo_global_10m_i16.bin`, `etopo_global_10m_i16.hdr`, `etopo_global_10m.json` et `convert-etopo-erddap.py`.
- Le renderer limite désormais le calcul du raster à 1 024 × 512 pixels au maximum avant agrandissement, afin de réduire le coût des redessins pendant le zoom et le déplacement.
- Le raster n'est affiché que sous la projection équirectangulaire ; les projections Mercator et orthographique le masquent, car leur reprojection raster n'est pas encore implémentée.
- Test ajouté pour vérifier l'activation équirectangulaire et le masquage des autres projections.
- Documentation mise à jour : cahier des charges maître, roadmap et moteur cartographique.
- CI GitHub Actions sur le commit `7bfb28b70b31d62fbc0a8eb390afc846ea9e34d4` : syntaxe et tests réussis, 42 tests réussis, 0 échec ; vérification des scripts shell réussie. Workflow : https://github.com/Ashta66/Terra-Nova/actions/runs/44638233507.
- Aucune inspection visuelle du rendu navigateur n'a encore été réalisée.

## 20 novembre 2026 — première intégration du moteur de relief ETOPO

- Ajout de `src/world/terrain.js` : validation de la grille Int16 little-endian, lecture des altitudes, interpolation bilinéaire et génération d'un raster hypsométrique ombré.
- Mise à jour de `src/world/map-renderer.js` : dessin du terrain sous les couches cartographiques, avec rendu à la résolution réelle du canvas pour respecter les écrans haute densité.
- Mise à jour de `src/main.js` : chargement facultatif de `data/terrain/etopo_global_10m_i16.bin`, sans bloquer la carte si le fichier est absent.
- Tests ajoutés pour l'ordre little-endian, les dimensions, l'interpolation et la génération des pixels.
- Documentation mise à jour : `MAP_ENGINE.md`, `DATA_SOURCES.md`, `ROADMAP.md`, `PROJECT_MASTER.md`.
- L'asset binaire n'a pas été ajouté au dépôt ; il doit être extrait du pack dans `data/terrain/` pour activer le relief dans une copie locale. Le rendu navigateur n'a pas encore été visuellement inspecté.
- Validation automatisée à confirmer par GitHub Actions sur le commit de cette étape.

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


## 20 novembre 2026 — Fusions et campagne
- PR #10 fusionnée : scène overscan, labels recalés, traits et LOD cohérents.
- PR #11 fusionnée : hillshade ETOPO renforcé, lumière NW dominante et palette progressive.
- Refonte de l'écran de chargement et du sélecteur de nations en cours.


## 20 novembre 2026 — Fiches de campagne des nations
- Ajout d'une fiche dynamique à la sélection : capitale, population et richesse lorsque les données source le permettent, indice de potentiel militaire estimatif, statut diplomatique et objectifs contextualisés.
- Les statistiques modernes ne sont pas réinjectées dans les années historiques. Les valeurs manquantes sont indiquées plutôt qu'inventées.
- Ajout de tests unitaires pour les cas historiques, contemporains, vassaux et données incomplètes.


## 20 novembre 2026 — fusion des fiches et préchauffage de la carte

- PR #13 fusionnée dans `main` : encyclopédie stratégique des nations, fiche de campagne et tests associés.
- `src/world/map-lod.js` : ajout d'un préchauffage réutilisable des quatre couches régionales 1:10m vers IndexedDB.
- `src/main.js` : démarrage différé du préchargement régional après réception des données mondiales ; statut visible dans le sélecteur de nations ; préparation en tranches inactives des index spatiaux des couches mondiales et des territoires.
- Les six GeoJSON mondiaux et le raster ETOPO restent servis par Cache Storage via `fetchMapAsset`, ce qui réutilise les ressources déjà téléchargées au prochain lancement.
- Écran d'ouverture : animation orbitale de l'emblème, reflet animé de la barre et progression numérique interpolée par `requestAnimationFrame`. Les préférences de mouvement réduit sont respectées.
- Les couches régionales sont facultatives : un échec de téléchargement ou l'absence d'IndexedDB ne bloque pas le démarrage ni le fond mondial.
- Validation navigateur visuelle et mesure FPS sur la machine cible à effectuer ; le préchargement ne promet pas un mode hors ligne complet.


## 20 novembre 2026 — panneau de nouvelle campagne compact
- Réduction de la hauteur occupée par le titre, la date, le mode et les filtres de nation.
- Liste des nations et fiche stratégique plus courtes, avec défilement interne indépendant pour conserver l'accès aux informations sans faire défiler toute la fenêtre.
- Sur mobile, date et mode restent côte à côte ; la sélection de nation conserve toute la largeur.
- Ajustements supplémentaires pour les écrans bas et les petits mobiles.


## 20 novembre 2026 — correction du panoramique cartographique
- Le compositeur pouvait demander un rendu vectoriel complet toutes les 250 ms lorsque le bitmap ne couvrait plus l'écran, notamment pendant un déplacement vertical au zoom mondial ×1.
- Le recalcul est maintenant interdit tant que le pointeur est maintenu : le bitmap est déplacé par le compositeur, puis un rendu complet unique est effectué après le relâchement (debounce existant).
- Ajout de tests sur la décision de recalcul pendant et après le geste.
- Cette correction vise les saccades causées par les reconstructions répétées pendant le glisser. Elle ne remplace pas un profilage navigateur des coûts du zoom, du relief et des frontières.


## 20 novembre 2026 — optimisation profonde du moteur cartographique
- Suppression du benchmark comparatif automatique qui lançait un deuxième rendu complet du monde après le premier zoom : ce test perturbait lui-même la fluidité.
- Les index géographiques ne sont plus construits au premier affichage mondial ; ils sont préparés pendant les périodes inactives et utilisés seulement au zoom régional.
- Les rendus et chargements de couches asynchrones sont différés tant qu'un glisser ou un zoom à la molette est en cours.
- Pendant un glisser, le compositeur ne reconstruit plus les hitboxes de labels à chaque mouvement.
- Les tuiles ETOPO utilisent trois paliers de résolution stables (48, 96, 144 px) au lieu de changer à presque chaque zoom, ce qui améliore la réutilisation du cache.
- Le cache de tuiles est plafonné à 1 600 entrées au lieu de 2 200.
- Tant que le Worker ETOPO n'a pas terminé, le moteur affiche une hypsométrie légère plutôt que de calculer synchroniquement le hillshade sur le thread principal. Le relief ombré est appliqué à la fin du pré-calcul.
- Le Worker calcule maintenant les vecteurs d'éclairage une seule fois, et non pour chaque pixel du raster.
- La détection des villes durablement submergées utilise un index spatial local des cellules physiques, construit uniquement après une modification géographique, au lieu de parcourir toutes les cellules pour chaque ville.
- Tests ajoutés pour les paliers de résolution, l'index de submersion, l'antiméridien et l'absence d'indexation au zoom mondial.
- La validation réelle des FPS, de la mémoire et du rendu visuel reste à effectuer dans un navigateur sur la machine cible ; aucune valeur de performance n'est inventée.


## 20 novembre 2026 — cache des couches statiques et scènes quantifiées
- `src/world/map-renderer.js` : séparation du fond cartographique statique (océan, grille, relief, terres, aplats territoriaux, hachures et hydrographie) des couches dynamiques (contours sélectionnés, catastrophes, frontières politiques/administratives et labels).
- Les couches statiques sont composées dans une surface hors écran et conservées dans un LRU borné à trois scènes par canvas. La clé tient compte de l'année, du viewport quantifié, des collections visibles, du terrain, de son état Worker, du mode de relief et de l'opacité territoriale.
- Un changement de nation réutilise le fond statique ; seules les couches dynamiques nécessaires sont redessinées.
- `src/world/scene-compose.js` et `src/main.js` : le centre du rendu est quantifié à la résolution du viewport de rendu. Les micro-déplacements dans la même cellule réutilisent la scène précédente, que le compositeur décale précisément à l'écran.
- Les hitboxes des labels sont recalculées après le geste même si aucun nouveau rendu vectoriel n'est nécessaire.
- Tests ajoutés sur le cache de scène et la quantification du centre.
- Le rendu vectoriel complet reste sur le thread principal ; l'usage d'un Worker/OffscreenCanvas pour les vecteurs n'est pas encore intégré et dépendra du profilage réel.


## 20 novembre 2026 — plafonds mémoire des caches cartographiques
- Le cache des tuiles ETOPO est désormais limité à 64 Mio, en plus de son plafond de 1 600 entrées.
- Le cache des surfaces statiques est limité à trois scènes et 48 Mio par canvas. Une scène plus grande que le budget n'est pas conservée en cache.
- Les caches utilisent un LRU et évacuent les surfaces les plus anciennes dès que le budget est dépassé.
- Les diagnostics exposent le nombre d'entrées et les octets retenus pour le cache statique ; tests ajoutés sur le budget.


## 20 novembre 2026 — seconde vague d'optimisation LOD
- Relief ETOPO : résolution des tuiles abaissée à 32/64/96 px selon le zoom, avec qualité adaptative ; l'overlay hillshade et les hachures sont omis à très faible zoom pour éviter une seconde passe coûteuse.
- Frontières administratives : forte simplification à faible zoom, masquage sous 2× et filtrage des entités de rang secondaire jusqu'à 4× ; le chargement 1:10m est repoussé à 7×.
- Labels et repères : plafond de candidats selon le zoom, suppression des provinces/villes secondaires à petite échelle et conservation des sommets majeurs avant 2,5×.
- Données régionales : abandon du préchargement automatique des quatre GeoJSON 1:10m ; chaque famille est téléchargée, transformée et mise en cache séparément à son seuil d'utilisation (terres 6×, lacs 7×, rivières 8×, villes 4×).
- Le téléchargement volontaire du pack complet reste disponible. Les tests couvrent les seuils LOD, les nouvelles résolutions et le chargement régional à la demande.
- Les performances réelles restent à mesurer dans le navigateur cible ; aucun gain FPS n'est annoncé sans mesure.


## 20 novembre 2026 — priorité aux interactions
- Le préchargement des index spatiaux est annulé dès le début d'un glisser ou d'un zoom.
- La préparation des index est étalée par familles de couches sur plusieurs périodes de repos pour éviter une longue tâche concurrente.
- Le pixel ratio du bitmap cartographique est plafonné à 1,25× pour réduire le coût de composition sur les écrans Retina.
- Le rendu vectoriel complet après interaction est déclenché après 240 ms sans nouveau geste, évitant les reconstructions répétées au cours d'un zoom continu.


## 20 novembre 2026 — rendu cartographique dans un Worker
- Ajout de `src/world/map-render-worker.js` : le rendu vectoriel complet est déporté dans un Worker module utilisant OffscreenCanvas.
- Les collections GeoJSON et la grille de terrain ne sont clonées vers le Worker que lorsqu'elles changent ; elles sont conservées entre les rendus pour préserver le cache statique.
- Le Worker renvoie un ImageBitmap transférable ; les demandes sont coalescées pour ne garder que la plus récente si un rendu est déjà en cours.
- Fallback automatique vers le rendu historique sur le thread principal si Worker/OffscreenCanvas ou le transfert des données n'est pas disponible.
- Validation automatisée de syntaxe et de tests ; vérification visuelle multi-navigateurs et mesures réelles restent à effectuer.
\n\n### Densité des villes — 20 novembre 2026\nLes noms de villes sont plafonnés par niveau de zoom (10, 18, 24 puis 30 labels maximum). À nombre égal, les villes de rang cartographique prioritaire puis les plus peuplées sont affichées en premier. Les continents, pays, provinces et autres repères conservent leur priorité ; les villes non retenues restent dans les données et ne sont pas supprimées du monde ni des interactions.\n

### Hiérarchie des détails secondaires — 20 novembre 2026
L'hydrographie secondaire, les petits lacs, les glaciers et les repères d'altitude suivent désormais un profil LOD progressif. À faible zoom, seuls les cours d'eau et lacs de rang majeur sont dessinés, les glaciers sont masqués et les repères d'altitude sont fortement limités. Le détail augmente aux zooms régionaux puis locaux. Les frontières administratives secondaires sont également masquées plus longtemps et les frontières politiques restent prioritaires. Ces filtres ne suppriment aucune donnée source.
