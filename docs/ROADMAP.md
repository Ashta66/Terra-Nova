## 24 novembre 2026 — lot 28 : consultation sans allocation de l'index spatial

- [x] Supprimer la création d'un tableau de candidats à chaque mouvement du pointeur.
- [x] Supprimer le `Set` temporaire et le tri des candidats pendant le survol.
- [x] Fusionner à rebours les indices de cellule et de débordement déjà ordonnés.
- [x] Préserver strictement la priorité du dernier label dessiné.
- [x] Éviter la création d'objets de bornes temporaires pendant les tests de collision au pointeur.
- [x] Garder une recherche linéaire sans allocation de collection temporaire en l'absence d'index valide.
- [x] Conserver le comportement des labels géants placés dans la liste de débordement.
- [x] Couvrir les deux ordres de priorité entre labels locaux et labels de débordement.
- [x] Tester les limites exactes des cellules et les index mal formés.
- [x] Ajouter cinq tests de régression ciblés.
- [ ] CI GitHub Actions : à confirmer.
- [ ] Validation locale du joueur : `npm test` à confirmer.

La consultation de l'index ne construit plus de collection temporaire et ne trie plus les candidats à chaque événement de pointeur.
## 24 novembre 2026 — lot 27 : index spatial du ciblage des labels

- [x] Construire une grille spatiale sur les emprises interactives visibles.
- [x] Conserver l'indice de dessin original afin de préserver la priorité du dernier label composé.
- [x] Limiter les candidats du survol à la cellule du pointeur.
- [x] Gérer les coordonnées et cellules négatives.
- [x] Répartir les emprises qui traversent plusieurs cellules.
- [x] Placer les emprises anormalement grandes dans une liste de débordement bornée.
- [x] Ignorer les emprises invalides lors de la construction de l'index.
- [x] Revenir à la recherche linéaire si l'index ne correspond pas à la collection interrogée.
- [x] Reconstruire l'index avec les zones visibles à chaque composition de scène.
- [x] Ajouter neuf tests couvrant équivalence, bords, chevauchements et cas atypiques.
- [ ] CI GitHub Actions : à confirmer.
- [ ] Validation locale du joueur : `npm test` à confirmer.

L'index accélère la recherche spatiale sans modifier les emprises ni la priorité de sélection existantes.
## 24 novembre 2026 — lot 26 : fiabilité du ciblage des labels

- [x] Extraire la résolution du label sous le pointeur dans un module dédié et testable.
- [x] Préserver la priorité du dernier label composé lorsque plusieurs zones se recouvrent.
- [x] Rendre les quatre bords et les coins des zones interactives inclusifs.
- [x] Normaliser les coordonnées numériques textuelles du pointeur et des emprises.
- [x] Rejeter les coordonnées de pointeur non finies ou non numériques.
- [x] Ignorer les rectangles inversés, incomplets ou non finis sans bloquer les labels valides.
- [x] Continuer la recherche lorsqu'une zone invalide est rencontrée au-dessus d'une zone valide.
- [x] Retourner proprement null pour les entrées absentes, vides ou non tabulaires.
- [x] Connecter le helper au ciblage existant sans modifier les événements ni leur ordre.
- [x] Ajouter dix tests ciblés sur les cas nominaux, limites et dégradés.
- [ ] CI GitHub Actions : à confirmer.
- [ ] Validation locale du joueur : `npm test` à confirmer.

Le comportement de priorité visuelle existant est conservé ; ce lot fiabilise uniquement la résolution géométrique du pointeur.
## 24 novembre 2026 — lot 25 : cohérence interne des géométries de labels

- [x] Extraire un validateur déterministe de cohérence entre emprise visuelle, ancre de texte et zone interactive.
- [x] Vérifier que la zone interactive englobe entièrement l'emprise visuelle.
- [x] Vérifier que l'ancre typographique reste dans l'emprise déclarée.
- [x] Inclure le rayon et l'épaisseur du contour du marqueur dans le contrôle d'inclusion.
- [x] Rejeter les marqueurs non finis, négatifs ou sortant de leur zone interactive.
- [x] Appliquer le validateur avant tout ajustement au viewport pour éviter de propager une géométrie incohérente.
- [x] Préserver le placement des labels valides sans modification.
- [x] Ajouter des tests sur les inclusions, les débordements du marqueur et les géométries incohérentes.
- [ ] CI GitHub Actions : à confirmer.
- [ ] Validation locale du joueur : `npm test` à confirmer.

Le contrôle porte sur la cohérence des données géométriques, pas sur le contenu historique ni sur les règles d'apparition des labels.
## 24 novembre 2026 — lot 24 : intégrité des emprises et collisions interactives

- [x] Normaliser les coordonnées numériques avant les comparaisons d'emprises, y compris lorsqu'elles sont fournies sous forme de chaînes.
- [x] Conserver les coordonnées négatives valides et rejeter les rectangles inversés ou non finis.
- [x] Valider les coordonnées du texte et du marqueur avant tout ajustement au viewport.
- [x] Normaliser les bornes et les métriques du marqueur avant de calculer les décalages.
- [x] Utiliser les zones interactives complètes pour détecter les collisions, pas seulement les rectangles typographiques.
- [x] Inscrire ces mêmes zones interactives dans la grille spatiale afin que placement et ciblage restent cohérents.
- [x] Préserver ensemble texte, marqueur, emprise visuelle et zone de clic lors du repositionnement.
- [x] Ajouter des tests sur les chaînes numériques, coordonnées négatives, valeurs invalides et collisions de labels rendus.
- [ ] CI GitHub Actions : à confirmer.
- [ ] Validation locale du joueur : `npm test` à confirmer.

Ce lot privilégie la cohérence des interactions : deux labels ne peuvent plus se superposer uniquement parce que leurs glyphes sont séparés alors que leurs zones de clic se recouvrent.

## 24 novembre 2026 — lot 23 : placement sûr dans le viewport

- [x] Ajuster ensemble texte, marqueur, emprise et zone interactive aux marges du viewport.
- [x] Rejeter les labels trop grands ou les viewports invalides.
- [x] Garantir que la zone interactive complète reste dans la marge sûre.
- [x] Ajouter des tests sur les bords gauche, inférieur, les emprises excessives et le placement sans décalage.
- [x] Validation locale du joueur : `npm test` confirmé.

## 24 novembre 2026 — lot 22 : robustesse des collisions de labels

- [x] Centraliser le chevauchement des rectangles dans un helper déterministe.
- [x] Considérer le contact exact entre deux emprises comme une collision.
- [x] Rejeter les emprises absentes, inversées ou non finies.
- [x] Ajouter des tests de chevauchement, séparation, contact et géométries invalides.
- [x] Validation locale du joueur : `npm test` confirmé.

## 24 novembre 2026 — lot 21 : robustesse du classement des villes

- [x] Extraire la normalisation du rang cartographique des villes dans un helper déterministe.
- [x] Accepter les variantes de casse des champs de rang et les seuils de zoom comme repli.
- [x] Normaliser les rangs absents, négatifs ou non numériques sans produire de comparaisons NaN.
- [x] Reconnaître plusieurs conventions de champs de population (POP_MAX, POP_EST et variantes).
- [x] Neutraliser les populations absentes, négatives ou invalides.
- [x] Conserver la priorité du rang cartographique avant la population.
- [x] Préserver le tri alphabétique et l'ordre source comme derniers critères déterministes.
- [x] Ne modifier aucune propriété des entités géographiques.
- [x] Ajouter des tests unitaires sur les valeurs valides, invalides et les arbitrages de priorité.
- [ ] CI GitHub Actions : à confirmer.
- [x] Validation locale du joueur : `npm test` confirmé.

Le lot fiabilise uniquement le classement des labels urbains. Il ne change ni les coordonnées, ni les seuils d'apparition, ni les données historiques des villes.

## 24 novembre 2026 — lot 20 : densité adaptative et finesse des labels

- [x] Extraire le calcul du budget de labels secondaires dans un profil déterministe testable.
- [x] Conserver les plafonds progressifs de candidats selon les niveaux de zoom.
- [x] Normaliser les valeurs de densité et protéger les entrées non finies.
- [x] Ne compter dans le budget que les labels éligibles, nommés et présents dans le viewport.
- [x] Éviter que les repères hors écran ou masqués par leur seuil de zoom consomment le budget visible.
- [x] Préserver la priorité illimitée des noms de pays.
- [x] Conserver un plafond indépendant pour les noms de villes.
- [x] Différencier progressivement la taille des océans, mers régionales et détroits.
- [x] Réduire légèrement le contraste et l'épaisseur des mers puis des détroits pour limiter la compétition visuelle.
- [x] Ajouter des tests sur les profils de densité, les entrées invalides, les tailles et le contraste maritime.
- [x] CI GitHub Actions : syntaxe et tests réussis (run 45453918378).
- [x] Validation locale du joueur : `npm test` confirmé.

Le budget est désormais consommé par les candidats effectivement visibles dans le viewport. Le classement, les seuils d'apparition et les priorités de placement restent les arbitres des collisions.

## 24 novembre 2026 — lot 19 : hiérarchie de placement des labels maritimes

- [x] Donner aux océans une priorité de placement supérieure aux labels ordinaires.
- [x] Placer les mers régionales après les océans, mais avant les labels terrestres secondaires.
- [x] Donner aux détroits une priorité explicite, après les mers et avant les pays.
- [x] Maintenir les pays au-dessus des provinces et des villes.
- [x] Définir une priorité de repli déterministe pour les catégories inconnues.
- [x] Centraliser la résolution de priorité pour éviter les valeurs implicites dispersées.
- [x] Préserver le tri secondaire des villes par rang et population.
- [x] Ne pas modifier les seuils de zoom, les budgets de densité ni les géométries.
- [x] Ajouter des tests sur l'ordre complet et la catégorie inconnue.
- [x] Documenter la règle de placement et ses limites.
- [x] Validation locale du joueur : `npm test` confirmé.
- [ ] Contrôle visuel de la hiérarchie et des collisions aux zooms 2 à 7.

Cette hiérarchie agit uniquement sur l'ordre de placement et la résolution des collisions ; elle ne garantit pas l'affichage de tous les labels lorsqu'ils se chevauchent.

## 24 novembre 2026 — lot 18 : golfes, baies et détroits

- [x] Étendre la nomenclature aux grands golfes et baies stratégiques.
- [x] Ajouter les golfes du Mexique, de Guinée, Persique, d'Aden, d'Alaska et de Californie.
- [x] Ajouter la baie du Bengale et les mers Adriatique, Égée, de Corail et des Philippines.
- [x] Ajouter des passages maritimes majeurs : Manche, Gibraltar, Malacca et Mozambique.
- [x] Définir des seuils de zoom progressifs, plus élevés pour les passages étroits.
- [x] Conserver des ancres ponctuelles indicatives et distinctes des données hydrographiques.
- [x] Réutiliser le style maritime commun sans accentuer artificiellement ces labels.
- [x] Préserver les repères océaniques et régionaux déjà présents.
- [x] Ajouter des tests de présence, catégorie, coordonnées et seuils d'apparition.
- [x] CI GitHub Actions : syntaxe et tests réussis (run 45362993858).
- [x] Documenter le rôle cartographique indicatif des nouvelles entrées.
- [x] Validation locale du joueur : `npm test` confirmé.
- [ ] Contrôle visuel des densités et collisions aux zooms 4 à 7.

Les ancres des golfes, baies et passages sont des points d'étiquetage, non des géométries de navigation ou des limites maritimes.

## 24 novembre 2026 — lot 17 : nomenclature des mers et bassins régionaux

- [x] Étendre les toponymes maritimes au-delà des seuls océans.
- [x] Ajouter des labels dédiés à la Méditerranée, aux mers des Caraïbes, du Nord, Baltique, Rouge, Noire, d'Arabie, de Chine méridionale, du Japon et de Béring.
- [x] Positionner les noms sur des points géographiques représentatifs, distincts des côtes et des grands centres urbains.
- [x] Réserver leur apparition à une échelle régionale pour préserver la lecture du planisphère.
- [x] Conserver les deux occurrences du Pacifique sur les côtés opposés de la carte.
- [x] Réutiliser le style maritime discret défini au lot 16 pour les océans et mers régionales.
- [x] Garder les données de labels indépendantes des frontières et de la simulation.
- [x] Ajouter des tests de couverture, d'identifiants et de seuils de zoom.
- [x] Préserver le format GeoJSON et les métadonnées de provenance.
- [x] Documenter le caractère indicatif des points d'ancrage.
- [x] Validation locale du joueur : `npm test` confirmé.
- [ ] Contrôle visuel des collisions aux zooms 1, 3 et 5.

Les points sont des ancres typographiques indicatives et non des limites hydrographiques. Les labels régionaux apparaissent progressivement afin de ne pas encombrer la vue mondiale.

## 24 novembre 2026 — lot 16 : profondeur océanique et toponymie maritime

- [x] Définir un profil de profondeur océanique par ère historique.
- [x] Renforcer progressivement la profondeur périphérique sans assombrir brutalement le centre.
- [x] Ajouter une lumière diffuse évoquant les plateaux continentaux, sans prétendre représenter une bathymétrie réelle.
- [x] Conserver un profil discret pour les ères anciennes et une profondeur plus marquée pour le futur.
- [x] Borner les opacités et rayons pour éviter les aplats trop contrastés.
- [x] Adapter la typographie des noms maritimes avec une variante italique.
- [x] Utiliser la couleur de texte thématique pour garder un contraste stable selon l'époque.
- [x] Réduire l'emphase des mers et océans par rapport aux pays.
- [x] Préserver les dimensions de rendu et le cache statique existants.
- [x] Ajouter des tests sur les six profils et la hiérarchie typographique maritime.
- [x] Validation locale du joueur : `npm test` confirmé.
- [ ] Contrôle visuel des océans sur les six ères, aux zooms monde et régional.

La lumière ajoutée est un traitement graphique d'ambiance, pas une donnée scientifique de profondeur. Aucune géométrie, donnée hydrographique ou règle de simulation n'est modifiée.

## 24 novembre 2026 — lot 15 : précision des emprises et interactions des labels

- [x] Centraliser le calcul de position des textes, marges de collision et emprises interactives.
- [x] Distinguer les marges des pays, villes et labels secondaires.
- [x] Élargir légèrement les zones interactives sans augmenter artificiellement les collisions.
- [x] Faire correspondre les hitboxes à la géométrie réellement dessinée.
- [x] Définir une géométrie de marqueur de ville issue du même calcul de layout.
- [x] Éviter que l'ombre du texte se propage au marqueur de ville.
- [x] Mettre les dimensions à l'échelle du rendu haute densité.
- [x] Borner les mesures invalides pour éviter les rectangles NaN ou infinis.
- [x] Préserver les priorités et l'ordre de collision existants.
- [x] Ajouter des tests pour pays, villes, continents, échelles et valeurs invalides.
- [x] Validation locale du joueur : `npm test` confirmé.
- [ ] Contrôle visuel des clics/infobulles sur les labels.

Le lot ne modifie ni les données géographiques, ni les priorités de sélection, ni les règles d'apparition des noms. La qualité de ciblage doit être confirmée dans le navigateur.

## 24 novembre 2026 — lot 14 : typographie cartographique des six ères

- [x] Utiliser la police d'affichage de l'ère pour les noms de pays et de continents.
- [x] Utiliser la police de lecture de l'ère pour les villes et labels secondaires.
- [x] Conserver les polices historiques et futuristes déjà chargées dans la page.
- [x] Adapter la couleur des textes à la palette de l'ère active.
- [x] Utiliser la surface thématique comme halo sombre pour détacher les noms du relief.
- [x] Faire ressortir les noms de pays avec une graisse et un contour supérieurs.
- [x] Maintenir les continents à un niveau intermédiaire de hiérarchie.
- [x] Réduire l'opacité des labels océaniques et secondaires.
- [x] Accorder les marqueurs de villes à l'accent coloré de l'époque.
- [x] Ajouter des tests sur les six ères, la hiérarchie, les contrastes et l'échelle de rendu.
- [x] Validation locale du joueur : `npm test` confirmé.
- [ ] Contrôle visuel des six ères à plusieurs niveaux de zoom.

Le changement ne touche ni les coordonnées, ni les priorités de collision, ni les règles d'apparition des labels. La lisibilité réelle doit être confirmée sur la carte en contexte.

## 24 novembre 2026 — lot 13 : budgets et réutilisation des géométries

- [x] Porter le cache des chemins projetés à 4 096 entrées, 10 variantes par feature et 750 000 sommets estimés (24 Mo estimés).
- [x] Porter le cache LRU des masques terrestres composés à 24 entrées.
- [x] Ajouter un test de non-régression des plafonds de cache.
- [x] Validation locale du joueur : `npm test` confirmé.
- [ ] Refaire un benchmark PC zoom 20 (cache chaud, même viewport/DPR, 60–70 secondes) et comparer médiane/p95, évictions, constructions et heap JS.
- [ ] Vérifier en navigation aller-retour que les vues récemment visitées réutilisent les chemins sans dérive visuelle.

Les budgets restent plafonnés ; les 24 Mo des chemins sont une estimation logicielle et non une mesure native Path2D. Un panoramique continu peut toujours créer de nouvelles clés de projection. Aucun gain de performance n'est présumé avant le prochain relevé.

## 21 novembre 2026 — intégration du moteur cartographique (PR #46)

Cette tranche d'intégration est développée sur `integration/unified-map-engine-main` et proposée à `main` via PR #46, maintenue en brouillon.

- [x] Porter le relief WebGL tuilé et le renderer géographique WebGL sans écraser les systèmes de simulation de `main`.
- [x] Ajouter la persistance IndexedDB, le préchargement des tuiles et les fallbacks Canvas.
- [x] Ajouter le cache WebGL polygonal incrémental par huit compartiments stables, le budget de buffers et l'observabilité des reconstructions/uploads.
- [x] Porter le cache de chemins projetés à 2 048 entrées / 500 000 sommets estimés (16 Mo max estimés) et conserver 12 masques composés.
- [x] Maintenir le Worker LOD persistant pour les niveaux mondiaux/régionaux.
- [x] Ajouter aux exports de benchmark les métadonnées écran/viewport/DPR/tactiles pour détecter les essais involontairement réalisés en émulation mobile.
- [x] CI vérifiée sur le commit `9583552642ee3f863952cd5338eba51e31065c9b` : 494 tests réussis, 0 échec ; syntaxe et scripts shell validés.
- [ ] Valider visuellement dans un navigateur PC réel : continuité des tuiles, transitions parent/enfant, frontières, relief, labels, couches physiques et fallbacks.
- [ ] Refaire le benchmark de référence sur navigateur PC en mode bureau (cache chaud, zoom 20, même viewport et durée), sans comparer avec les mesures Pixel 10.
- [ ] Réaliser un test séparé du préchauffage LOD aux zooms 3–5 et vérifier les compteurs du Worker.
- [ ] Comparer la fluidité, les uploads WebGL et la mémoire sur une session prolongée avant toute fusion.

Les tests automatisés ne remplacent pas les essais visuels et matériels. PR #46 reste en brouillon jusqu'à validation et accord explicite.


## 20 novembre 2026 — remplacement progressif des tuiles parentes
- La pile de rendu collecte désormais tous les ancêtres disponibles et les tuiles enfants exactes du plan courant, sans doublons.
- Les niveaux parents sont dessinés avant les enfants ; les enfants apparaissent par fondu de 180 ms lorsqu'un parent est présent, évitant les trous visuels pendant le raffinement.
- Le cache expose un test de présence sans toucher l'ordre LRU, ce qui évite de transformer chaque vérification de couverture en accès de lecture.
- Le rendu des tuiles reste limité aux zones que la scène principale ne couvre pas encore : le moteur historique reste la référence pendant cette transition.
- Tests dédiés à l'ordre parent/enfant et à la déduplication ; validation visuelle navigateur encore nécessaire pour confirmer l'absence de coutures aux bords des tuiles.

## 20 novembre 2026 — première génération de tuiles physiques autonomes
- Ajout d'un Worker dédié qui prépare des bitmaps physiques 512×256 indépendants, à partir des terres, de l'hydrographie, des glaciers, des repères d'altitude et du relief ETOPO.
- Chaque tuile possède une emprise géographique stable calculée depuis ses coordonnées z/x/y ; le rendu ne contient ni frontières politiques, ni labels politiques, ni événements dynamiques.
- Les bitmaps sont mis en cache dans un LRU plafonné à 64 Mio et 192 entrées. Les ImageBitmap sont fermés lors de leur éviction pour libérer leurs ressources graphiques.
- Le moteur demande les tuiles visibles et anticipées depuis le planificateur existant, avec deux tâches maximum en vol. Les requêtes en attente sont remplacées par le plan le plus récent après un déplacement.
- Les tuiles disponibles, y compris leurs ancêtres moins détaillés, peuvent remplir les zones qui sortent de la scène surdimensionnée pendant un panoramique. Le rendu complet existant reste au-dessus et continue d'assurer la compatibilité.
- Cette tranche crée et exploite les tuiles physiques comme couche de secours ; l'étape suivante déplacera la composition physique normale vers cette pyramide et séparera les overlays politiques et dynamiques de façon visible.

## 20 novembre 2026 — architecture cartographique par tuiles et familles de données
- Ajout d'un planificateur de tuiles équirectangulaires à niveaux de zoom discrets, avec coordonnées stables, marge de préchargement, priorité dans le sens du déplacement et liste des tuiles parentes utilisables en repli.
- Le planificateur est branché au préchargement inactif existant ; les index GeoJSON et le rendu Canvas/Worker restent le chemin de rendu de référence pendant cette première étape. Les tuiles ne sont pas encore des bitmaps vectoriels indépendants.
- Introduction d'un cache LRU de tuiles pondéré en octets, plafonné en nombre d'entrées et en mémoire, ainsi que d'un résolveur de tuiles parentes. Le raccordement du stockage persistant et du rendu réel par tuiles reste une étape suivante.
- Séparation du protocole Worker en trois familles indépendantes : physique (terres, hydrographie, relief), politique/historique (territoires, frontières, labels) et dynamique (géographie modifiée par les événements). Les objets GeoJSON restent partagés par référence.
- La composition visuelle est désormais coalescée par un ordonnanceur dédié à `requestAnimationFrame`; les calculs de rendu demeurent déportés dans le Worker lorsqu'il est disponible.
- Tests dédiés aux niveaux de tuiles, à l'antiméridien, aux parents de repli, aux familles de couches, à l'ordonnanceur et au budget LRU.
- Limite explicitement conservée : ce jalon prépare la pyramide et les frontières d'architecture ; il ne prétend pas encore fournir un moteur WebGL ni des tuiles raster/vectorielles autonomes. Validation navigateur et mesures FPS/mémoire à effectuer après le raccordement du rendu par tuiles.

## 20 novembre 2026 — rafraîchissement progressif pendant la navigation
- Le déplacement du bitmap reste immédiat pendant le glisser et le zoom à la molette.
- Un rendu intermédiaire du Worker est désormais autorisé au maximum toutes les 120 ms pendant un geste continu ; les mouvements rapprochés sont coalescés par la file existante du Worker.
- Après le dernier mouvement, le rendu final haute qualité est déclenché après 90 ms au lieu de 240 ms. Le timer d'aperçu restant est annulé pour éviter un rendu redondant.
- Les limites mémoire, le pixel ratio, les profils LOD et la simplification géographique ne sont pas relâchés.
- Tests dédiés aux cadences de rafraîchissement. Les gains réels de fluidité et les éventuels artefacts restent à vérifier dans le navigateur cible.

## 20 novembre 2026 — généralisation géométrique multi-couches
- Ajout de `src/world/geometry-generalization.js` : simplification GeoJSON avant indexation spatiale et projection, pour réduire les sommets parcourus par les index et le Worker de rendu.
- Application aux terres mondiales/régionales, lacs, rivières, glaciers, territoires politiques, frontières politiques et administratives. Les coordonnées sources dans le dépôt ne sont pas modifiées ; seules les collections actives en mémoire sont généralisées.
- Les sommets partagés entre entités sont conservés comme ancrages afin de maintenir l'alignement des frontières communes. Les anneaux restent fermés et les géométries ne sont pas réécrites sur disque.
- Renforcement modéré de la simplification écran, y compris aux niveaux de zoom rapprochés : légère baisse de détail, sans suppression brutale des grands contours.
- Tests dédiés à la réduction des sommets, à l'intégrité des sources et à l'alignement des frontières partagées.

## 20 novembre 2026 — filtrage physique des petites îles et des lacs secondaires
- Les petites composantes insulaires sous 100 km² sont retirées des couches terrestres mondiales et régionales avant la création des index spatiaux ; pour les territoires politiques, la plus grande composante de chaque territoire est conservée afin de ne pas effacer un petit État insulaire.
- Les lacs de rang secondaire et les lacs de moins de 500 km² sont exclus de la collection active dès le chargement ; les 12 plus grands lacs visibles restent dessinés au maximum.
- Le chargement régional 1:10m des lacs est désactivé et les anciennes entrées mondiales/régionales de lacs sont purgées des caches du navigateur et d'IndexedDB. Les fichiers GeoJSON sources restent intacts dans le dépôt.
- Le pack cartographique passe à 6 ressources de base et 3 couches régionales. Tests couvrant le filtrage et la conservation des territoires insulaires.

## 20 novembre 2026 — réduction du coût de l'hydrographie lacustre
- La carte ne dessine désormais que les 12 plus grands lacs de rang 0 ou 1 parmi les entités visibles, à tous les niveaux de zoom.
- Les lacs secondaires ne réapparaissent plus au zoom rapproché ; les grands bassins sont prioritaires selon leur rang Natural Earth puis leur emprise géographique corrigée par la latitude.
- Le filtrage intervient avant la construction des chemins Canvas/Path2D, ce qui évite de simplifier et dessiner inutilement des centaines de contours régionaux. Les données sources restent intactes.
- Tests ajoutés sur le plafond, le rang, le classement par taille et les géométries admissibles.
## Harmonisation des rives intérieures — 20 novembre 2026
- Les contours des lacs et mers intérieures utilisent le même profil de simplification géométrique que les côtes marines.
- Le filtrage progressif par rang des lacs est conservé ; les grands plans d'eau restent visibles, mais leurs micro-découpes et petites îles sont allégées.
- Test dédié aux zooms 1×, 2×, 4×, 8× et 20×.

## Correction du doublon de littoral — 20 novembre 2026
- Le fond terrestre ne trace plus de contour côtier propre : il reste un aplat de base et un masque pour le relief. Les contours politiques dédiés constituent la référence visible.
- Simplification du fond et des couches territoriales renforcée : tolérance de 3,2 à 4,4 px et suppression des anneaux inférieurs à 24–72 px² selon le zoom, afin de réduire les micro-îles et les dentelures.
- Les géométries sources ne sont pas supprimées ; les seuils s'appliquent uniquement au rendu.

## Harmonisation du littoral physique et politique — 20 novembre 2026
- Les contours territoriaux utilisent désormais le même profil de simplification que le masque terrestre, et non le profil côtier plus fin réservé aux autres frontières.
- Les micro-îles et découpes de côte ne doivent donc plus réapparaître sous forme de tracé politique isolé ; les aplats, couleurs et statuts des pays restent conservés.
- Les tests couvrent l'identité des profils aux zooms 1×, 2×, 4×, 8× et 20×. Le rendu visuel réel reste à contrôler dans le navigateur.

## Fond terrestre neutralisé — 20 novembre 2026
- Le fond des terres sous les aplats politiques n'utilise plus la palette ocre du thème historique : teinte neutre et désaturée.
- Le trait du littoral est passé à un ton froid discret et affiné ; il reste un repère géographique, sans ressembler à une seconde frontière politique.
- Les aplats colorés des pays, leurs contours et leurs statuts restent inchangés. Le relief ETOPO reste disponible et indépendant.

## Correction des couches de relief et territoires — 20 novembre 2026
- Suppression des triangles symbolisant les sommets montagneux ; les noms des sommets majeurs (≥ 5 000 m) sont conservés.
- Les aplats colorés des territoires historiques utilisent désormais le même profil de simplification du littoral que le fond terrestre, afin d'éviter les petites îles qui semblent flotter hors du masque physique.
- Les contours territoriaux conservent leur profil plus détaillé : la hiérarchie des frontières n'est pas sacrifiée pour corriger les aplats.
- Les repères de dépressions restent inchangés.

## Optimisation cartographique — 20 novembre 2026
- Littoral physique et masque du relief simplifiés davantage que les frontières territoriales ; les micro-îles et détails côtiers secondaires sont écartés à toutes les échelles.
- Hillshade superposé allégé : qualité raster plafonnée à 0,62 et opacité réduite (0,52 en mode politique ; 0,66 en mode relief).
- Les villes sont strictement plafonnées à cinq labels, quel que soit le zoom.
- Le réseau hydrographique conserve les rangs 0 et 1, au maximum 18 grands cours d'eau, triés par rang puis longueur géométrique.
- La composition utilise une interpolation basse qualité pendant le geste et haute qualité au repos ; le registre de références du Worker est réinitialisé lors de chaque redémarrage.

# TERRA NOVA — feuille de route de développement

> Source de vérité sur l'ordre des lots et leur état. Les statuts doivent refléter le code réellement présent, pas les intentions.

Légende :
- **TERMINÉ** : code intégré sur la branche indiquée et tests vérifiés.
- **EN COURS** : développement commencé, périmètre incomplet.
- **À FAIRE** : non implémenté.
- **À VALIDER** : dépend d'un choix ou d'un test de gameplay.

## État synthétique au 20 novembre 2026

- Branche de travail : `dev`
- Stable : `main` contient les fondations initiales du lot 1, fusionnées par PR #2.
- PR #1 : brouillon de développement `dev` vers `staging`, à ne pas fusionner automatiquement.
- Interface plein écran trois colonnes : intégrée sur `dev`.
- Dernières vérifications GitHub Actions de l'interface : réussies (run 44630008505).
- Le développement cartographique n'est pas encore fusionné dans `main`. Le jeu de données ETOPO a toutefois été ajouté séparément à `main` et copié dans `dev` ; le moteur reste développé sur `dev`.

## Phase 0 — cadrage et fondations

| Lot | Contenu | Statut |
|---|---|---|
| 0.1 | Vision, règles du jeu, décisions de conception et architecture initiale | TERMINÉ |
| 0.2 | Dépôt, branches dev/staging/main et CI de base | TERMINÉ |

## Phase 1 — socle technique et première carte

| Lot | Contenu | Statut |
|---|---|---|
| 1.1 | Horloge quotidienne depuis 1444, pause, vitesses, état de jeu | TERMINÉ |
| 1.2 | Sauvegarde locale versionnée et validation de l'état | TERMINÉ |
| 1.3 | Modèle GeoJSON mutable, séparation géographie physique/politique, historique des mutations | TERMINÉ (socle, pas de géométrie physique avancée) |
| 1.4 | Projections de base et thèmes cartographiques temporels | TERMINÉ (fonctions de base) |
| 1.5 | Rendu Canvas mondial et import Natural Earth 1:110m : terres, lacs, grands fleuves | TERMINÉ |
| 1.6 | Points d'altitude et zones glaciaires de référence | TERMINÉ (repères, pas un MNT continu) |
| 1.7 | Interface plein écran : temps à gauche, carte dominante au centre, assistant à droite | TERMINÉ (structure UI ; IA non connectée) |
| 1.8 | Revue responsive, navigation, lisibilité, rendu visuel et tests de bout en bout | À FAIRE |

## Phase 2 — géographie et moteur cartographique avancés

| Lot | Contenu | Statut |
|---|---|---|
| 2.1 | Étudier/embarquer un véritable MNT global (ETOPO NOAA), format, résolution, poids, licence et attribution | EN COURS — raster Int16 2160 × 1080 (4,45 Mio), métadonnées et script présents sur `main` et `dev` ; chargement facultatif branché ; validation visuelle navigateur restante |
| 2.2 | Générer un relief ombré crédible à partir de valeurs d'altitude réelles | EN COURS — palette terrestre progressive, hillshade directionnel et premières classes visuelles heuristiques ; validation visuelle à faire |
| 2.3 | Couches de terrain : montagnes, plateaux, plaines, vallées, pentes et bathymétrie | EN COURS — classes visuelles initiales montagnes/plateaux/vallées/collines/plaines ; bathymétrie simplifiée ; données et détails régionaux à développer |
| 2.4 | Biomes : forêts, végétation, déserts, glaces et zones climatiques | À FAIRE |
| 2.5 | Données régionales plus détaillées et niveaux de zoom/LOD | EN COURS — sélecteur 1:110m/1:10m et chargement à la demande intégrés ; asset régional à préparer et couches hydrographiques/labels à décliner |
| 2.6 | Globe manipulable, rotation, clipping géométrique et transition globe → atlas | À FAIRE |
| 2.7 | Navigation cartographique : zoom, déplacement, sélection, infobulles et couches activables | EN COURS — zoom regroupé par image ; panoramique visuel via compositeur pendant le geste puis rendu complet au relâchement ; validation FPS et sélection/couches restantes de territoires et couches à faire |
| 2.8 | Frontières politiques historiques de 1444 et territoires comme couche séparée | À FAIRE |
| 2.9 | Performance : chargement progressif, simplification et rendu adapté au zoom | À FAIRE |

## Phase 3 — monde politique et temps simulé

| Lot | Contenu | Statut |
|---|---|---|
| 3.1 | Modèle des pays, territoires, provinces/régions et institutions | À FAIRE |
| 3.2 | Carte politique, couleurs, frontières, capitales et villes | À FAIRE |
| 3.3 | Calendrier, événements planifiés, files d'événements et chronique | SOCLE PARTIEL ; gameplay À FAIRE |
| 3.4 | Sauvegarde étendue, migrations de versions, robustesse sur longues parties | À FAIRE |
| 3.5 | Paramètres de campagne et mode bac à sable | À FAIRE |

## Phase 4 — populations et sociétés

| Lot | Contenu | Statut |
|---|---|---|
| 4.1 | Groupes de population, croissance et démographie | À FAIRE |
| 4.2 | Cultures, religions, langues, institutions et identités | À FAIRE |
| 4.3 | Migration, urbanisation et mouvements de population | À FAIRE |
| 4.4 | Élites, classes, tensions et évolutions politiques | À FAIRE |
| 4.5 | Sociétés locales autonomes et systèmes de résistance/adaptation | À FAIRE |

## Phase 5 — ressources et économie

| Lot | Contenu | Statut |
|---|---|---|
| 5.1 | Ressources naturelles, gisements et aptitude agricole | À FAIRE |
| 5.2 | Production, consommation, besoins et stocks | À FAIRE |
| 5.3 | Marchés, prix, offre/demande et fiscalité | À FAIRE |
| 5.4 | Commerce, routes, ports, transports et infrastructures | À FAIRE |
| 5.5 | Compagnies commerciales, investissements et influence | À FAIRE |
| 5.6 | Équilibrage économique et tests de simulation | À FAIRE |

## Phase 6 — diplomatie et IA des acteurs

| Lot | Contenu | Statut |
|---|---|---|
| 6.1 | Relations, traités, alliances, garanties et diplomatie | À FAIRE |
| 6.2 | Personnalités, objectifs et priorités des pays/acteurs IA | À FAIRE |
| 6.3 | Décisions IA selon informations connues, sans omniscience | À FAIRE |
| 6.4 | Conflits, défense et guerre comme systèmes de soutien | À FAIRE |
| 6.5 | Émergence d'acteurs, rivalités et coalitions | À FAIRE |

## Phase 7 — exploration, colonisation et autonomie

| Lot | Contenu | Statut |
|---|---|---|
| 7.1 | Expéditions maritimes et terrestres, coûts, risques et logistique | À FAIRE |
| 7.2 | Brouillard de guerre et connaissance géographique par acteur | À FAIRE |
| 7.3 | Comptoirs, établissements, colonies et administrations indirectes | À FAIRE |
| 7.4 | Protectorats, autonomie, fédérations et indépendances | À FAIRE |
| 7.5 | Négociation, échanges, résistance et alliances avec sociétés locales | À FAIRE |
| 7.6 | Émergence d'identités et intérêts propres des colonies | À FAIRE |

## Phase 8 — événements et assistant IA

| Lot | Contenu | Statut |
|---|---|---|
| 8.1 | Système d'événements historiques hybrides et divergents | À FAIRE |
| 8.2 | Éditeur manuel d'événements, aperçu, validation, programmation et annulation | À FAIRE |
| 8.3 | Interface conversationnelle « Le Monde en devenir » | MAQUETTE UI ; logique À FAIRE |
| 8.4 | Schéma structuré de proposition IA et validation stricte par le moteur | À FAIRE |
| 8.5 | Adaptateurs multi-fournisseurs, secrets côté serveur ou fonctionnement manuel sans IA | À FAIRE |
| 8.6 | Chaînes d'événements et conséquences émergentes | À FAIRE |
| 8.7 | Historique, événements récurrents/secrets et outils de modération | À FAIRE |

## Phase 9 — géographie dynamique

| Lot | Contenu | Statut |
|---|---|---|
| 9.1 | Moteur géométrique robuste : union, découpe, intersection et validation topologique | À FAIRE |
| 9.2 | Impacts météoritiques paramétriques : cratère, dégâts et remodelage géographique | À FAIRE |
| 9.3 | Séismes, failles, volcans et création d'îles | À FAIRE |
| 9.4 | Tsunamis, inondations, submersions et variations du niveau marin | À FAIRE |
| 9.5 | Érosion, évolution des fleuves, biomes et climat | À FAIRE |
| 9.6 | Recalcul des territoires, ressources, populations, routes et habitats | À FAIRE |
| 9.7 | Chronologie géologique et tectonique sur des durées plausibles | À FAIRE |

## Phase 10 — technologies, futur et profondeur historique

| Lot | Contenu | Statut |
|---|---|---|
| 10.1 | Technologies et institutions scientifiques évolutives | À FAIRE |
| 10.2 | Industrialisation, transport, énergie, automatisation et informatique | À FAIRE |
| 10.3 | IA, biotechnologies et futurs divergents | À FAIRE |
| 10.4 | Transformations politiques, culturelles et institutionnelles de long terme | À FAIRE |
| 10.5 | Chronique mondiale, archives et synthèses historiques | À FAIRE |

## Phase 11 — finition et robustesse

| Lot | Contenu | Statut |
|---|---|---|
| 11.1 | UX/UI, accessibilité, tutoriel et onboarding | À FAIRE |
| 11.2 | Équilibrage, scénarios de test et simulations longues | À FAIRE |
| 11.3 | Performance, mémoire, sauvegardes volumineuses et compatibilité navigateur | À FAIRE |
| 11.4 | Outils de diagnostic, journalisation et rapports de bugs | SOCLE PARTIEL |
| 11.5 | Validation utilisateur, intégration staging puis publication stable | À FAIRE |

## Prochaine tâche recommandée

Terminer le lot **2.1** : extraire le raster mondial ETOPO 2022 Ice Surface via le téléchargement GeoTIFF NOAA ou l'endpoint ERDDAP 60 secondes (avec décimation contrôlée), normaliser l'ordre des longitudes, exécuter `scripts/build-etopo-overview.sh`, puis vérifier l'en-tête ENVI, la couverture mondiale, les valeurs d'altitude et la taille. Puis intégrer le binaire 10 minutes et tester son chargement hors ligne. Ne pas présenter de relief continu tant que les données NOAA réelles ne sont pas téléchargées et validées.

Après la préparation du MNT, la première navigation 2D est intégrée : zoom jusqu'à 800 %, panoramique par glisser-déposer, zoom à la molette centré sur le pointeur et recentrage. Les labels progressifs sont maintenant intégrés selon le choix C : continents/océans à l'échelle mondiale, villes historiques à partir de 2×, survol et clic pour les coordonnées. Prochaine étape : frontières politiques et noms historiques (sans plaquer les frontières actuelles sur 1444), puis relief ombré réel à partir du raster NOAA et niveaux de détail régionaux. Ne pas passer aux systèmes de gameplay tant que la carte de base n'est pas assez solide pour supporter l'exploration et les territoires.


### Mise à jour du lot 2.1 — 20 novembre 2026
- Le NetCDF NOAA ERDDAP décimé a été reçu et contrôlé (dimensions, coordonnées, unités, valeurs manquantes, plage altimétrique).
- Conversion en grille Int16 little-endian 2 160 × 1 080 terminée ; binaire de 4 665 600 octets.
- La méthode réelle est un échantillonnage par stride 10, pas une moyenne 10×10 : la documentation a été corrigée pour ne pas présenter cette extraction comme une moyenne surfacique.
- Le binaire est désormais présent sur `main` et `dev`, et le renderer le charge facultativement sur `dev`. Première palette hypsométrique et ombrage local intégrés ; validation visuelle navigateur et hillshade plus crédible restent à faire.


### Étape terrain — 20 novembre 2026
- Module de lecture Int16 little-endian, interpolation bilinéaire et rendu hypsométrique ombré ajouté.
- Chargement optionnel du raster au démarrage ; la carte reste fonctionnelle en l'absence du binaire.
- Tests unitaires du parseur, de l'interpolation et de la génération de pixels ajoutés.
- Le binaire a été ajouté à `data/terrain/` sur `main` et `dev`. Le renderer limite le calcul à 1 024 × 512 pixels avant agrandissement et masque la couche sous les projections non prises en charge. Vérification visuelle dans le navigateur encore nécessaire.


### Suite terrain — classes de relief terrestres (20 novembre 2026)
- Ajout d'une classification heuristique locale à partir de l'altitude et des quatre échantillons voisins déjà utilisés par le hillshade : montagnes, plateaux, vallées, collines, plaines et basses terres.
- Teintes discrètes appliquées à la palette terrestre ; aucun pictogramme triangulaire ni couche marine détaillée ajoutés.
- La classification est un traitement visuel du MNT global, pas une donnée géomorphologique scientifique sourcée.
- Les classes ne demandent pas de nouveaux échantillonnages : le coût supplémentaire est limité aux calculs locaux et à une légère modulation RGB.
- Validation visuelle navigateur toujours requise ; les seuils pourront être ajustés après inspection.


### Optimisation navigation — 20 novembre 2026
- Les rafales de `pointermove` et de molette sont coalescées avec `requestAnimationFrame` : au maximum un rendu cartographique est planifié par image.
- Pendant le déplacement, le relief passe temporairement à une grille de rendu 384 × 192 ; à la fin du geste, une image plus détaillée est demandée (plafond 768 × 384).
- Correction de l'échelle du raster ETOPO : le moteur transmet désormais les dimensions logiques CSS du canvas et le raster est composé depuis une surface hors écran quand le navigateur le permet, ce qui évite le décalage lié au facteur DPR.
- Les tests automatisés couvrent les plafonds de qualité adaptative. La mesure réelle des FPS et l'inspection visuelle restent à effectuer dans un navigateur.


### Optimisation zoom — 20 novembre 2026
- La molette utilise une prévisualisation CSS/compositeur ancrée au premier point visé, puis un seul rendu complet après 130 ms sans nouvel événement.
- Les vues identiques ne sont plus redessinées à chaque seconde de simulation : un identifiant de vue (taille, année, zoom, centre) invalide le rendu uniquement si nécessaire.
- Le détail géographique régional demeure limité par les données Natural Earth 1:110m ; un LOD géographique réel demandera l'intégration de jeux de données régionaux adaptés.


### Ajustement de lisibilité et du zoom — 20 novembre 2026
- Relief ETOPO allégé : plafond normal 512 × 256, ombrage et teintes des classes moins contrastés.
- Zoom maximal interactif augmenté de 8× à 24× dans les commandes et les projections 2D.
- Le zoom supplémentaire sert à explorer plus précisément une zone, mais ne remplace pas l'intégration de côtes et frontières à échelle régionale ; le fond vectoriel mondial 1:110m reste sa limite de précision.


### Refonte du relief ETOPO — 20 novembre 2026
- Hillshade renforcé avec exagération verticale par défaut 18× et éclairage nord-ouest dominant ; plage de sortie 0,48–1,52 conservée pour le worker.
- Palette altimétrique progressive vers les roches claires et la neige en altitude, sans seuil neige uniforme à 2 000 m.
- Couleur de base adoucie à 35 % du contraste de hillshade et passe overlay moins agressive.
- Tests unitaires ajoutés ; inspection visuelle réelle à effectuer après mise à disposition de la branche.


## Expérience de démarrage et sélection des nations
- [x] Écran de chargement initial avec étapes fondées sur les ressources prêtes et reprise après erreur.
- [x] Liste recherchable, groupée par région, avec difficulté et classement stratégique heuristique.
- [ ] Vérifier visuellement les régions et noms pour plusieurs années historiques.
- [ ] Affiner la difficulté par scénario après définition des systèmes économiques et militaires.


## Encyclopédie des nations
- [x] Fiche de campagne avec capitale, indicateurs de puissance, situation diplomatique et objectifs de départ.
- [x] Distinguer statistiques contemporaines sourcées et données historiques absentes.
- [ ] Enrichir les capitales et emblèmes avec un référentiel historique daté et sourcé.
- [ ] Remplacer les indices heuristiques par des variables issues des futurs systèmes économiques, démographiques et militaires.
- [ ] Construire de véritables relations diplomatiques dynamiques (alliances, rivalités, tribut, guerres) à partir d'un moteur de simulation.


## Démarrage et préparation locale des cartes — 20 novembre 2026
- [x] Fusionner la fiche stratégique des nations (PR #13) dans `main`.
- [x] Conserver les ressources mondiales (6 GeoJSON + raster ETOPO) dans Cache Storage lors de leur téléchargement.
- [x] Précharger en arrière-plan les quatre couches régionales 1:10m dans IndexedDB pendant le démarrage / la sélection du pays.
- [x] Préparer les index spatiaux et les secteurs voisins au repos, par petites tranches, pour anticiper le premier zoom.
- [x] Animer l'emblème et lisser la progression de l'écran d'ouverture, avec prise en charge de `prefers-reduced-motion`.
- [ ] Mesurer le temps de démarrage, le coût CPU du parsing/indexation et les FPS sur plusieurs navigateurs et machines.
- [ ] Vérifier visuellement le rendu du préchargement régional à partir du zoom 4×.


## Ergonomie de la sélection initiale — 20 novembre 2026
- [x] Réduire l'encombrement vertical de la date et du mode de départ.
- [x] Limiter la hauteur de la liste des nations et de la fiche stratégique avec défilement interne.
- [x] Conserver une disposition compacte sur mobile et petits écrans.
- [ ] Vérifier visuellement sur les résolutions desktop et mobile cibles.


## 20 novembre 2026 — correction du panoramique cartographique
- Le compositeur pouvait demander un rendu vectoriel complet toutes les 250 ms lorsque le bitmap ne couvrait plus l'écran, notamment pendant un déplacement vertical au zoom mondial ×1.
- Le recalcul est maintenant interdit tant que le pointeur est maintenu : le bitmap est déplacé par le compositeur, puis un rendu complet unique est effectué après le relâchement (debounce existant).
- Ajout de tests sur la décision de recalcul pendant et après le geste.
- Cette correction vise les saccades causées par les reconstructions répétées pendant le glisser. Elle ne remplace pas un profilage navigateur des coûts du zoom, du relief et des frontières.


## Priorité absolue — performance de la carte (20 novembre 2026)
- [x] Supprimer le second rendu comparatif automatique qui doublait ponctuellement le coût du premier zoom.
- [x] Ne plus construire les index spatiaux au zoom mondial ; les préparer au repos avant les usages régionaux.
- [x] Différer les rendus complets et les changements de couches pendant le glisser/zoom.
- [x] Réduire le travail du compositeur pendant le glisser en supprimant le recalcul des hitboxes de labels.
- [x] Stabiliser les résolutions des tuiles ETOPO sur trois paliers et borner le cache.
- [x] Éviter le hillshade synchrone sur le thread principal avant la fin du Worker.
- [x] Pré-calculer les constantes lumineuses du Worker hors de sa boucle pixel.
- [x] Remplacer le balayage de toutes les cellules physiques pour chaque ville par un index spatial local.
- [ ] Profiler les couches par temps de rendu et mémoire sur navigateur réel et ordinateur moyen.
- [ ] Si nécessaire, réduire dynamiquement le détail du relief, les frontières administratives et les labels secondaires pendant les interactions.
- [ ] Étudier la séparation des couches statiques et dynamiques en surfaces indépendantes, puis un rendu Worker/OffscreenCanvas pour les couches vectorielles si les mesures le justifient.

Les optimisations de code et les tests automatisés ne remplacent pas une mesure FPS sur le poste du joueur. Les éléments graphiques ne seront retirés qu'après ce profilage, en ciblant les couches réellement responsables.


### Cache des couches et réutilisation des scènes — 20 novembre 2026
- [x] Mettre le fond statique en surface hors écran avec cache LRU borné.
- [x] Dessiner séparément les frontières dynamiques, catastrophes, sélection et étiquettes.
- [x] Réutiliser la même scène lors des micro-déplacements dans une cellule de viewport quantifiée.
- [x] Actualiser les hitboxes après relâchement sans forcer un nouveau rendu vectoriel.
- [ ] Mesurer les gains de temps de rendu et la mémoire consommée sur navigateur réel.
- [ ] Si les couches vectorielles restent le goulot d'étranglement, prototyper leur rendu dans un Worker avec OffscreenCanvas et transfert minimal des données.


### Budgets mémoire — 20 novembre 2026
- [x] Borner le cache des tuiles ETOPO à 64 Mio et 1 600 entrées.
- [x] Borner le cache statique à 48 Mio et trois surfaces par canvas.
- [x] Exposer les octets retenus dans les diagnostics et tester le plafond statique.
- [ ] Vérifier l'utilisation mémoire réelle dans les outils de développement du navigateur sur une session longue.


### Seconde vague LOD / fluidité — 20 novembre 2026
- [x] Réduire la résolution ETOPO à 32/64/96 px selon le zoom et supprimer les passes de relief décoratives à petite échelle.
- [x] Simplifier et filtrer les frontières administratives secondaires ; repousser le niveau régional à 7×.
- [x] Limiter les labels et repères secondaires selon le niveau de zoom.
- [x] Charger séparément les couches régionales au besoin plutôt que précharger les quatre couches au démarrage.
- [ ] Mesurer le temps de rendu par couche et la fluidité réelle du zoom/panoramique sur le navigateur cible ; ajuster les seuils après inspection visuelle.


### Priorité aux interactions — 20 novembre 2026
- [x] Annuler le préchargement spatial au début du déplacement et du zoom.
- [x] Répartir le préchargement par familles de couches sur plusieurs tranches de repos.
- [x] Plafonner le pixel ratio de la scène à 1,25× sur les écrans haute densité.
- [x] Attendre 240 ms de calme avant le rendu vectoriel complet post-interaction.
- [ ] Mesurer les temps de composition et de rendu sur plusieurs densités d'écran et navigateurs.


### Rendu hors thread principal — 20 novembre 2026
- [x] Ajouter un Worker module dédié avec OffscreenCanvas pour le rendu vectoriel complet.
- [x] Conserver les collections et le cache de couches statiques côté Worker entre les rendus.
- [x] Transférer le résultat sous forme d'ImageBitmap et coalescer les demandes concurrentes.
- [x] Préserver un rendu synchrone de secours si OffscreenCanvas ou le Worker est indisponible.
- [ ] Vérifier le rendu visuel sur Chrome, Firefox et Safari ; mesurer latence et fluidité sur machines modestes.
\n\n### Densité des villes — 20 novembre 2026\nLes noms de villes sont plafonnés par niveau de zoom (10, 18, 24 puis 30 labels maximum). À nombre égal, les villes de rang cartographique prioritaire puis les plus peuplées sont affichées en premier. Les continents, pays, provinces et autres repères conservent leur priorité ; les villes non retenues restent dans les données et ne sont pas supprimées du monde ni des interactions.\n

### Hiérarchie des détails secondaires — 20 novembre 2026
L'hydrographie secondaire, les petits lacs, les glaciers et les repères d'altitude suivent désormais un profil LOD progressif. À faible zoom, seuls les cours d'eau et lacs de rang majeur sont dessinés, les glaciers sont masqués et les repères d'altitude sont fortement limités. Le détail augmente aux zooms régionaux puis locaux. Les frontières administratives secondaires sont également masquées plus longtemps et les frontières politiques restent prioritaires. Ces filtres ne suppriment aucune donnée source.


## Préchargement prédictif de l'atlas — réalisé, 20 novembre 2026
- Extension de l'emprise préparée au repos à environ 1,6× le viewport.
- Biais des secteurs préchargés vers la dernière direction de déplacement, avec gestion de l'antiméridien.
- Budget strict de 24 secteurs maximum par collection et réutilisation du cache LRU existant.
- Préchargement interrompu/remplacé dès une nouvelle interaction ; une seule famille est préparée par tranche inactive.
- Les niveaux mondiaux/régionaux restent séparés et les surfaces raster conservent leurs plafonds mémoire existants.
- À valider ensuite : mesures navigateur de latence perçue, mémoire et fluidité sur plusieurs appareils.


## Anticipation du zoom — réalisée, 20 novembre 2026
- Chargement anticipé des labels à ×3,2, terres à ×5,2, rivières à ×7,2 ; seuils d'affichage inchangés à ×4, ×6, ×8.
- En cas de dézoom, emprise préchargée élargie (zoom cible ×0,78).
- Tests dédiés aux seuils de préchauffage et de rendu.


## Navigation et mémoire des zones — réalisée, 20 novembre 2026
- Limite de zoom ×20 (2 000 %) cohérente entre commandes, caméra et projections.
- Cache spatial LRU élargi (256 tuiles, 64 vues) pour retrouver plus vite les secteurs récemment visités.
- Interpolation continue des tailles de labels et réduction des ruptures typographiques.
- Côtes terrestres un peu moins simplifiées aux faibles zooms pour limiter les espaces visuellement trop vides.
- À valider dans le navigateur : fluidité à ×20, mémoire consommée et rendu des petits archipels.


## 21 novembre 2026 — bilan des principes inspirés des moteurs cartographiques grand public

Cette synthèse formalise les principes déjà traduits dans le moteur. Elle ne remplace pas le compte rendu source de l'analyse comparative initiale, qui n'a pas été retrouvé dans les ressources accessibles.

| Principe | Implémentation présente | État réel |
|---|---|---|
| Pyramide multi-échelle | Planificateur de tuiles et niveaux LOD mondiaux/régionaux | Intégré, validation visuelle à poursuivre |
| Raffinement progressif | Affichage des parents puis fondu des enfants | Intégré, raccords visuels à valider |
| Préchargement spatial prédictif | Secteurs voisins, direction du pan, zooms anticipés | Intégré, réglage matériel à poursuivre |
| Cache et persistance | LRU mémoire, IndexedDB pour les tuiles physiques modifiées | Intégré, mémoire réelle longue durée à mesurer |
| Séparation des familles | Physique, politique/historique, dynamique | Architecture intégrée, indépendance complète des pipelines non achevée |
| Rendu GPU | Relief tuilé WebGL et renderer géographique WebGL avec fallbacks Canvas | Partiel, bandes visuelles à diagnostiquer |
| Généralisation par échelle | Simplification GeoJSON et filtres par rang/zoom | Intégrée, contrôle visuel nécessaire |
| Calculs asynchrones | Worker de préchargement et Worker LOD persistant | Partiel ; les métriques LOD nulles au zoom 3–5 restent à expliquer |
| Labels adaptatifs | Plafonds par zoom et priorités de catégories | Partiel ; collision/placement global à approfondir |
| Adaptation aux appareils | Pixel ratio plafonné et budgets de caches | Partiel ; profils adaptatifs CPU/GPU non généralisés |

### Écarts prioritaires
- [ ] Corriger et tester les lignes persistantes observées pendant et après le panoramique ; vérifier halos, coordonnées UV, limites de l'atlas et raccords entre rangées de tuiles.
- [ ] Instrumenter le cycle de vie du préchauffage LOD (planifié, annulé, démarré, terminé) pour expliquer les compteurs nuls aux zooms 3–5.
- [ ] Terminer la séparation des pipelines physiques, politiques et dynamiques sans transférer d'objets vivants (store de tuiles, contexte WebGL) par structured clone.
- [ ] Compléter le placement des labels : priorité, collision, stabilité pendant le pan et transitions entre niveaux.
- [ ] Définir des profils de qualité selon résolution, DPR, mémoire et capacités WebGL, puis les valider sur PC et mobile.
- [ ] Réaliser la validation visuelle et les mesures longues avant de sortir la PR #46 du brouillon.

Les tests automatisés prouvent les invariants du code, pas l'absence d'artefacts visuels sur le matériel réel. Les lignes signalées par le joueur restent donc un défaut ouvert jusqu'à reproduction et correction confirmée.


## Cadrage du viewport et diagnostics LOD — 21 novembre 2026

- [x] Centraliser le calcul d'un rectangle de carte au ratio géographique 2:1, contenu dans les dimensions réelles du cadre (`fitMapFrame`).
- [x] Synchroniser les dimensions CSS du canvas visible avec les dimensions utilisées par la composition interne, afin que `width: 100%` ne puisse plus étirer le canvas au-delà de la hauteur disponible.
- [x] Ajouter des tests de cadrage sur des conteneurs paysage, carrés et portrait ; les pôles doivent rester dans le cadre.
- [x] Ajouter des compteurs de cycle de vie LOD (planifié, démarré, terminé, généré, annulé, échoué) pour distinguer une tâche simplement programmée d'un Worker réellement exécuté.
- [x] Ajouter les métriques correspondantes à l'export benchmark et leurs tests.
- [ ] Exécuter la CI sur le dernier commit et confirmer le résultat.
- [ ] Vérifier le cadrage sur le navigateur Live Preview, en grand écran et fenêtre réduite.
- [ ] Identifier et corriger les lignes persistantes du relief avec une reproduction et un test de continuité des tuiles ; aucun correctif visuel n'est encore revendiqué.
- [ ] Continuer le découplage des couches et les optimisations GPU après validation du cadrage et diagnostic des artefacts.

**Attention :** le cadrage 2:1 garantit que la carte complète tient dans le rectangle calculé par le moteur. La validation visuelle dans le navigateur reste nécessaire, notamment après redimensionnement de la fenêtre.


## 21 novembre 2026 — lot d'optimisations moteur (PR #46)

### Rendu du relief et continuité des tuiles
- [x] Correction du filtrage des altitudes encodées sur 16 bits dans l'atlas WebGL : le sampler utilise désormais `NEAREST`, chaque échantillon est décodé avant interpolation bilinéaire.
- [x] Aligner les UV sur les centres des texels et borner les lectures aux centres du halo périphérique.
- [x] Ajouter des tests sur le décodage avant interpolation, les centres UV, le halo et le mode de filtrage.
- [ ] Valider visuellement sur Live Preview que les lignes horizontales persistantes ont disparu ; le correctif cible une cause technique avérée dans le chemin d'échantillonnage, mais l'absence d'artefact reste à confirmer sur navigateur.

### Cycle de vie LOD
- [x] Ne plus déclencher un nouveau rendu au milieu de la chaîne de préchauffage : les niveaux courant et adjacent sont d'abord traités, puis le rendu est invalidé une seule fois.
- [x] Distinguer les tâches planifiées, démarrées, terminées, générées, annulées et échouées.
- [ ] Refaire une mesure dédiée entre les zooms 3 et 5 et confirmer les transferts de collection et jobs Worker.

### Séparation des familles de rendu
- [x] Exposer des durées agrégées distinctes pour les familles physique, politique et dynamique.
- [x] Inclure les passes WebGL de frontières et de détails dans les durées mesurées, pas seulement les fallbacks Canvas.
- [ ] Poursuivre l'extraction des surfaces indépendantes sans cloner les services vivants (store et contexte WebGL).

### Mémoire et transferts GPU
- [x] Réutiliser un VBO terrain à capacité croissante plutôt que réallouer son stockage à chaque passe ; transférer les sommets avec `bufferSubData`.
- [x] Exporter capacité, volume transféré et nombre d'allocations dans les benchmarks.
- [ ] Comparer les nouvelles mesures sur PC et Pixel 10 avant de modifier les budgets d'atlas ou de caches.

### Labels et qualité adaptative
- [x] Départager les labels de même priorité de façon déterministe, y compris les villes de population équivalente.
- [x] Adapter le ratio de pixels, la qualité du relief et la densité des labels aux capacités déclarées du navigateur/appareil.
- [x] Ajouter des tests aux profils bas, équilibré et élevé.
- [ ] Vérifier visuellement la stabilité des labels et calibrer les profils sur les mesures réelles, sans déduire la mémoire GPU native à partir des seuls tableaux CPU.

### Validation technique
- [x] CI GitHub Actions verte sur le lot initial d'optimisations.
- [ ] Confirmer la CI du dernier commit après les tests complémentaires.
- [ ] Validation visuelle utilisateur obligatoire avant de sortir la PR #46 du brouillon.


## Point d'étape et priorités de reprise — 24 novembre 2026

Ce point sert de repère durable pour les prochaines sessions de développement.

### État validé
- Socle technique, optimisations de simulation/rendu et principaux correctifs cartographiques : validés par les tests du joueur.
- Carte mondiale et préparation de campagne : structure fonctionnelle avancée, sélection des nations, fiche stratégique, choix Stratégie/Sandbox et séquence de lancement intégrés.
- Francisation des noms de pays : largement avancée ; les identifiants internes restent inchangés.
- Insignes : affichage des drapeaux/blasons et masquage après échec des deux sources corrigés ; le dernier correctif a été confirmé par le joueur.
- Les validations locales et visuelles restent à effectuer par le joueur après chaque lot ; les tests automatisés ne valent pas validation visuelle.
- PR #46 reste en brouillon et ne doit pas être fusionnée sans accord explicite.

### Ordre prioritaire de reprise
1. **Fiabilisation de la préparation de campagne** : sources d'insignes réellement disponibles, sélection, fiche pays, dates, accessibilité et états vides.
2. **Finition fonctionnelle de la campagne** : cohérence des données affichées, navigation clavier, responsive et robustesse des interactions.
3. **Refonte artistique de la carte et de l'interface** : matériaux riches et tactiles, textures organiques, contraste maîtrisé, six identités historiques distinctes.
4. **HUD en partie** : chronologie, panneaux d'information, événements et contrôles de simulation.
5. **Systèmes de grande stratégie** : populations, ressources, économie, diplomatie, IA, exploration et conflits.
6. **Simulation historique** : événements, conséquences systémiques, monde divergent et outils d'édition.
7. **Stabilité et diffusion** : sauvegardes longues, compatibilité, performances mesurées, accessibilité et préparation de version.

### Contraintes de réalisation
- Avancer par lots d'environ dix améliorations cohérentes, avec tests de non-régression.
- Après chaque lot, attendre le retour « tests ok » avant de poursuivre.
- Ne pas modifier l'interpolation temporelle ni les règles historiques pendant les chantiers purement visuels.
- La refonte artistique doit éviter les interfaces trop claires, trop sobres ou saturées de filets et de lignes décoratives : privilégier des matériaux crédibles, une hiérarchie nette et des détails utiles.
- Ne pas annoncer de validation locale, de FPS ou de résultat visuel qui n'a pas été mesuré sur l'environnement du joueur.


### Lot prioritaire 1 — fiabilisation des insignes de campagne (24 novembre 2026)
- [x] Valider les codes de drapeaux contre une liste explicite de codes ISO et l'exception FlagCDN `gb-sct`.
- [x] Ignorer les placeholders et codes réservés, sans fabriquer d'URL d'image.
- [x] Continuer à chercher un autre champ ISO si le premier est invalide.
- [x] Valider également les codes issus des alias historiques.
- [x] Retourner un état explicite `none` lorsqu'aucune image n'est déterminable.
- [x] Garantir une URL et un texte alternatif vides pour cet état.
- [x] Conserver le repli blason → drapeau sur une seule tentative, puis masquer l'image si tout échoue.
- [x] Ajouter `referrerPolicy="no-referrer"` aux images distantes de la liste et de la fiche.
- [x] Étendre les tests aux placeholders, codes valides, alias régional et champs de repli.
- [x] Documenter les règles de disponibilité et les limites des fournisseurs externes.
- [x] Validation locale du joueur : `npm test` confirmé ; le contrôle visuel des cas d’insigne reste à faire séparément.


### Lot prioritaire 2 — cohérence fonctionnelle de la sélection de campagne (24 novembre 2026)
- [x] Refuser les clés de nation absentes du catalogue sans altérer la sélection.
- [x] Synchroniser les sélecteurs de nation de préparation et de sandbox via un contrôleur commun.
- [x] Effacer une éventuelle erreur de validation après une sélection valide.
- [x] Maintenir le dossier stratégique, le titre cartographique et les sélecteurs cohérents.
- [x] Restaurer le focus sur la nation choisie après une activation clavier.
- [x] Appliquer une navigation de liste à tabulation unique avec flèches, Début et Fin.
- [x] Faire circuler la navigation clavier en haut et en bas de la liste.
- [x] Annoncer le nombre de résultats et rendre l'état vide perceptible aux lecteurs d'écran.
- [x] Actualiser les insignes historiques lorsque la nouvelle date est validée, sans reconstruire toute la liste à chaque mouvement du curseur.
- [x] Annoncer l'année initiale et l'année courante du curseur, et signaler vocalement la nation sélectionnée.
- [x] Validation locale du joueur : `npm test`, puis contrôle clavier (Tab, flèches, Début/Fin, Entrée) et changement de nation en sandbox.


### Lot prioritaire 3 — finition responsive et robustesse de la campagne (24 novembre 2026)
- [x] Empêcher les débordements horizontaux dans les panneaux, listes, noms et métadonnées de nations.
- [x] Isoler le défilement du panneau et des dossiers pour éviter la propagation involontaire.
- [x] Garantir que les champs de recherche et filtres rétrécissent dans les petits conteneurs.
- [x] Conserver une cible tactile confortable pour le lancement.
- [x] Renforcer l'indication de focus clavier dans la fiche.
- [x] Adapter la fiche et la frise aux largeurs intermédiaires (761–1100 px).
- [x] Compacter la préparation sur les écrans desktop de faible hauteur.
- [x] Respecter les zones sûres mobiles et borner la hauteur du panneau.
- [x] Prévoir un agencement distinct pour les téléphones en paysage.
- [x] Traiter les très petits écrans et respecter la préférence de mouvement réduit.
- [x] Validation locale du joueur : `npm test` et contrôle visuel confirmés.


### Lot prioritaire 4 — direction artistique de l'atlas et cadres des six ères (24 novembre 2026)
- [x] Donner au titre de carte une signature éditoriale avec filet lumineux adapté à l'accent d'époque.
- [x] Renforcer le fond atmosphérique du cadre sans toucher au rendu géographique.
- [x] Ajouter un grain de surface décoratif, limité au cadre et non interactif.
- [x] Confiner les ornements de l'overlay à leur zone de carte.
- [x] Donner de la profondeur à la rose des vents et à ses repères.
- [x] Structurer la légende par une séparation matérielle cohérente.
- [x] Unifier les commandes cartographiques en instrument tactile.
- [x] Distinguer l'encadrement portulan des ères Exploration et Westphalie.
- [x] Différencier les cadres Révolution et Ère industrielle.
- [x] Créer des signatures contemporaines et futuristes sans éclaircir excessivement la carte.
- [x] Adapter les outils de carte aux petits écrans.
- [x] Respecter la préférence de mouvement réduit.
- [x] Validation locale du joueur : `npm test` et contrôle visuel des six ères confirmés.

## Lot prioritaire 5 — matières de surface et profondeur de l'atlas (24 novembre 2026)
- [x] Renforcer la profondeur du cadre par un vignettage doux et une lumière rasante, sans modifier le canvas.
- [x] Isoler les textures dans l'overlay décoratif non interactif.
- [x] Appliquer un parchemin fibrosé à l'ère des explorations.
- [x] Appliquer une matière vélin à l'ère de Westphalie.
- [x] Ajouter le grain de presse et une trame de points discrète à l'ère révolutionnaire.
- [x] Ajouter une texture militaire et des courbes topographiques à l'ère industrielle.
- [x] Appliquer un verre fumé au présent.
- [x] Appliquer une matière obsidienne et une trame HUD au futur.
- [x] Maintenir les repères cartographiques au-dessus des textures et préserver leur lisibilité.
- [x] Atténuer les matières sur mobile et respecter le mouvement réduit.
- [x] Ajouter des tests de non-régression dédiés aux six traitements matériels.
- [x] Validation locale du joueur : `npm test` et contrôle visuel des six textures et du relief topographique confirmés.
## Lot prioritaire 6 — profondeur des océans et lecture des côtes (24 novembre 2026)
- [x] Ajouter un dégradé radial de profondeur aux océans, sans éclaircir excessivement la surface.
- [x] Conserver le rendu océanique de chaque thème comme couleur de base.
- [x] Ajouter un liseré côtier très discret pour détacher les continents de la mer.
- [x] Maintenir le trait de côte distinct des frontières politiques.
- [x] Réutiliser les profils de simplification et les chemins géographiques déjà calculés.
- [x] Garder l'Antarctique hors du liseré côtier terrestre standard.
- [x] Ne modifier ni les données géographiques, ni les projections, ni les règles de simulation.
- [x] Conserver le rendu Canvas existant lorsque le dégradé radial n'est pas disponible.
- [x] Ajouter des tests pour la profondeur océanique et le liseré côtier.
- [x] Validation locale du joueur : `npm test`, puis contrôle visuel des océans et des côtes à plusieurs niveaux de zoom.



## Lot prioritaire 7 — relief terrestre et chaînes montagneuses (24 novembre 2026)
- [x] Élargir avec prudence la détection des chaînes de moyenne altitude à partir de la pente et de l'altitude combinées.
- [x] Renforcer la signature minérale des montagnes sans blanchir les sommets ni modifier les océans.
- [x] Faire progresser la teinte des reliefs montagneux avec l'altitude, sans aplat uniforme.
- [x] Distinguer davantage les montagnes, plateaux, vallées, collines et plaines dans la palette existante.
- [x] Préserver les données ETOPO sources et le calcul du hillshade.
- [x] Conserver la modulation de palette dans le chemin raster tuilé et le fallback Canvas.
- [x] Ne pas ajouter de tracés de chaînes artificiels ni de lignes décoratives supplémentaires.
- [x] Ajouter des tests sur les seuils montagneux, les teintes par altitude et l'absence de mutation de la palette source.
- [x] Validation locale du joueur : `npm test` confirmé.


## Chantier transversal — carte stratégique sans subdivisions administratives (24 novembre 2026)
- [x] Ne plus télécharger les frontières administratives mondiales 1:110m ni régionales 1:10m lors de l'initialisation de la carte.
- [x] Ne plus télécharger les polygones destinés aux noms de provinces et régions pour le rendu stratégique.
- [x] Ne plus générer d'étiquettes de provinces/régions sur la carte stratégique.
- [x] Retirer les tracés administratifs du chemin Canvas et du chemin WebGL.
- [x] Conserver les frontières nationales et les territoires politiques historiques.
- [x] Garder les fonctions et données de chargement administratives disponibles pour une éventuelle carte régionale dédiée.
- [x] Ajouter des tests garantissant zéro trait administratif et zéro label infranational sur la carte stratégique.
- [x] Validation locale : `npm test` et contrôle visuel à faible et fort zoom, en particulier Europe occidentale et France, confirmés par le joueur.

---

## Lot prioritaire 8 — signatures climatiques et végétales du relief (24 novembre 2026)
- [x] Ajouter une classification latitudinale prudente des grandes zones de végétation.
- [x] Distinguer les bandes tropicale, subtropicale, tempérée, boréale et toundra.
- [x] Distinguer les domaines alpins et nival par l'altitude, sans blanchir uniformément les montagnes.
- [x] Exclure les océans et les coordonnées invalides de la classification végétale.
- [x] Appliquer une modulation colorimétrique discrète, sans remplacer l'hypsométrie ni le hillshade.
- [x] Préserver intégralement la palette bathymétrique.
- [x] Intégrer la signature végétale dans le rendu raster tuilé et le fallback raster compact.
- [x] Préserver les altérations physiques, la neige d'altitude et le mode diagnostic.
- [x] Ajouter des tests sur les seuils latitudinaux, l'altitude, les couleurs, la non-mutation et les océans.
- [x] Documenter la limite des données : sans couche de précipitations ou d'occupation des sols, ces teintes sont un proxy climatique régional et non une carte scientifique des forêts, savanes ou déserts.
- [x] Validation locale du joueur : npm test confirmé.

---

## Lot prioritaire 9 — hiérarchie visuelle du réseau hydrographique (24 novembre 2026)
- [x] Introduire un style de cours d'eau dérivé du rang hydrographique Natural Earth.
- [x] Renforcer la largeur des grands fleuves par rapport aux cours d'eau secondaires.
- [x] Réduire progressivement l'opacité des rangs moins importants.
- [x] Garder les rangs absents sur un style secondaire stable et visible.
- [x] Reconnaître les variantes de propriétés `SCALERANK` et `min_zoom`.
- [x] Arrondir les extrémités et jonctions du rendu Canvas pour une lecture plus organique.
- [x] Appliquer la hiérarchie dans le chemin Canvas de repli.
- [x] Répartir les cours d'eau WebGL par rang avec largeur et alpha cohérents.
- [x] Conserver les filtres de sélection, les plafonds de détails et le comptage des segments existants.
- [x] Ajouter des tests sur l'ordre visuel, les alias, les rangs manquants et les largeurs invalides.
- [x] Validation locale du joueur : npm test confirmé.



## Lot prioritaire 10 — hiérarchie visuelle des lacs (24 novembre 2026)
- [x] Définir un profil de remplissage et de contour selon le rang cartographique du lac.
- [x] Donner la priorité visuelle aux grands lacs sans uniformiser les plans d’eau secondaires.
- [x] Reconnaître les variantes de propriétés de rang déjà présentes dans les données.
- [x] Garder un style stable et lisible pour les rangs absents.
- [x] Appliquer les niveaux d’opacité aux remplissages WebGL par groupes de rang.
- [x] Appliquer les niveaux de contour au rendu Canvas de complément.
- [x] Préserver le chemin de repli Canvas lorsque WebGL géographique est indisponible.
- [x] Réutiliser la simplification côtière et les plafonds de détails existants.
- [x] Ajouter des tests sur l’ordre de remplissage, de contour, les alias et les rangs absents.
- [x] Validation locale du joueur : npm test et contrôle visuel des grands lacs et plans d’eau secondaires confirmés.

 
## Lot prioritaire 11 — lecture de la cryosphère et hiérarchie des glaciers (24 novembre 2026)
- [x] Définir un profil de remplissage et de contour pour les glaciers selon leur rang cartographique.
- [x] Mettre en avant les principaux ensembles glaciaires sans uniformiser toutes les surfaces.
- [x] Reconnaître les alias de rang présents dans les propriétés Natural Earth.
- [x] Appliquer des contours plus nets aux ensembles majeurs et plus discrets aux glaciers secondaires.
- [x] Regrouper les remplissages WebGL par rang pour éviter un style uniforme.
- [x] Appliquer la hiérarchie au rendu Canvas de complément et au repli intégral.
- [x] Conserver la teinte froide des glaces sans introduire de blanc éblouissant.
- [x] Préserver le filtrage de détail et l’exclusion de l’Antarctique.
- [x] Ajouter des tests sur les rangs, alias et propriétés absentes.
- [x] Validation locale du joueur : npm test et contrôle visuel des glaciers alpins, groenlandais et des hautes latitudes à plusieurs niveaux de zoom confirmés.

## Lot prioritaire 12 — optimisation du masque terrestre au zoom rapproché (24 novembre 2026)

- [x] Mémoriser la classification Antarctique/non-Antarctique par identité de feature.
- [x] Éviter les nouveaux parcours de coordonnées pour les géométries déjà classées.
- [x] Mettre en cache la séparation des terres côtières et de l'Antarctique par tableau de features.
- [x] Réutiliser l'ensemble des terres côtières pour les tests d'appartenance.
- [x] Mémoriser la classification des remplissages terrestres WebGL par renderer et collection.
- [x] Mémoriser séparément la compatibilité des contours WebGL.
- [x] Inclure les options de diagnostic dans la clé de classification pour éviter les caches incohérents.
- [x] Préserver explicitement l'exclusion de l'Antarctique dans le masque Canvas de repli sans Path2D.
- [x] Exporter les compteurs de hits, misses et coordonnées parcourues dans les benchmarks.
- [x] Ajouter des tests de réutilisation, d'invalidation par options et d'exclusion antarctique.
- [ ] Validation locale du joueur : npm test et contrôle visuel du masque terrestre, des côtes et de l'Antarctique à zoom 1, 5 et 20.
- [ ] Nouveau benchmark PC zoom 20, cache chaud, 60 à 70 secondes ; comparer surtout `land-mask-path`, `land-feature-classification`, médiane et p95.

**Précaution :** les caches s'appuient sur l'immuabilité des features GeoJSON et des tableaux de features. Si une collection est modifiée en place, elle doit être remplacée par une nouvelle collection afin de déclencher une nouvelle classification. Aucun gain chiffré n'est revendiqué avant le prochain benchmark local.


## Lot prioritaire 13 — cohérence du cache géométrique au zoom rapproché (24 novembre 2026)
- [x] Centraliser le profil de projection utilisé pour les clés des chemins et des masques composés.
- [x] Construire les clés selon les paramètres de projection réellement effectifs, sans invalider sur un drapeau de longitude neutralisé par le projecteur.
- [x] Conserver la précision effective du zoom dans les clés pour éviter les collisions dues à l'arrondi à quatre décimales.
- [x] Réutiliser le même profil de vue pour construire le masque composé et ses chemins enfants.
- [x] Réduire les tableaux temporaires du parcours des géométries polygonales et linéaires.
- [x] Ajouter des compteurs de constructions et d'évictions pour les deux niveaux de cache.
- [x] Exporter ces compteurs dans le collecteur de benchmark.
- [x] Ajouter des tests de non-régression sur les variations de projection et les nouvelles métriques.
- [x] CI GitHub Actions sur le code du lot : 501 tests réussis, 0 échec (run 45358956818 ; les commits suivants de cette séquence ne modifient que la documentation).
- [ ] Validation locale du joueur : npm test et contrôle visuel du masque, des côtes et de l'Antarctique aux zooms 1, 5 et 20.
- [ ] Nouveau benchmark PC zoom 20, cache chaud, 60 à 70 secondes ; comparer médiane/p95, reconstructions, évictions et pics mémoire.

Précaution : le centre reste volontairement quantifié à une cellule de 1 / zoom degré. Les nouvelles clés éliminent les collisions de paramètres non équivalents, mais ne suppriment pas ce compromis de quantification déjà présent. Les compteurs de construction et d'éviction sont cumulatifs depuis l'initialisation du module.

## Lot 22 — robustesse des collisions de labels (24 novembre 2026)
- [x] Extraire une fonction publique et testable de chevauchement entre deux emprises.
- [x] Valider les coordonnées et l'ordre des limites avant le calcul.
- [x] Définir le contact exact entre deux boîtes comme collision afin d'éviter les glyphes accolés.
- [x] Réutiliser cette règle dans le placement des labels sans changer leur ordre de priorité.
- [x] Ajouter des tests sur chevauchement, séparation, contact et emprises invalides.
- [ ] Validation locale : `npm test` et contrôle visuel aux zooms 1, 3, 5 et 10.
- [ ] CI GitHub Actions du lot à confirmer.

## Lot 23 — placement sûr des labels en bord de carte (24 novembre 2026)
- [x] Ajouter un ajustement géométrique des labels dans les marges sûres du viewport.
- [x] Déplacer ensemble le texte, le marqueur et les emprises de collision/interaction.
- [x] Prendre en compte les zones interactives, pas seulement les glyphes visibles.
- [x] Écarter proprement les labels dont l'emprise ne peut pas tenir dans le viewport.
- [x] Préserver exactement le placement des labels déjà dans la zone sûre.
- [x] Ajouter des tests de bord gauche, bord inférieur, dimensions excessives et emprises interactives.
- [ ] Validation locale : `npm test` et contrôle visuel aux quatre bords de la carte, en particulier sur petits écrans.
- [ ] CI GitHub Actions du lot à confirmer.

