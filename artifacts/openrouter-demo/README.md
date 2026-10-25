# Démo réelle OpenRouter — 25 octobre 2026

La page filmée est `agent/live_eval.py`, avec son moteur existant `evaluate.py` → `case_agent.py` → `mvp.py`. Aucun serveur de modèle factice, aucune interception de réponse. Les cas et les conversations de chauffeurs/sites sont fictifs et les aides utilisent leurs modèles configurés. Aucun contact ou réservation réelle.

Passage : `agent/eval_results/live-20261025-131417-run/`.
Trois cas : offre non acceptée, photos de livraison manquantes, confirmation de TVA demandée par le vendeur. Cinq appels de l'agent à `openrouter:openai/gpt-oss-120b`, trois fins conformes, aucune erreur API, aucun outil interdit appelé. Coût enregistré : 0,000455 USD. Juge LLM désactivé, règles apprises désactivées. Cet échantillon ne mesure pas la fiabilité globale.

- `demo.mp4` : montage animé anglais d’environ 38 secondes, en 1920 × 1080, avec texte incrusté, zooms et transitions. Il présente les captures et traces du passage réel existant, sans refaire les appels API.
- `demo-live.webm` : capture brute continue ; temps d'attente conservés.
- `report.html` : rapport autonome, ouvrable sans serveur ; traces et résultats détaillés.
- `status.json` : état et appels d'outils du passage.
- `01-configuration.png`, `02-results.png`, `03-report.png`, `04-mobile.png` : captures du navigateur.

Pour ouvrir l'application : `python3 agent/live_eval.py --port 8766`, puis http://127.0.0.1:8766. Le serveur actuel conserve les résultats de la démo jusqu'à son arrêt. Les rapports restent sur disque.

Pour refaire une capture (déclenche trois nouveaux cas payants) : fournir `PLAYWRIGHT_MODULE` pointant vers un module Playwright Core installé et `CHROMIUM_PATH` vers Chromium, puis `node artifacts/openrouter-demo/record.cjs`. Serveur requis au port 8766, clés dans les fichiers ignorés à la racine. Le script ne lit et ne filme jamais les clés.


## Nouveau montage anglais

`film.html` est la composition animée : sept séquences, aucun temps d’attente API, texte anglais directement dans les images. `report-en.html` est le même rapport en anglais ; `en-*.png` en sont les captures sans données réécrites. `film-animated.webm` est la capture du montage, `demo.mp4` son encodage H.264. Le montage est une présentation des résultats enregistrés, pas une nouvelle exécution en direct. Le fichier `demo-live.webm` conserve le passage original intégral.

Pour refaire le montage sans aucun appel API : `node artifacts/openrouter-demo/record-film.cjs`, avec `PLAYWRIGHT_MODULE` et `CHROMIUM_PATH` configurés.


Révision du début : la capture complète du rapport anglais (`en-page.png`) défile continûment vers le bas pendant les cinq premières séquences. Les textes apparaissent et disparaissent en fondu ; le zoom et la perspective de cette partie sont remplacés par ce défilement.


## Musique

`demo-en-music.mp4` ajoute un fond ambient instrumental discret, avec entrée et sortie progressives. Composition procédurale originale sans échantillon tiers : `background-original.wav`, source `generate-music.py`, mise à disposition sous CC0 dans `MUSIC-LICENSE.txt`.

Musique corrigée : `demo-en-music-audible.mp4`, niveau mesuré -15,9 LUFS après normalisation (AAC stéréo). Le fichier `demo.mp4` pointe également vers cette version.
