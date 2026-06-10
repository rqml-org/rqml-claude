---
description: Adopt RQML in this project — scaffold a spec and draft the first real requirements
---

Adopt RQML (spec-first development) in this project. Follow this sequence exactly:

1. **Scaffold.** Run `rqml init` (or `npx -y @rqml/cli init` if the CLI is not installed). This creates `requirements.rqml` (a starter spec) and `AGENTS.md` (the process contract, including the project's strictness level).

2. **Elicit.** Interview the developer before writing anything. Cover, briefly and concretely:
   - What is the system, and why does it exist? (goals)
   - Who uses it, and what do they do with it? (actors, scenarios)
   - What must it do — the 5–10 core behaviors? (functional requirements)
   - What must hold — performance, security, compatibility? (quality goals, constraints)
   - What would failure look like? (risks, misuse cases)
   Capture assumptions you had to make as open `<issue>` elements rather than guessing silently.

3. **Draft.** Replace the starter requirement with real ones in `requirements.rqml`:
   - One atomic, testable statement per `<req>`, using RFC 2119 keywords (SHALL/SHOULD/MAY).
   - `status="draft"` on everything — the developer approves, not you.
   - Acceptance criteria (given/when/then) on every requirement that is verifiable.
   - Use `rqml skeleton req` (and `goal`, `testCase`, `stateMachine`) for structure; never invent element shapes.
   - Add `satisfies` trace edges from requirements to goals so nothing is an orphan.

4. **Validate and report.** Run `rqml validate`, fix anything it reports, then show the developer the `rqml status` summary and ask them to review and approve the requirements (flip `status` to `approved`) before any implementation begins.

Do not implement anything in this command. Specification precedes code.
