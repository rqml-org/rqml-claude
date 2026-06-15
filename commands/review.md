---
description: Review draft/review requirements with the developer and approve the accepted ones before implementation
---

Run the review→accept checkpoint so implementation only follows approved requirements (REQ-STATUS-ENUM). **Never approve on the developer's behalf** — surface each requirement and let them decide.

1. List what is awaiting acceptance: `rqml matrix --status draft,review` — the requirements not yet approved, with their goals and coverage. For whole-spec context, `rqml overview` (optionally `--section`/`--id` to scope).
2. For each pending requirement, read it in full with `rqml show <REQ-ID>` — statement, acceptance criteria, trace neighborhood — and present it to the developer with a brief, honest assessment (is it atomic, testable, correctly typed and prioritized?).
3. For each requirement the developer accepts, record the decision deterministically with `rqml approve <REQ-ID>` (the toolchain performs the status edit, preserving comments and formatting). Leave the rest as draft/review, and note any the developer wants reworked.
4. Confirm with `rqml matrix --status draft,review` — the accepted requirements should no longer appear.

Only approved requirements drive implementation. Do not write code for a requirement until it is approved — the pre-implementation gate (the PreToolUse hook) denies edits to code that traces to a non-approved requirement.
