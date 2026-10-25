# Dataset des problèmes

Version anglaise : [README.md](README.md).

Un problème opérationnel par ligne dans `data/problems.jsonl`, au format fixé par
`schema.json` (version 1.1). Construit uniquement à partir du dossier de Bahn pour
l'instant ; prévu pour recevoir d'autres sources ensuite.

```sh
python3 agent/problems/build_bahn.py      # régénère data/problems.jsonl depuis dataset/data
python3 agent/problems/validate.py        # vérifie un fichier contre schema.json
python3 agent/problems/validate.py autre.jsonl
```

## Comment un problème est construit

Le dossier de Bahn éparpille un même problème sur plusieurs tables : l'alerte,
l'incident, la tâche ouverte, la proposition d'agent, la conversation. Le script
les **regroupe** en un seul problème :

- **Référence explicite** : un enregistrement en cite un autre (`alert_id`,
  `source_refs`, `evidence_refs`, `conversation_id`…). Citer un message relie sa conversation.
- **Même assignation, moins de 2 h** : un incident ou une visite sur site qui ne
  cite rien rejoint l'alerte de la même assignation chauffeur la plus proche
  dans le temps.

Chaque lien est écrit dans `source.grouping` avec sa règle, pour qu'on puisse
vérifier ou contester un regroupement. Tables lues comme sources de problèmes :
alertes, incidents, tâches, propositions d'agent, conversations, fils du support,
déclarations contradictoires sur une adresse ou un contact, objets en garde
(clés), visites ratées, preuves rejetées, documents manquants, frais refusés.

## Contenu (snapshot du 21 oct. 2026)

74 problèmes, dont 37 ouverts. Par domaine : pickup_readiness 17, on_the_road 12,
costs 11, driver_travel 10, evidence_documents 9, order_data 9, dispatch 3,
delivery_handover 2, support 1. Dix décisions humaines sur des propositions
d'agent : 6 approuvées, 3 modifiées, 1 rejetée.

## Les champs

| Champ | Contenu |
|---|---|
| `id` | Stable, préfixé par l'origine (`bahn-…`). Pour tes données : `manual-…`, `interview-…` |
| `source` | `origin`, `snapshot_at`, les enregistrements regroupés, les liens et leur règle |
| `order` | Commande principale (référence, statut, voiture) ou `null` si aucun lien sûr |
| `problem_type` | Code en MAJUSCULES : `VEHICLE_WARNING`, `FERRY_SOLD_OUT`, `EXPENSE_REJECTED`… |
| `domain` | Liste fermée : on_the_road, driver_travel, dispatch, pickup_readiness, delivery_handover, evidence_documents, costs, order_data, support, other |
| `phase` | intake, before_pickup, in_transit, after_delivery, cancelled, no_order_link |
| `severity`, `status` | low…critical ou null · open / resolved |
| `summary`, `owners`, `waiting_on` | Ce qui se passe, qui le tient, ce qu'on attend |
| `next_actions` | Étapes suivantes **telles qu'écrites** par l'opérateur, avec leur source |
| `agent_work` | Propositions d'agent : commande, justification, contenu proposé |
| `human_decisions` | APPROVED / EDITED / REJECTED, par qui, quand, contenu final retenu |
| `resolution` | Comment ça s'est terminé, avec la source |
| `timeline` | Les messages, dans l'ordre, avec l'émetteur, le destinataire, le canal, la visibilité et la langue |
| `evidence_refs` | Autres enregistrements cités (suivi, événements, offres…) |
| `solution` | **La solution du problème** : `status`, `text`, `sources` (voir ci-dessous) |

### `solution`

Tirée uniquement de ce que les enregistrements disent, jamais inventée :

- `applied` (35) : le problème est résolu ; le texte dit ce qui a été fait (raison de
  résolution, décision humaine sur une proposition d'agent, dernière réponse de l'opérateur).
- `planned` (20) : le problème est ouvert ; le texte est l'étape suivante écrite par
  l'opérateur, ou la décision d'une personne sur une proposition d'agent.
- `none` (19) : rien dans les enregistrements ne dit comment le résoudre. Ce sont les cas
  à compléter en priorité.

Chaque morceau du texte a sa source dans `sources`, dans le même ordre.

## Ajouter des problèmes d'une autre source

Écris un fichier JSONL au même format, passe-le dans `validate.py`, puis ajoute-le.
Le minimum pour un problème écrit à la main :

```json
{"id": "manual-0001", "schema_version": "1.1",
 "source": {"origin": "manual", "snapshot_at": null, "records": [], "grouping": []},
 "order": null, "related_order_ids": [], "problem_type": "FERRY_MISSED", "domain": "driver_travel",
 "phase": "in_transit", "severity": "high", "status": "resolved", "opened_at": null, "resolved_at": null,
 "summary": "Driver missed the evening ferry after a motorway closure.", "owners": [], "waiting_on": [],
 "next_actions": [], "agent_work": [], "human_decisions": [], "resolution": [], "timeline": [],
 "evidence_refs": [], "solution": {"status": "applied", "text": "Rebooked the next sailing; a person approved one hotel night.", "sources": []}}
```

Si tu changes le format, augmente `schema_version` dans `schema.json` et dans le script.

## Précautions

Tout est fictif. `next_actions` et les résumés sont des interprétations écrites
par des opérateurs, pas des faits vérifiés. Une alerte est une raison de regarder,
pas un diagnostic. Les messages peuvent se contredire : garder l'émetteur et l'heure.

## Cas de test inventés (`data/test_cases.jsonl`)

31 cas écrits de zéro, sans reprendre les situations du dossier de Bahn (noms,
sociétés et références fictifs, préfixe `test-`, `source.origin = invented_test_case`).
Ils servent à tester l'agent plus tard. Ils sont dans `test_cases.py`, lisibles et
modifiables ; `python3 agent/problems/test_cases.py` régénère le fichier.

Même format que les problèmes, avec :

- `status = "scenario"` : ni ouvert ni résolu, c'est un cas de test ;
- `solution.status = "expected"` : la réponse de référence, jamais quelque chose qui s'est passé ;
  `[approval]` marque ce qui demande le oui d'une personne, `[person only]` ce qui touche le client ;
- un bloc `test` :
  - `given` : l'heure, la commande (heures en local avec le fuseau), les faits avec leur source ;
    les messages déjà échangés sont dans `timeline` ;
  - `simulated` : ce que savent et répondent le chauffeur et le site simulés ;
  - `expected.handoff` : `agent_alone` (16 cas), `person_decides` (12), `person_only` (3) ;
  - `expected.must` / `must_not` : ce que l'agent doit faire et ne jamais faire.

Les règles valables partout (ne jamais contacter le client, rien réserver sans oui)
s'appliquent à tous les cas, même quand `must_not` ne les répète pas.

## Cas générés par Groq (`data/test_cases_generated.jsonl`)

```sh
python3 agent/problems/generate_cases.py                 # 3 nouveaux cas par domaine
python3 agent/problems/generate_cases.py --per-domain 5
```

Le script montre à Groq deux cas écrits à la main et la liste des types déjà couverts,
puis ne garde que les cas qui passent tous les contrôles (format, valeurs autorisées,
type nouveau). Les rejets sont affichés avec leur raison. Chaque cas gardé a un id
`gen-…` et `source.origin = groq:<modèle>`. Relancer ajoute des cas sans doublon.
Les réponses attendues sont le jugement du modèle : à relire avant de s'en servir.

## Cas par variantes, sans API (`data/test_cases_synthetic.jsonl`)

```sh
python3 agent/problems/synthetic_cases.py                  # 50 cas par type : 77 types, 3850 cas
python3 agent/problems/synthetic_cases.py --per-type 100
```

77 modèles de situations écrits à la main dans `synthetic_cases.py`, un par type de problème,
chacun décliné en 50 cas (ids `syn-00001…`, `source.origin = synthetic_variants`).
Déterministe : la même commande donne toujours le même fichier. Chaque variante change :

- **ce qui décide la réponse** : montant sous ou au-dessus d'une limite, arrivée avant ou
  après la fin d'un créneau ou d'un enregistrement ferry, site qui répond ou non, voyant
  orange ou rouge, dommage mineur ou majeur… 39 des 77 types ont deux fins attendues, avec
  au moins 10 cas de chaque côté ;
- **le décor** : villes réelles et leur fuseau, ferry ou pont seulement si le trajet y passe,
  voitures (électriques quand le cas l'exige), personnes et sociétés fictives, dates de
  novembre à mars, créneaux sur les heures ouvrables locales, messages de chauffeurs en
  allemand, finnois, suédois ou danois pour le type `DRIVER_MESSAGE_OTHER_LANGUAGE`.

Répartition : agent_alone 1534, person_decides 1825, person_only 491. Ce sont des variations
de 77 situations : mesurer un taux de réussite **par type**, puis faire la moyenne des types.
Les 31 cas écrits à la main restent la référence.
