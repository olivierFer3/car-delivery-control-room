# Agent « On the road » — MVP

Un seul script Python (bibliothèque standard, rien à installer), un seul modèle
Groq (choisi automatiquement dans la liste live de Groq), un seul cas : CD-420322, la Bentley arrêtée sur une aire avec un voyant
rouge. Il lit directement `dataset/data/*.jsonl` ; Postgres et Node ne servent pas.

## Lancer

```sh
# clé gratuite sur console.groq.com, en clair dans groq_api_key.txt à la racine (ignoré par git)
echo 'gsk_...' > groq_api_key.txt
python3 agent/mvp.py                             # CD-420322, tu décides à la fin
python3 agent/mvp.py CD-420322 --auto            # sans la question finale
python3 agent/mvp.py --models                    # modèles Groq disponibles pour ta clé
GROQ_MODEL=qwen/qwen3-32b python3 agent/mvp.py   # forcer un modèle
```

## Ce qu'il fait

1. Lit le cas : commande, voiture, promesse de livraison, alertes, incident, messages, suivi.
2. Pose des questions au chauffeur (simulé par le même modèle Groq).
3. Cherche un dépanneur (annuaire fictif).
4. S'arrête et te présente **une décision** : faits avec leur source, recommandation,
   ce qui demande ton accord. Tu réponds accepter / modifier / refuser.

Règles tenues par le code, pas seulement par le prompt : aucun outil ne peut
joindre le client, rien n'est réservé ni modifié, l'acceptation est simulée.

## Temps mesuré

- **Agent** : durée totale, temps du modèle, temps des outils (dont l'attente de la réponse du chauffeur).
- **Personne** : temps entre l'affichage de la décision et ta réponse.
- **Gagné (estimation)** : somme des minutes « à la main » de chaque action faite
  par l'agent (`MANUAL_MINUTES` en haut de `mvp.py`, hypothèses à ajuster) moins ton temps de décision.

Chaque exécution écrit sa trace complète dans `agent/traces/`.

## Évaluer l'agent

```sh
python3 agent/evaluate.py                                    # les 31 cas écrits à la main (~5-10 min)
python3 agent/evaluate.py --file synthetic --per-type 1      # 1 cas de chacun des 77 types (~15-25 min)
python3 agent/evaluate.py --file synthetic --per-type 2 --no-judge --workers 6
```

`case_agent.py` fait tourner l'agent sur un cas de test (chauffeur et site simulés par Groq).
Chaque cas est noté : **bonne fin** (seul / une personne décide / personne uniquement),
**outils interdits** (écrire au client, payer, changer la promesse : disponibles mais bloqués,
chaque appel est une faute), puis **doit / ne doit pas** vus par un modèle juge (`--no-judge`
pour s'en passer). Moyenne par type de problème.

Résultat dans `agent/eval_results/<date>/report.html` : ouvre-le dans un navigateur.
`agent/eval_results/demo-faux-modele/` est une démonstration produite avec un faux modèle
(fautes plantées exprès) : elle montre la page, pas la qualité de l'agent.
