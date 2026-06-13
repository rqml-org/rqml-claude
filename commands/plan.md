---
description: Draft or update the staged implementation plan at .rqml/plan.md — the Plan stage of the RQML process
---

Run the **Plan** stage of the RQML process (https://rqml.org/docs/development-process/plan): break approved requirements into a staged implementation plan written for coding agents, stored at `.rqml/plan.md`. This command does not implement anything — it produces the plan the Code stage follows.

Modes (from the argument):
- no argument — review the existing `.rqml/plan.md`, summarize what is done, and propose the next stage;
- `--full` — generate or regenerate the whole plan (preserve stages already marked `[x]`);
- `<REQ-ID | PKG-ID>` — scope the plan to one requirement or package.

1. **Assess readiness.** Read the spec (`rqml status`, `rqml show <ID>`) and any ADRs in `.rqml/adr/`. State **READY** if the spec is sufficient to begin, or **NOT READY** with the blocking gaps and a recommendation to return to the Spec or Design stage first. Honor the ADRs — the plan must not contradict an accepted decision.

2. **Write the plan** to `.rqml/plan.md` as markdown stages with checkboxes. Each stage names:
   - **Goal** — what it accomplishes;
   - **Requirements** — the requirement ids it addresses (by id, not restated text);
   - **Files** — concrete paths to create or modify;
   - **Verification** — the tests/build/lint commands that confirm it;
   - **Trace** — the `implements`/`verifiedBy` edges to record once it lands.

   ```markdown
   ## Stage 1: <name>
   - [ ] Goal: ...
   - [ ] Requirements: REQ-..., REQ-...
   - [ ] Files: src/..., test/...
   - [ ] Verification: `...` passes
   - [ ] Trace: link REQ-... to the implementation and its test
   ```

3. Frame every stage as a self-contained agent task — what to do, which files, what inputs (spec sections, ADRs, existing code), and how to verify. Do not estimate human time.

Report the plan path and the next actionable stage. Implement nothing here; that is the Code stage (`rqml show` → `rqml impact` → implement → `rqml link` → `rqml check`).
