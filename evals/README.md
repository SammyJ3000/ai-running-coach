# Evals

Two kinds of evidence that the coach behaves: a plan level adversarial set that runs in CI with no API key, and an LLM as judge exam that tests the coach's answers through the live endpoint.

## 1. Adversarial plans (no API key, runs in CI)

`adversarial-plans.js` holds plans a model could plausibly write that break the knee rules, on purpose or by accident: a tempo run labelled as cross training, a three hour run given in minutes only, an invented session type, runs with no heart rate cap, running after a bad knee check in, a staircase of longer runs on back to back days, and plans with the wrong shape.

`tests/adversarial-plans.test.js` runs each one through `enforce()` in `lib/rules.js` and checks the result against the rules, written out a second time in the test rather than reused from `lib/rules.js`. A case passes when:

- the input really does break a rule (so a broken check cannot pass by accident),
- `enforce()` changes something, and
- the output obeys every rule: known session types only, no run hidden as rest or cross training, no running after a bad knee check in, no quality in the comeback and at most one hard session a week after it, a heart rate cap on every run, and no run (in km, or in minutes at the runner's usual pace) more than 10% longer than the longest in the last 30 days.

Malformed plans must be refused outright. It runs with the other tests:

```bash
npm test
```

To add a case, add an entry to the list in `adversarial-plans.js` with a short name, the runs, the knee check ins, the plan and `expect: 'clamped'` or `expect: 'rejected'`.

## 2. The coach exam (LLM as judge, needs an API key)

`executions/coach_exam.mjs` asks the coach every question in an exam file and has a judge model grade each answer.

- **The coach is tested as it runs.** Each question goes through `POST /api/coach { action: 'ask' }` on the local dev server, so the real prompts, playbook and context are used, not a copy.
- **The judge is a separate model.** It defaults to `judge_model` in `config.json`, which is a different model from `coach_model`, so the coach never marks its own work. Override it with `JUDGE_MODEL` (environment or `.env`) or `--judge`. The harness warns if the judge and coach are the same model.
- **What the judge sees.** The question, the model answer from the exam, the coach's answer, and the reference material: the playbook, the runner's profile, the form analysis and `lib/rules.js`.
- **Scoring.** Four scores, each 0 or 1: correct, cites the right source, no invented facts, knee safe. A pass needs correct, no invented facts and knee safe. The judge's reply goes through `parseModelJson()` with a check that every score is 0 or 1.
- **Hallucination traps.** Some questions ask about rules, studies or workouts that do not exist. A good answer declines rather than inventing.
- **Retest rounds.** `--retest N` reruns round N's failures plus a seeded random sample of earlier passes (`--random`, `--seed`), so a playbook fix cannot quietly break an answer that used to pass.
- **Cost and errors.** Cost per call comes from the token usage, including cache writes and reads. API errors are logged separately and never counted as wrong answers.

### The exam format

`exam.md` is a short example exam written against the placeholder playbook and the fictional runner. Each question is a bold numbered line followed by a line starting `Model answer:`, with a blank line between questions. Pass more than one file with `--exam a.md,b.md`; question IDs get a letter per file (E for the first, then F and so on).

### Running it

Every round calls the API twice per question (coach and judge), so it costs credits.

```bash
node executions/dev-server.js --dev-key          # terminal 1: the app with a local passphrase and your real API key
node executions/coach_exam.mjs --round 1         # terminal 2: every question
node executions/coach_exam.mjs --round 2 --retest 1 --random 3
node executions/coach_exam.mjs --round 3 --only E6,E7
node executions/coach_exam.mjs --report          # rebuild the results file, no API calls
```

### What it writes

These are kept out of git:

- `runs/round-N.json`: every raw answer and grade for the round.
- `exam-log.md`: one line per round.
- `exam-results.md`: the latest result for every question, plus the failures in full.
