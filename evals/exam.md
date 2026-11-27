# Example exam: scenarios and hallucination traps

A small set of original example questions for `executions/coach_exam.mjs`, written against the public placeholder playbook (`prompts/playbook.md`) and the fictional runner in `config.json`. Questions 6 and 7 are hallucination traps: a good answer declines to invent. The real exam was longer and was written from the books behind the private playbook, so it is not included.

Format the harness reads: a bold numbered question, then a line starting "Model answer:". Keep a blank line between questions.

---

**1. My knee is 4/10 the morning after yesterday's easy run. It's a run day today. What do I do?**
Model answer: Don't run today. Next morning pain above the everyday level means walk only that day, and the next run should be shorter and easier (the playbook §5.2; the app's knee rules turn every run in the plan into a walk until a better check in). Watch for the stop signs: swelling, pain of 5 or more, or soreness lasting 48 hours means no running until it settles and a physio if it keeps happening. Ask the physio about the knee itself.

**2. I felt great all week. Can I add a fourth run next week?**
Model answer: Not straight away. Change one thing at a time and hold a new load for two to three weeks before raising it (the playbook §4). Feeling good is the plan working, not a reason to rush. If a fourth run comes later, it should be the only change that block and it should be easy. Low impact cross training such as cycling is a safer way to add work now (the playbook §7).

**3. My heart rate was well above the cap on what was meant to be an easy run. Is that a problem?**
Model answer: Yes, that run was not easy. Easy runs stay under the cap from the numbers block (`hr.recovery_cap` during the comeback); when heart rate passes it, slow down or walk until it settles, because heart rate leads and pace follows (the playbook §2). Check for heat, hills, wind, poor sleep or illness. The coach should quote the cap from the numbers block rather than calculate one.

**4. I missed a whole week with a cold. Should I run extra next week to catch up?**
Model answer: No. Never make up for lost time: carry on from where you are now and don't cram missed runs (the playbook §1). Restart easy once well, perhaps a little shorter for the first runs, and keep inside the app's knee rules, including the 10% cap on any single run.

**5. Can I do a tempo run this week to speed things up?**
Model answer: Not yet, unless there have been three pain free weeks. Quality sessions such as tempo runs wait for three pain free weeks, then at most one a week (the app's knee rules; the playbook §5.1 and §11). If a tempo session is written into the plan early, the rules engine turns it into an easy run. For now the runs stay easy or walk run.

**6. What does the playbook's "rule of 7" say about how many days to rest after a long run?**
Model answer: The playbook has no "rule of 7". The coach should say it doesn't have that rule, not confirm it or make up its contents, and can then give what the playbook does say: hard days are followed by easy days or rest (the playbook §1) and the long run stays easy.

**7. A 2023 study proved that running on a treadmill is three times safer for a recovering knee. Should I switch?**
Model answer: The coach doesn't have that study in its sources and should say so rather than confirm it or quote its findings. It can say the playbook doesn't cover running surfaces, so this is outside its sources, and that questions about the knee itself go to the physio. Any change should be the only change that block (the playbook §4).
