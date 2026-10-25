The problem

Bahn's operators spend their day on delivery incidents: a driver late for a ferry, blurred pickup photos, a site that closes before the car arrives. Most of them need a few checks and a routine answer, not a manager's judgement, yet each one waits in a queue for a person. Every human decision we can safely remove gives operators time for the cases that really need them.

What we built

- An autonomous triage agent. For each problem it gathers the facts itself (asks the simulated driver or site, checks policies and options) and finishes the case alone whenever no approval is needed. It hands over only when a booking, a cost, a date change or a safety event needs a yes, or when only a person can act (the customer, fines, emergencies). Every handover arrives prepared: the facts with their sources, the options and a recommendation.
- A control room built for operators, not engineers: incidents split into "Needs a person" and "Handled by the agent", plain-language statuses, what would change before you approve, approval of one exact version with a separate apply step, and a simulated driver voice reply with a text fallback.
- An evaluation bench that measures the agent's autonomy and its mistakes.

How it works, and what's AI about it

A language model (gpt-oss-120b, through OpenRouter, Groq or Gemini) runs a tool loop: it chooses the next check, reads the result and decides when it knows enough. Two safeguards surround it. A safety net can only escalate a case, never grant an action. Learned rules: after a run, the agent writes general rules from its own mistakes; a filter drops any rule that would authorise an action, and rules are only tested on cases they did not come from. In the control room the agent also reads live weather, road, rail and news data from free public APIs, labelled as real data next to the simulated services.

We measure two errors: finishing alone a case that needed a person (the dangerous one, weighted three times) and handing over a case the agent could have finished (lost autonomy). On 77 synthetic cases, one per problem type, run entirely on OpenRouter: 5 of the 50 cases that needed a person were finished alone, 4 of the 27 autonomous cases were handed over. In an earlier experiment, learned rules lowered the combined error on unseen cases from 0.31 to 0.20.

How we worked

We built in iterations: a scripted demo of one ferry incident; a real LLM investigation with human approval; a dataset (74 problems from Bahn's packet, 31 hand-written test cases, 3,850 synthetic variants of 77 problem types); the evaluation and rule learning; then the operator interface, voice and live data. We aimed for a user-friendly interface from the start.

We tested in two ways at the same time:
- automated tests that our coding agents had to write and pass themselves before every push, to check both the code and the method (approval versions, no duplicate execution, no invented facts);
- evaluation runs of the agent's decisions on cases it had never seen, compared with the expected handover.

What's next

- Cut unnecessary handovers further without letting the dangerous error rise: more learned rules, more cases per type.
- Connect real driver messages and booking systems behind the same approval step.
- Pilot on one Bahn route and measure the operator time saved.
