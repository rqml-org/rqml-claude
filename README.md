# rqml-claude

RQML spec-first enforcement for [Claude Code](https://code.claude.com) — a plugin
that turns the deterministic primitives of the [RQML toolchain](https://rqml.org)
into an enforced development loop:

- **Anchor** — every session starts with `rqml status` injected into context,
  along with the [five-stage RQML process](https://rqml.org/docs/development-process)
- **Validate** — spec edits get `rqml validate` diagnostics in the same turn
- **Gate** — the session cannot end until `rqml check` exits 0

Commands walk the agent through the process: `/rqml:design` records significant
architectural decisions as ADRs in `.rqml/adr/`, and `/rqml:plan` maintains the
staged implementation plan in `.rqml/plan.md`.

The plugin contains no requirements logic of its own. Every verdict comes from
the `rqml` CLI, so what blocks the agent locally is exactly what blocks CI —
and no language model participates in any enforcement decision.

**Enforcement boundary.** The PreToolUse approval gate is a best-effort
guardrail for fast feedback, not a complete boundary: it fires only for the
`Edit`, `Write`, and `MultiEdit` tools, so a write that does not go through one
of those — a Bash redirect (`> file`, `tee`, `sed -i`), `NotebookEdit`, or an
MCP file writer — is not seen by it, and even when it fires it only blocks edits
to code already linked to a non-approved requirement. The whole-spec boundary is
the Stop gate, which re-runs `rqml check` against the on-disk state at turn end
no matter how a file changed — backed by CI running the same check outside the
session. Because the Stop gate itself fails open when the CLI is missing, CI is
the unconditional backstop.

## Install

```bash
# inside Claude Code
/plugin marketplace add rqml-org/rqml-claude
/plugin install rqml@rqml
```

The hooks need the rqml CLI: `npm install -g @rqml/cli`. Without it the plugin
fails open (warns once, blocks nothing). In projects without an `.rqml` spec it
is fully dormant. In a monorepo it activates per the **nearest enclosing** spec —
a session in a subdirectory is governed by that project's `requirements.rqml`;
at a workspace root with no spec of its own but package specs beneath it,
SessionStart surfaces those specs and the stop gate runs `rqml check --workspace`
across them all
(see [`skills/rqml-authoring/monorepo.md`](skills/rqml-authoring/monorepo.md)).

## What you get

| Surface | Contents |
|---------|----------|
| Hooks | SessionStart anchoring (`rqml status` into context) · PreToolUse approval gate that denies edits to code implementing a non-approved requirement · PostToolUse validation of every `.rqml` edit · Stop gate that blocks session completion until `rqml check` exits 0 |
| Commands | `/rqml:init` (adopt RQML) · `/rqml:status` (re-anchor) · `/rqml:design` (record an ADR) · `/rqml:plan` (draft `.rqml/plan.md`) · `/rqml:review` (accept requirements before implementation) · `/rqml:check` (drive the gate to green) |
| MCP | The bundled `@rqml/mcp` server: `rqml_show`, `rqml_impact`, `rqml_link`, … |
| Skill | RQML authoring guidance (structure, statement quality, traceability) + the monorepo spec-scope model |

The stop gate honors the strictness level declared in `AGENTS.md`, surfaces the
CLI diagnostics verbatim, and never blocks the same stop twice (loop
protection). Uninstalling leaves your project untouched.

## Spec-first, naturally

This project is built the way the plugin makes you build: the specification in
[`requirements.rqml`](requirements.rqml) was written and approved before any
implementation, every shipped artifact is linked back to its requirement with
`rqml link`, and the committed drift baseline means `rqml check` fails if the
implementation changes without the spec. Run `npx @rqml/cli status` here to see.

## License

Apache-2.0 © Garðar Guðgeirsson / rqml.org
