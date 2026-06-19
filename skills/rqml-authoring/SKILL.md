---
name: rqml-authoring
description: Authoring and editing RQML requirements documents (.rqml) — structure, statement quality, acceptance criteria, and traceability. Use when drafting or revising requirements, goals, scenarios, state machines, or trace links in an RQML-governed project.
---

# RQML Authoring

Authoring and editing RQML requirements documents (`.rqml`) in an RQML-governed
project. The **full authoring craft** — document structure, statement quality,
identity & lifecycle, and traceability — is in **[`authoring.md`](authoring.md)**
in this skill directory: the canonical guide, vendored from
[rqml-skill](https://github.com/rqml-org/rqml-skill). Read it for depth, and do
not edit it here — it is kept current by the upstream craft-sync.

## Non-negotiables

- **Validate after every edit**: `rqml validate` — never leave the spec invalid.
- **Never hand-edit trace edges** — record links with `rqml link` / `rqml_link`
  (and `--type verifiedBy` for tests).
- **Never invent element shapes** — `rqml skeleton <req|edge|testCase|stateMachine>`.
- **Read before you write** — `rqml show <ID>`, `rqml impact <ID>`.
- **Finish only when `rqml check` passes** — the Stop gate enforces it.

## In Claude Code

- The `rqml_*` MCP tools are available; prefer their `path` inputs over inlining
  documents.
- Slash commands run the five-stage process: `/rqml:init` (adopt RQML),
  `/rqml:status` (re-anchor), `/rqml:design` (record an ADR), `/rqml:plan`
  (draft the plan), `/rqml:review` (approve requirements), `/rqml:check` (run the
  gate).

Full craft: [`authoring.md`](authoring.md) · Canonical docs: https://rqml.org/docs/
