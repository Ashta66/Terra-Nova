# Moteur géophysique et conséquences humaines

## Architecture
TERRA NOVA sépare quatre couches :
1. Géométrie de référence : polygones GeoJSON et transformations explicites.
2. État physique : cellules géoréférencées, altitude, distance à la côte, dégâts, submersion, cendres et habitabilité.
3. Société : population, déplacements, mortalité simulée, infrastructures, sécurité alimentaire, stabilité et reconstruction.
4. Politique : contrôleurs, revendications, influence et événements historiques. Une catastrophe ne transfère jamais automatiquement la souveraineté.

## Événements pris en charge
- Impact météoritique : cratère, choc et perte d'habitabilité.
- Séisme : dégâts et déplacement tectonique optionnel.
- Éruption volcanique : cendres, coulées de lave et modification locale d'altitude.
- Tsunami : exposition côtière atténuée par la distance et dégâts.
- Montée du niveau marin : submersion durable des cellules sous le niveau simulé.
- Soulèvement tectonique : modification d'altitude.

Les calculs sont déterministes, datés et rejouables. La grille est une couche de simulation légère ; elle ne remplace pas les polygones détaillés Natural Earth ni une simulation hydrodynamique ou tectonique scientifique.

## Chaîne de conséquences
advanceWorldSimulation applique successivement l'événement physique, les conséquences humaines, la planification IA, puis les premières mesures de reconstruction, aide, évacuation ou réinstallation. Les réponses IA sont pour l'instant des règles déterministes et transparentes, pas un modèle génératif. Les transferts de souveraineté restent des événements politiques explicites et sourcés.

## Données requises pour l'échelle mondiale
La première grille est maintenant initialisée depuis ETOPO à environ 2° par cellule (pas de 12 pixels sur le raster 10 minutes), avec altitude, distance côtière approchée et identifiant de tuile géographique stable. Elle devra être affinée localement et enrichie avec population, infrastructures et provenance des données. La résolution sera adaptative : grossière à l'échelle mondiale, plus fine autour des événements et zones habitées.

## Supabase
Aucune dépendance Supabase n'est nécessaire pour les calculs. À terme, utiliser Supabase pour comptes, sauvegardes, synchronisation et partage de scénarios ; conserver les calculs dans le moteur local.
