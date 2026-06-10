# rqml-claude

RQML spec-first enforcement for [Claude Code](https://code.claude.com) — a plugin
that turns the deterministic primitives of the [RQML toolchain](https://rqml.org)
into an enforced development loop:

- **Anchor** — every session starts with `rqml status` injected into context
- **Validate** — spec edits get `rqml validate` diagnostics in the same turn
- **Gate** — the session cannot end until `rqml check` exits 0

The plugin contains no requirements logic of its own. Every verdict comes from
the `rqml` CLI, so what blocks the agent locally is exactly what blocks CI —
and no language model participates in any enforcement decision.

## Install

```bash
# inside Claude Code
/plugin marketplace add rqml-org/rqml-claude
/plugin install rqml@rqml
```

The hooks need the rqml CLI: `npm install -g @rqml/cli`. Without it the plugin
fails open (warns once, blocks nothing). In projects without an `.rqml` spec it
is fully dormant.

## What you get

| Surface | Contents |
|---------|----------|
| Hooks | SessionStart anchoring (`rqml status` into context) · PostToolUse validation of every `.rqml` edit · Stop gate that blocks session completion until `rqml check` exits 0 |
| Commands | `/rqml:init` (adopt RQML) · `/rqml:status` (re-anchor) · `/rqml:check` (drive the gate to green) |
| MCP | The bundled `@rqml/mcp` server: `rqml_show`, `rqml_impact`, `rqml_link`, … |
| Skill | RQML authoring guidance (structure, statement quality, traceability) |

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
