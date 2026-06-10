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

## Status: specified, not yet implemented

This project is built spec-first, like everything else in the RQML ecosystem.
The complete specification lives in [`requirements.rqml`](requirements.rqml) —
goals, scenarios, requirements with acceptance criteria, the enforcement-session
state machine, and trace links into the upstream toolchain spec. Implementation
coverage is intentionally zero until requirements are approved; trace links will
be recorded with `rqml link` as each piece is built.

```bash
npx @rqml/cli status     # see for yourself
```

## What it will look like

| Surface | Contents |
|---------|----------|
| Hooks | SessionStart anchoring · PostToolUse spec validation · Stop gate on `rqml check` |
| Commands | `/rqml:init` · `/rqml:status` · `/rqml:check` |
| MCP | The bundled `@rqml/mcp` server: `rqml_show`, `rqml_impact`, `rqml_link`, … |
| Skill | RQML authoring guidance (derived from rqml-skill) |

Dormant in projects without an `.rqml` spec; fails open when the toolchain is
missing. See the spec for the normative version of all of the above.

## License

Apache-2.0 © Garðar Guðgeirsson / rqml.org
