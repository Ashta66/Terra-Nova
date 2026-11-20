# Moteur de souveraineté historique

Le moteur politique est volontairement indépendant de `src/world/geography.js`.
La géographie porte les polygones, les découpages et les transformations physiques.
La souveraineté ne stocke que des références stables `regionId`, des pays et une
chronologie d'événements. Une guerre ou un traité peut donc transférer un contrôle
sans modifier la géométrie ; un impact ou une évolution physique peut modifier la
géographie sans réécrire les revendications politiques.

## Quatre statuts

- `sovereign` : contrôle étatique reconnu dans le modèle.
- `contested` : revendications concurrentes ; le contrôleur effectif peut rester indiqué.
- `influence` : zone d'influence non assimilée à une annexion.
- `unclaimed` : aucun contrôleur étatique enregistré. Cela ne signifie jamais que la région est inhabitée.

Les quatre statuts gardent une couleur de pays lorsque cette identité existe. Le moteur
fournit opacité, saturation, couleurs des revendiquants et intensité d'influence au
rendu ; il ne dessine pas directement la carte.

## Chronologie événementielle

Les événements datés sont rejoués depuis l'état de référence pour produire l'état à
une année donnée. Les événements sont indépendants de la géométrie et peuvent être
ajoutés dans le désordre : le moteur les trie chronologiquement. Types initiaux :
transfert de contrôle, revendication ajoutée/retirée, changement de statut,
installation/retrait d'une influence.

Chaque événement doit référencer une région et des pays connus. Les événements
doivent porter une cause et une source historique dans les données de production ;
le moteur n'invente pas de transfert à partir d'un simple changement de couleur.

## Limite actuelle des données

Ce commit livre le modèle et le moteur de simulation, pas une base mondiale complète
et vérifiée de souveraineté année par année. Les instantanés cartographiques historiques
existants restent des sources de référence à convertir en états initiaux avec une
provenance et un niveau de confiance. Les intervalles entre instantanés ne doivent pas
être présentés comme des frontières exactes sans événements documentés.
