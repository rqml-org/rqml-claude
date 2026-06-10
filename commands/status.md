---
description: Re-anchor on the project's RQML spec — coverage, drift, and what to work on next
---

Re-anchor on the project specification:

1. Run `rqml status` and read the summary.
2. Report to the developer, in plain language:
   - the spec identity and lifecycle state,
   - approved-but-unimplemented requirements (the actionable backlog),
   - premature implementations, uncovered goals, and any drift or dangling references,
   - lint findings worth acting on.
3. If there is an actionable backlog, list the top items by id and title (use `rqml show <ID>` for any the developer asks about) and ask which to take on.

Remember the loop for anything you then implement: `rqml show` → `rqml impact` → implement → `rqml link` → `rqml check`.
