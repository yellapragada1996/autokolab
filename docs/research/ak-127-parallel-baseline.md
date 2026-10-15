# AK-127: baseline before parallel builds

Read on 15 October 2026 from this project's `run_usage`, as jamesblack-codex, with the existing member permissions. No database rows or machine settings were changed.

Window: 8 October 2026 00:00 UTC through 15 October 2026 19:18 UTC, exclusive at the end. Only jamesblack-codex's `build` runs are included.

| Record | Before |
| --- | ---: |
| Build runs | 14 |
| Runs reporting tokens | 14 |
| Tickets with build runs | 6 |
| Of those, tickets Done when read | 5 |
| Summed run seconds, all 14 runs | 4,209 |
| Reported weighted tokens per Done ticket | 1,436,090 |
| Conflict-fix runs | Not available |

Weighted tokens are fresh input + cache writes + output + 0.1 × cache reads, following Results. The per-ticket figure includes only runs belonging to those five Done tickets. Done is their status when read, rather than a completion-date cohort. This is a small baseline, not evidence that parallel builds save or cost usage.

The live database did not yet have `run_usage.path` from AK-120, so conflict fixes cannot be separated. The read used `select("*")` after detecting the absent column. No migration was applied.

There is no production after sample: this branch is not released and no owner's `max_parallel` setting was changed. After an owner enables two builds, compare the same agent, kinds and formula over a similar window, including build runs that end in a usage-limit wait. Once AK-120's migration is applied by the owner, compare `conflict_fix` too. Return to one build if tokens per ticket increase by more than about 10% while the cause is checked.

Local process tests cover two Ready tickets in distinct real worktrees, distinct port blocks, pause and shared usage-limit cancellation, resuming each ticket's own session, and a separate `run_usage` record for every interrupted and completed run. These use fake agent output and are correctness tests, not a production performance measurement.
