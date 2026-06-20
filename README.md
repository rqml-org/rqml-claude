<p align="center">
  <img src="https://rqml.org/img/RQML_logo_transparent.png" alt="RQML logo" width="280">
</p>

<h1 align="center">Make Claude code from the spec, not from a fading chat thread.</h1>

<p align="center">
  <strong>rqml-claude</strong> is the RQML plugin for
  <a href="https://code.claude.com">Claude Code</a>. It anchors every session on
  your requirements, traces the code and tests Claude writes back to them, and
  lets a turn finish only when the deterministic <code>rqml check</code> gate
  passes — locally and in CI.
</p>

<p align="center">
  <a href="docs/quickstart.md">Quickstart</a> •
  <a href="docs/why-rqml-claude.md">Why rqml-claude</a> •
  <a href="docs/troubleshooting.md">Troubleshooting</a> •
  <a href="https://rqml.org">RQML</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@rqml/cli?label=%40rqml%2Fcli&color=8568ab" alt="@rqml/cli on npm">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
</p>

---

## What is RQML?

[RQML](https://rqml.org) is Requirements Markup Language: a human-readable,
tool-readable way to make software intent explicit. A project keeps a durable
requirements artifact — usually `requirements.rqml` — with goals, scenarios,
requirements, verification, and trace links.

That matters more when an agent writes the code. Claude can implement quickly,
but it cannot reliably infer all of the product boundaries, edge cases,
non-functional requirements, or prior decisions that live outside the prompt.
RQML gives the agent structured context and gives the team a deterministic way
to ask: does the code still match the spec?

The verdict is not model judgment. `rqml check` validates the spec, checks
coverage and drift, and fails when implementation or tests no longer line up
with the requirement trace. No language model participates in any enforcement
decision.

## What this plugin does

`rqml-claude` packages the RQML loop for Claude Code as three deterministic
moves:

- **Anchor** — every session starts with `rqml status` injected into context,
  along with the [five-stage RQML process](https://rqml.org/docs/development-process).
- **Validate** — spec edits get `rqml validate` diagnostics in the same turn, so
  an invalid requirement is repaired before the agent moves on.
- **Gate** — the session cannot end until `rqml check` exits 0; failing findings
  come back to the agent as the reason it must keep working.

Commands walk the agent through the process: `/rqml:design` records significant
architectural decisions as ADRs in `.rqml/adr/`, and `/rqml:plan` maintains the
staged implementation plan in `.rqml/plan.md`. The bundled `@rqml/mcp` server
lets Claude read one requirement at a time instead of loading the whole XML
document into the prompt.

The plugin contains no requirements logic of its own. Every verdict comes from
the `rqml` CLI, so what blocks the agent locally is exactly what blocks CI.

## First 10 minutes

1. Install the RQML CLI (the hooks need it; without it the plugin fails open and
   blocks nothing):

   ```bash
   npm install -g @rqml/cli
   rqml status
   ```

2. Inside Claude Code, add this repository as a marketplace and install the
   plugin:

   ```text
   /plugin marketplace add rqml-org/rqml-claude
   /plugin install rqml@rqml
   ```

   Claude Code runs plugin hooks automatically once installed — there is no
   separate hook-trust step.

3. In the target repository, adopt RQML:

   ```text
   /rqml:init
   ```

   This scaffolds or updates `requirements.rqml` and `AGENTS.md`, then elicits
   real goals, requirements, acceptance criteria, and risks.

4. Run the loop once:

   ```bash
   rqml show REQ-...
   rqml impact REQ-...
   # implement
   rqml link REQ-... path/to/implementation
   rqml link REQ-... path/to/test --type verifiedBy
   rqml check
   ```

See [docs/quickstart.md](docs/quickstart.md) for the full first-green-check
walkthrough.

## Daily workflow

Use Claude Code normally, but make the spec the starting point:

```text
/rqml:status   — re-anchor on the current spec
/rqml:review   — accept requirements before implementing them
/rqml:check    — resolve every finding before finishing
```

For a typical change:

1. **Spec** — add or update approved requirements before implementation.
2. **Design** — use `/rqml:design` when a decision should become an ADR.
3. **Plan** — use `/rqml:plan` for staged implementation work.
4. **Code** — read with `rqml show`, assess blast radius with `rqml impact`,
   implement, and record `implements` links with `rqml link`.
5. **Verify** — add tests, record `verifiedBy` links, and finish with
   `rqml check`.

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

## Enforcement boundary

The PreToolUse approval gate is a best-effort guardrail for fast feedback, not a
complete boundary: it fires only for the `Edit`, `Write`, and `MultiEdit` tools,
so a write that does not go through one of those — a Bash redirect (`> file`,
`tee`, `sed -i`), `NotebookEdit`, or an MCP file writer — is not seen by it, and
even when it fires it only blocks edits to code already linked to a non-approved
requirement. The whole-spec boundary is the Stop gate, which re-runs
`rqml check` against the on-disk state at turn end no matter how a file
changed — backed by CI running the same check outside the session. Because the
Stop gate itself fails open when the CLI is missing, CI is the unconditional
backstop.

## Dormancy, fail-open, and monorepos

In a project without an `.rqml` spec the plugin is **fully dormant** — zero
injected context, zero blocking. If the rqml CLI is missing, the hooks **fail
open**: they warn once and block nothing, so a local tooling gap never bricks a
session (CI stays the unconditional backstop).

In a monorepo the plugin activates per the **nearest enclosing** spec — a
session in a subdirectory is governed by that project's `requirements.rqml`. At
a workspace root with no spec of its own but package specs beneath it,
SessionStart surfaces those specs and the stop gate runs `rqml check --workspace`
across them all
(see [`skills/rqml-authoring/monorepo.md`](skills/rqml-authoring/monorepo.md)).

## Spec-first, naturally

This project is built the way the plugin makes you build: the specification in
[`requirements.rqml`](requirements.rqml) was written and approved before any
implementation, every shipped artifact is linked back to its requirement with
`rqml link`, and the committed drift baseline means `rqml check` fails if the
implementation changes without the spec. Run `npx @rqml/cli status` here to see.

## Learn more

- [Why rqml-claude exists](docs/why-rqml-claude.md)
- [Quickstart](docs/quickstart.md)
- [Troubleshooting](docs/troubleshooting.md)
- [RQML user guide](https://rqml.org/docs/user-guide/)
- [RQML tooling](https://rqml.org/docs/tooling/)
- [Claude Code plugin docs](https://code.claude.com/docs/en/plugins)

## License

Apache-2.0 © Garðar Guðgeirsson / rqml.org
