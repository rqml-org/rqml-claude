---
description: Run the rqml check gate and resolve every finding until it passes
---

Resolve every finding — restoring document validity, closing trace-coverage gaps, and re-checking suspect links — until `rqml check` exits 0:

1. Run `rqml check` (at the strictness declared in AGENTS.md, if any: `rqml check --strictness <level>`).
2. If it exits 0: say so, naming what it covered, and stop.
3. For each finding, resolve it through the loop — never by hand-editing trace XML:
   - **Invalid document** → fix it; `rqml validate` confirms. Nothing else reads reliably until this is clean.
   - **Uncovered goal** → no requirement satisfies it: specify one, or record why the goal is not yet being served.
   - **Orphan requirement** → it satisfies no goal or scenario: capture the goal it serves, then `rqml link <ID> <GOAL-ID> --type satisfies`.
   - **Unimplemented approved requirement** → `rqml show <ID>`, run impact analysis with `rqml impact <ID>`, implement it, then `rqml link <ID> <path-to-implementation>`.
   - **Unverified requirement** → add a test that exercises its acceptance criteria, then `rqml link <ID> <path-to-test> --type verifiedBy`.
   - **Drifted implementation (changed/missing)** → a suspect link, not a defect in itself: re-read the file. Either the code no longer matches the requirement (fix the code), or the change is intentional (update the spec with the developer's confirmation, then `rqml link --refresh <edge-id>` to re-pin the baseline).
   - **Implementation of an unapproved requirement** → ask the developer to review and approve it, or back the change out. Approval is theirs to give.
4. Re-run `rqml check` after each resolution. Repeat until exit 0, then summarize what changed.

Report each finding by the artifact it names — the goal no requirement satisfies, the requirement with no verification edge, the file that changed after its edge was recorded — rather than by the state of the gate. Say that `rqml check` exits 0; never report requirements as "validated", which no command in the toolchain attests.

Never silently change the spec to make the check pass — spec changes need the developer's confirmation.
