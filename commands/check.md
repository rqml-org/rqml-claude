---
description: Run the rqml check gate and resolve every finding until it passes
---

Run the deterministic gate and drive it to green:

1. Run `rqml check` (at the strictness declared in AGENTS.md, if any: `rqml check --strictness <level>`).
2. If it exits 0: report that the gate passes and stop.
3. For each finding, resolve it through the loop — never by hand-editing trace XML:
   - **Invalid spec** → fix the document; `rqml validate` confirms.
   - **Unimplemented approved requirement** → `rqml show <ID>`, check blast radius with `rqml impact <ID>`, implement it, then `rqml link <ID> <path-to-implementation>`.
   - **Unverified requirement** → add a test, then `rqml link <ID> <path-to-test> --type verifiedBy`.
   - **Drifted implementation (changed/missing)** → read the diagnostic; either the code regressed (fix the code) or the change is intentional (update the spec with the developer's confirmation, then re-link to refresh the baseline).
   - **Premature implementation** → ask the developer to review and approve the requirement, or back the change out.
4. Re-run `rqml check` after each resolution. Repeat until exit 0, then summarize what changed.

Never silently change the spec to make the gate pass — spec changes need the developer's confirmation.
