# Agent de tri, cas de test et évaluation

Version anglaise : [README.md](README.md).

Python standard uniquement, rien à installer. Lit directement `dataset/data/*.jsonl` ; Postgres et Node
ne servent pas pour cette partie.

## Clés

Chaque clé seule sur une ligne, dans un fichier à la racine du dépôt (les deux sont ignorés par git) :

- `groq_api_key.txt` : clé Groq (gratuite sur console.groq.com). Sert à l'agent en mode `groq`.
- `gemini_api_key.txt` : clé Gemini (Google AI Studio). Sert à l'agent en mode `fast` et aux aides.
  Une clé d'un projet Google sans facturation reste sur le niveau gratuit : au-delà du quota, les appels
  sont refusés, jamais facturés. Vérifier le niveau dans Google AI Studio, page « API keys ».

## L'agent

```sh
python3 agent/mvp.py                     # l'agent « on the road » sur CD-420322 (la Bentley arrêtée)
python3 agent/mvp.py --models            # modèles Groq disponibles pour ta clé
```

`case_agent.py` fait tourner le même agent sur n'importe quel cas de test. Il lit le cas et ses messages,
interroge le chauffeur ou le site simulés, cherche des informations, puis doit finir de l'une de trois
façons : **seul** (aucune personne nécessaire), **une personne décide** (une décision préparée) ou
**personne uniquement** (client nécessaire, urgence). Il ne réserve, ne paie, ne change une promesse et ne
contacte jamais le client : les outils existent mais sont bloqués, et chaque appel compte comme une faute.

**Filet de sécurité.** Des règles fixes écrites à la main, appliquées après la conclusion de l'agent. Elles
lisent le cas et la conclusion de l'agent (jamais une étiquette de test) et ne peuvent que faire remonter un
cas vers une personne : amendes, réclamations, consignes contradictoires du client, sécurité, voiture qui
ne doit pas rouler, conclusion qui réserve ou paie quelque chose, ou confiance de l'agent inférieure à
« high ». Réglées sur les 31 cas écrits à la main ; sur les 3 850 cas synthétiques, elles ne font jamais
remonter un cas que l'agent doit régler seul.

## Cas de test

`agent/problems/` contient les jeux de données, voir [problems/README.fr.md](problems/README.fr.md) :
74 problèmes du dossier de Bahn, 31 cas écrits à la main et 3 850 cas synthétiques (77 types × 50).

## Évaluation

Les deux mesures principales, à minimiser, surtout la première :

1. **Traité seul à tort** : l'agent a clos un cas qu'une personne devait traiter (taux sur les cas qui
   demandaient une personne). Un risque.
2. **Envoyé à une personne à tort** : quelqu'un dérangé pour un cas que l'agent devait régler (taux sur les
   cas que l'agent devait régler). Un coût.

Un score combiné compte la première 3 fois (`--weight`). Les deux sont donnés pour l'agent seul et après
le filet de sécurité, sur le même passage.

### Page en direct (recommandée)

```sh
python3 agent/live_eval.py        # puis ouvrir http://127.0.0.1:8765
```

Choisis le modèle de l'agent, le jeu de cas, les cas par type, le lot et les options, puis **Run**. La page
se met à jour toutes les 1,5 s : les deux erreurs, le score, l'avancement, le temps restant et chaque cas
terminé. Bouton EN/FR en haut.

**Expérience complète** (un bouton) : lot **A** (un cas par type, 77 cas) sans règles apprises →
**apprentissage des règles** à partir de A (une règle générale par cas, puis fusion) → lot **B** (77 autres
cas des mêmes types) **avec** les règles → lot **B sans** les règles (contrôle). Les passages sont comparés
dans un tableau. Les règles sont refusées sur les cas dont elles viennent.

### Ligne de commande

```sh
python3 agent/evaluate.py --file synthetic --per-type 1 --split A --mode fast --learn
python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast --rules
python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast
python3 agent/evaluate.py --rescore agent/eval_results/<passage>   # recalcule un ancien passage, sans API
```

Options : `--mode fast|groq`, `--split A|B|C`, `--context lean|full`, `--judge`, `--workers N`,
`--weight W`, `--lang en|fr`. Chaque passage écrit `results.jsonl`, `summary.json` et `report.html` dans
`agent/eval_results/<passage>/`.

### Vitesse et modèles

| Mode | Agent | Aides (chauffeur, site, recherche, rédaction des règles) | 77 cas |
|---|---|---|---|
| `fast` (défaut) | Gemini `gemini-3.1-flash-lite` + `gemini-3.5-flash-lite` | Groq `gpt-oss-20b`, puis Gemma | environ 5-7 min |
| `groq` | Groq `gpt-oss-120b` | pool Gemini, puis `gpt-oss-20b` | plus de 30 min en gratuit, au-delà du quota journalier |

Ce sont les offres gratuites qui décident : Groq donne à `gpt-oss-120b` 8 000 tokens par minute et 200 000
par jour (77 cas en demandent ~260 000) ; les deux Flash Lite ont chacun 15 requêtes par minute, 250 000
tokens par minute et 500 requêtes par jour. Les appels sont cadencés sous les limites de chaque modèle, et un
modèle qui refuse (quota, appel d'outil invalide, erreur serveur, délai dépassé) passe la main au suivant de
son pool. Un modèle au quota journalier est retiré ; quand tous le sont, le passage s'arrête aussitôt et
garde les cas faits.

Moins de tokens par cas : le cas et ses messages arrivent dans le premier message, le raisonnement de
`gpt-oss` est réglé sur « low », les réponses des aides sont plafonnées, et le contexte allégé est le défaut
(`--context full` ajoute un guide de tri et le guide des opérations de Bahn, ~2 000 tokens de plus par
appel). Les règles apprises et le guide ne contiennent aucun cas de test ni aucune réponse attendue.
