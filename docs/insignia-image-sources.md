# Sources des drapeaux et armoiries

Les drapeaux contemporains sont servis sous forme d'images PNG par FlagCDN, à partir des codes ISO 3166-1 alpha-2.

Les armoiries historiques sont des fichiers originaux référencés sur Wikimedia Commons. Leurs pages de description font foi pour les auteurs, dates, licences et éventuelles restrictions d'usage des insignes.

| Entité | Fichier utilisé | Référence |
|---|---|---|
| Royaume de France (jusqu’en 1792 ; restauration 1814–1830) | Arms of the Kingdom of France (Ancien).svg | https://commons.wikimedia.org/wiki/File:Arms_of_the_Kingdom_of_France_(Ancien).svg |
| Angleterre (1399–1603) | Royal Arms of England (1399-1603).svg | https://commons.wikimedia.org/wiki/File:Royal_Arms_of_England_(1399-1603).svg |
| Castille | Blason Castille.svg | https://commons.wikimedia.org/wiki/File:Blason_Castille.svg |
| Espagne (1504–1700) | Lesser Royal Arms of the Spanish Monarch | https://commons.wikimedia.org/wiki/Category:SVG_historical_coats_of_arms_of_Spain |
| Venise (1595–1797) | Coat of arms of Republic of Venice.svg | https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_Republic_of_Venice.svg |
| Japon | Imperial Seal of Japan.svg | https://commons.wikimedia.org/wiki/Category:SVG_imperial_crest_of_Japan |
| Pologne | COA Kingdom of Poland with crest.svg | https://commons.wikimedia.org/wiki/File:COA_Kingdom_of_Poland_with_crest.svg |
| Portugal (modèle héraldique de 1763) | Coat of arms of the Kingdom of Portugal (Enciclopedie Diderot).svg | https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_the_Kingdom_of_Portugal_(Enciclopedie_Diderot).svg |
| Empire ottoman (fin XIXe–1922) | Osmanli-nisani.svg | https://commons.wikimedia.org/wiki/File:OttomanCoatOfArms.png |
| Empire russe (1721–1917) | Coat of arms of the Russian Empire.svg | https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_the_Russian_Empire.svg |
| Saint-Empire (après 1433) | Generic Arms of the Holy Roman Emperor (after 1433).svg | https://commons.wikimedia.org/wiki/File:Generic_Arms_of_the_Holy_Roman_Emperor_(after_1433).svg |

Les dates de validité sont appliquées par le résolveur lorsque l’entité et la période sont identifiables. Les drapeaux FlagCDN sont des drapeaux nationaux actuels, pas des reconstitutions de pavillons historiques. En l’absence d’un blason historique référencé, le moteur affiche le drapeau-image associé au code ISO disponible plutôt que de fabriquer un emblème.


## Politique de disponibilité des insignes

- Les codes d'image sont validés contre une liste de codes pays ISO 3166-1 alpha-2 connus, avec l'exception régionale `gb-sct` utilisée par FlagCDN.
- Les valeurs réservées ou placeholders (par exemple `ZZ`, `XX`, `-99`, `00`) ne génèrent jamais d'URL.
- Un code ISO invalide est ignoré ; un autre champ ISO valide peut encore être utilisé.
- Les alias historiques explicites ne sont conservés que si leur code de destination est lui-même valide.
- Si aucune source n'est déterminable, le résolveur renvoie `type: "none"`, une URL vide et aucun texte alternatif : l'interface masque l'élément au lieu d'afficher une icône cassée.
- Si un blason échoue, le drapeau n'est tenté qu'une fois. Si les deux sources échouent, l'image est masquée et son attribut `src` retiré.
- Les images distantes de la liste et de la fiche utilisent `referrerPolicy="no-referrer"`. Les erreurs réseau restent gérées côté interface ; la disponibilité réelle dépend des fournisseurs externes.
