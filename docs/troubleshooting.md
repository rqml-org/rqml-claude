# rqml-claude troubleshooting

## `rqml` is missing

Symptom: hooks warn that the RQML CLI is unavailable, or `rqml check` is not
found.

Fix:

```bash
npm install -g @rqml/cli
# or, one-off:
npx -y @rqml/cli check
```

Hooks fail open when the CLI is missing — they warn once per session and block
nothing — so a local tooling gap never bricks Claude. CI should still run the
gate explicitly as the unconditional backstop.

## The plugin seems inactive

Symptom: no status is injected at session start, and stops are never gated.

Most often the project has no governing spec, so the plugin is correctly
dormant. Confirm with:

```text
/rqml:status
```

If you expect governance, adopt a spec:

```text
/rqml:init
```

By convention the governing spec is `requirements.rqml` at the project root. In
monorepos the plugin uses the nearest enclosing `requirements.rqml`: a session
inside a package finds that package or parent spec, and a workspace root with
package specs beneath it uses `rqml check --workspace`. See
[`skills/rqml-authoring/monorepo.md`](../skills/rqml-authoring/monorepo.md).

## The stop gate blocks the turn

Symptom: Claude cannot finish because `rqml check` returned findings.

Fix the finding rather than bypassing it:

- invalid spec: repair `requirements.rqml`;
- unimplemented requirement: implement the approved requirement or change the
  spec through review;
- unverified requirement: add a test and record a `verifiedBy` link;
- drifted artifact: inspect the changed file, confirm it still satisfies the
  requirement, and refresh the trace link with `rqml link --refresh` if
  appropriate;
- dangling reference: fix or remove the broken trace.

Then drive it green again:

```text
/rqml:check
```

The gate runs at the strictness your `AGENTS.md` declares (defaulting to
standard), surfaces the CLI diagnostics verbatim, and never blocks the same
stop twice — so a single unresolved finding will not trap the session in a
loop.

## A code edit was denied before it ran

Symptom: a `PreToolUse` decision denied an edit to a file.

The pre-implementation gate denies edits to code already linked to a
**non-approved** requirement, so work waits for the requirement to be reviewed.
Accept the requirement first:

```text
/rqml:review
```

This gate is best-effort fast feedback, not a complete boundary — see the
enforcement-boundary note in the README. The authoritative gate is the `Stop`
hook plus CI running the same `rqml check`.

## CI fails but local hooks passed

CI is the backstop. It may catch issues that local hooks missed because the CLI
was missing locally, or because a file was changed through a path that bypassed
a pre-tool event (a Bash redirect, `NotebookEdit`, or an MCP file writer).

Run the same gates locally:

```bash
npm test
rqml check
rqml check --strictness strict
```

Fix the first deterministic failure before retrying the rest.
