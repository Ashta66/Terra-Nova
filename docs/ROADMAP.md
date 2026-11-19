# TERRA NOVA — feuille de route de développement

> Source de vérité sur l'ordre des lots et leur état. Les statuts doivent refléter le code réellement présent, pas les intentions.

Légende :
- **TERMINÉ** : code intégré sur la branche indiquée et tests vérifiés.
- **EN COURS** : développement commencé, périmètre incomplet.
- **À FAIRE** : non implémenté.
- **À VALIDER** : dépend d'un choix ou d'un test de gameplay.

## État synthétique au 19 novembre 2026

- Branche de travail : `dev`
- Stable : `main` contient les fondations initiales du lot 1, fusionnées par PR #2.
- PR #1 : brouillon de développement `dev` vers `staging`, à ne pas fusionner automatiquement.
- Interface plein écran trois colonnes : intégrée sur `dev`.
- Dernières vérifications GitHub Actions de l'interface : réussies (run 44630008505).
- Le développement cartographique n'est pas encore fusionné dans `main`.

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
| 2.1 | Étudier/embarquer un véritable MNT global (ETOPO NOAA), format, résolution, poids, licence et attribution | EN COURS — source, licence et format d'aperçu choisis ; script GDAL ajouté ; endpoint NOAA ERDDAP global 60s identifié pour extraction décimée ; téléchargement et validation du raster encore à faire |
| 2.2 | Générer un relief ombré crédible à partir de valeurs d'altitude réelles | À FAIRE |
| 2.3 | Couches de terrain : montagnes, plateaux, plaines, vallées, pentes et bathymétrie | À FAIRE |
| 2.4 | Biomes : forêts, végétation, déserts, glaces et zones climatiques | À FAIRE |
| 2.5 | Données régionales plus détaillées et niveaux de zoom/LOD | À FAIRE |
| 2.6 | Globe manipulable, rotation, clipping géométrique et transition globe → atlas | À FAIRE |
| 2.7 | Navigation cartographique : zoom, déplacement, sélection, infobulles et couches activables | EN COURS — zoom, panoramique, labels progressifs, survol et clic intégrés ; sélection de territoires et couches à faire |
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
