#!/usr/bin/env node
/**
 * Stop hook (REQ-HOOK-STOP-GATE): the deterministic gate. The session cannot
 * end while `rqml check` fails — except that a stop already continued once by
 * this gate (stop_hook_active) is never blocked again, so an unsatisfiable
 * finding cannot trap the agent in a block-continue loop (see the
 * REQ-HOOK-STOP-GATE notes in requirements.rqml).
 *
 * Blocking is signaled with {"decision":"block","reason":...} on stdout.
 */
import { capped, findSpec, readPayload, readStrictness, resolveCli, runCli, warnOnce } from "./lib.mjs";

const payload = readPayload();
const cwd = payload.cwd ?? process.cwd();

const spec = findSpec(cwd);
const cli = resolveCli(cwd);
const strictness = readStrictness(cwd);

// Workspace mode: no spec governs cwd, but package specs may sit beneath it.
// Gate the whole workspace with `rqml check --workspace` (REQ-WORKSPACE-FANOUT).
// Exit 0 covers both "every unit passes" and "no specs beneath" (genuinely
// dormant), so either way the turn may end. Without the CLI we cannot tell a
// workspace from an ungoverned directory, so stay silent rather than nag.
if (spec === null) {
  if (cli === null) process.exit(0);
  const ws = runCli(cli, ["check", "--workspace", "--strictness", strictness], cwd);
  if (ws.status === 0 || ws.status === null || ws.status === 64) process.exit(0);

  const wsReproduce = `rqml check --workspace --strictness ${strictness}`;
  const wsDiagnostics = capped(`${ws.stdout}\n${ws.stderr}`);

  if (payload.stop_hook_active === true) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: `[rqml] workspace check still fails (exit ${ws.status}); allowing the session to end. Reproduce with: ${wsReproduce}`,
      }),
    );
    process.exit(0);
  }

  const wsReason =
    `The rqml workspace check gate failed (exit ${ws.status}) — one or more package specs are not complete:\n\n` +
    `${wsDiagnostics}\n\n` +
    `Resolve each unit's findings (work inside a package and use \`rqml show <ID>\` / \`rqml link <ID> <path>\`), ` +
    `then confirm across the workspace with: ${wsReproduce}`;
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: wsReason,
      hookSpecificOutput: { hookEventName: "Stop", decision: "block", reason: wsReason },
    }),
  );
  process.exit(0);
}

if (cli === null) {
  const warning = warnOnce(payload.session_id);
  if (warning !== null) {
    process.stdout.write(JSON.stringify({ systemMessage: `[rqml] ${warning}` }));
  }
  process.exit(0); // fail open
}

const check = runCli(cli, ["check", "--strictness", strictness], cwd);

// 0 = pass; null = CLI hung/unspawnable; 64 = our own invocation bug. All
// three let the session end (BR-EXIT-CONTRACT, REQ-HOOK-FAIL-OPEN).
if (check.status === 0 || check.status === null || check.status === 64) process.exit(0);

const reproduce = `rqml check --strictness ${strictness}`;
const diagnostics = capped(`${check.stdout}\n${check.stderr}`);

if (payload.stop_hook_active === true) {
  // Already blocked and continued once; let the session end with a final warning.
  process.stdout.write(
    JSON.stringify({
      systemMessage: `[rqml] check still fails (exit ${check.status}); allowing the session to end. Reproduce with: ${reproduce}`,
    }),
  );
  process.exit(0);
}

const reason =
  `The rqml check gate failed (exit ${check.status}) — the spec-first loop is not complete:\n\n` +
  `${diagnostics}\n\n` +
  "Resolve each finding before finishing: `rqml show <ID>` to read it, implement or `rqml link <ID> <path>` " +
  `to record the trace (use --type verifiedBy for tests), fix any invalid spec, then confirm with: ${reproduce}`;

process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason,
    hookSpecificOutput: { hookEventName: "Stop", decision: "block", reason },
  }),
);
process.exit(0);
