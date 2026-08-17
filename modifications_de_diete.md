# Modifications de diète — règles à appliquer systématiquement

Ces règles s'appliquent à chaque fois que je (Claude) modifie une diète existante (ajustement de macros, augmentation/réduction calorique, etc.), que ce soit via l'éditeur console ou en direct sur Supabase.

## Grammages — toujours arrondir

- **Jamais de grammages "bruts"** issus d'un calcul (32g, 41g, 16g, 7g…). Toujours arrondir à un multiple de 5 (ou 10 pour les grosses quantités : riz, pomme de terre, poulet…).
- **Beurre de cacahuètes (et tout aliment "condiment"/matière grasse en petite quantité)** : jamais en dessous de **10g**. Soit on met 10g ou 15g, jamais 6, 7, 11, 12g. En dessous de 10g, ça ne sert à rien nutritionnellement — autant ne pas en mettre du tout si le budget lipides ne le permet pas.
- **Ne jamais laisser un aliment à une quantité ridicule** (ex : 1g de banane trouvé dans les diètes Hugo Bonnet — vérifier aussi que les macros par 100g de l'aliment sont correctes, pas à 0 partout comme c'était le cas). Une banane standard fait dans les 100-120g ; en dessous, redescendre vers 50g plutôt que quelques grammes.
- **Cohérence globale plutôt que précision au gramme** : le corps gère très bien un écart de quelques grammes de protéines/glucides/lipides ou quelques kcal. Chercher un chiffre rond et propre plutôt qu'un chiffre exact mais absurde visuellement.

## Cocher les aliments modifiés (`repas_aliments.modifie`)

- Chaque fois qu'un aliment est modifié en dehors de l'éditeur console (donc en direct sur Supabase), **penser à passer `modifie: true`** sur la ligne `repas_aliments` concernée.
- Ce flag pilote le badge "modifié" affiché au client dans l'appli mobile (`diete.js`) — sans lui, le client ne voit pas ce qui a changé. L'éditeur console le fait automatiquement quand on change une quantité à la main ; en édition directe SQL/API, il faut le faire soi-même.

## Cohérence entre jour ON / jour OFF (ou plus généralement entre variantes d'une même diète)

- Repérer les repas qui sont **structurellement les mêmes** entre les deux diètes (même base d'aliments, ex : "poulet + riz + huile + légumes" en repas 2, "poulet + pomme de terre + huile + légumes" en repas 3) → sur ces repas-là, **utiliser exactement les mêmes grammages des deux côtés** (même quantité de poulet, de riz, d'huile…). Pas de raison qu'ils diffèrent.
- Concentrer la différenciation calorique entre les diètes (le delta de calories voulu) sur les repas qui sont **déjà différents dans leur nature** (ex : petit-déj œufs/muffin vs whey/avoine) — c'est là qu'on peut jouer sur les quantités sans que ça saute aux yeux comme une incohérence.
- Ne jamais laisser deux repas "censés être les mêmes" avec un écart de plus d'une vingtaine de kcal entre jour ON et jour OFF — si c'est le cas, revoir les grammages pour les aligner.
- **Option structurelle à considérer en priorité** : si jour ON et jour OFF n'ont pas le même nombre de repas (ex : un pré-workout ou post-workout qui n'existe que les jours d'entraînement), c'est souvent LÀ qu'il faut aller chercher l'écart calorique voulu entre les deux journées — plutôt que de gonfler/dégonfler artificiellement un repas commun aux deux jours. Un repas qui "disparaît" logiquement un jour de repos (parce qu'il n'y a pas d'entraînement à préparer/récupérer) est plus cohérent qu'un ajustement arbitraire sur un repas partagé. Toujours vérifier la structure des repas des deux diètes avant de décider où faire porter la différenciation.
- **Cohérence "recette réelle"** : avant de composer/modifier un repas (surtout un porridge ou une recette avec plusieurs ingrédients), se demander si la combinaison a du sens dans la vraie vie (ex : œufs + muffin + flocons d'avoine dans le même petit-déj = bizarre, personne ne mange ça ; un porridge doit avoir largement plus de flocons que de whey, pas des quantités quasi égales). Préférer jouer sur la quantité d'un aliment déjà présent dans un repas structurellement cohérent (ex : passer de 1 à 2 muffins) plutôt que d'ajouter un ingrédient étranger au repas pour gonfler les calories.

## Équivalents / repas alternatifs (variantes au sein d'un même repas)

- Quand un repas a un "repas alternatif" (équivalent, `variante_index` différent), **la priorité absolue est l'écart de macronutriments, PAS l'écart calorique.** Un écart de calories de 8-15 kcal entre les deux versions est totalement acceptable ; un écart de 6g de lipides (ou de protéines/glucides) entre les deux versions est "énorme" et inacceptable, même si les calories totales tombent pile.
- Cible : écart de lipides/protéines/glucides entre le repas officiel et son équivalent **sous les 2g si possible**, quitte à laisser un écart de calories de quelques kcal en échappement (le corps s'en fiche de 8 kcal, il ne s'en fiche pas de 6g de lipides en plus ou en moins selon le jour).
- Méthode : si l'écart vient d'un excès de protéines sur l'équivalent → réduire la source de protéines (whey, etc.). Si l'écart vient d'un déficit de glucides → réduire les glucides (flocons d'avoine, etc.). Si l'écart vient d'un déficit de lipides → augmenter la matière grasse (beurre de cacahuètes, toujours par paliers de 5g, jamais en dessous de 10g). Ajuster les 2-3 leviers ensemble jusqu'à ce que les 3 macros collent, sans se soucier si le total calorique dérive légèrement de quelques kcal.

## Sauvegarde avant modification

- Avant toute modification manuelle d'une diète en cours d'utilisation, **dupliquer le template actuel** dans `diete_templates` (avec un nom du type `"<NOM ORIGINAL> (backup <date> avant <raison>)"`, `client_only: true`) avant de toucher aux quantités. Permet un retour arrière si besoin.

## Process de calcul

1. Récupérer la structure complète actuelle (repas + aliments + macros par 100g) via Supabase, ne jamais deviner.
2. Calculer les totaux actuels (kcal/P/G/L) et les comparer aux chiffres annoncés par le coach pour valider la compréhension des données avant de toucher à quoi que ce soit.
3. Définir les cibles macros exactes (grammes absolus de protéines/lipides, le reste en glucides) à partir des consignes du coach.
4. Distribuer les ajustements sur les aliments existants (pas de nouveaux aliments sauf demande explicite), en respectant toutes les règles ci-dessus (arrondi, cohérence ON/OFF, équivalents proches).
5. Vérifier les totaux finaux par un recalcul direct depuis Supabase (pas de confiance aveugle dans le calcul manuel) avant de considérer la tâche terminée.

## En cas de doute

Si un ajustement pose une question d'arbitrage (ex : privilégier la précision des macros vs. le nombre de repas, où faire porter un écart calorique, quelle quantité "a du sens" pour un aliment) → **poser la question au coach plutôt que de trancher seul silencieusement.** Ce fichier grandit au fil des sessions : après chaque série d'ajustements, en tirer les principes généraux et les ajouter ici pour la prochaine fois.
