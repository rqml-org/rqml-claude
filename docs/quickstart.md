# rqml-claude quickstart

This walkthrough gets a repository from "plugin installed" to the first green
RQML gate.

## 1. Check prerequisites

Use Node.js 18 or newer. The plugin calls the RQML CLI, so install it (or
confirm it can run):

```bash
npm install -g @rqml/cli
rqml status
```

Without a global install the plugin still works — its hooks fall back to
`npx -y @rqml/cli` — but a global install keeps the loop fast. In an
uninitialized repo, `status` may report that no spec exists. That is fine; the
goal is to confirm the CLI can be invoked.

## 2. Install the plugin

Inside Claude Code, add this repository as a marketplace and install the
plugin:

```text
/plugin marketplace add rqml-org/rqml-claude
/plugin install rqml@rqml
```

Claude Code runs plugin hooks automatically once the plugin is installed —
there is no separate hook-trust step. In a project without an `.rqml` spec the
plugin stays fully dormant until you adopt one.

## 3. Adopt RQML in the target repo

In the project you want to govern, run:

```text
/rqml:init
```

The command should:

- create or update `requirements.rqml`;
- elicit real project goals, requirements, acceptance criteria, and risks;
- add or update `AGENTS.md` guidance, including the project's strictness level.

Do not start implementation until the new requirements are reviewed and
approved according to your project's strictness level. Use `/rqml:review` to
accept requirements before coding against them.

## 4. Re-anchor and check status

Start a fresh session so `SessionStart` injects the spec, or run:

```text
/rqml:status
```

The output reports coverage, drift, and whether the gate is currently green.

## 5. Make one requirement-backed change

Pick one requirement and inspect it:

```bash
rqml show REQ-...
rqml impact REQ-...
```

Implement only the specified behavior. If the requirement is missing or wrong,
update the spec first and get it approved before coding.

Record trace links:

```bash
rqml link REQ-... path/to/implementation
rqml link REQ-... path/to/test --type verifiedBy
```

Then drive the gate to green:

```text
/rqml:check
```

or directly:

```bash
rqml check
```

The first successful loop is complete when tests pass and `rqml check` exits
zero. The `Stop` hook enforces this automatically: the session cannot end while
the gate is red.

## Expected result

A healthy setup has:

- a valid `requirements.rqml`;
- the `/rqml:*` commands available in the session;
- `SessionStart` injecting status at the top of each session;
- implementation and test trace links for new requirements;
- a passing `rqml check` locally and in CI.
