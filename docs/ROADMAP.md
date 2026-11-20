\n\n## 20 novembre 2026 — réduction du coût de l'hydrographie lacustre\n- La carte ne dessine désormais que les 12 plus grands lacs de rang 0 ou 1 parmi les entités visibles, à tous les niveaux de zoom.\n- Les lacs secondaires ne réapparaissent plus au zoom rapproché ; les grands bassins sont prioritaires selon leur rang Natural Earth puis leur emprise géographique corrigée par la latitude.\n- Le filtrage intervient avant la construction des chemins Canvas/Path2D, ce qui évite de simplifier et dessiner inutilement des centaines de contours régionaux. Les données sources restent intactes.\n- Tests ajoutés sur le plafond, le rang, le classement par taille et les géométries admissibles.\n## Harmonisation des rives intérieures — 20 novembre 2026
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
