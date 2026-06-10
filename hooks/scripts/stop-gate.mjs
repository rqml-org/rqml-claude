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
if (spec === null) process.exit(0); // dormant

const cli = resolveCli(cwd);
if (cli === null) {
  const warning = warnOnce(payload.session_id);
  if (warning !== null) {
    process.stdout.write(JSON.stringify({ systemMessage: `[rqml] ${warning}` }));
  }
  process.exit(0); // fail open
}

const strictness = readStrictness(cwd);
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
