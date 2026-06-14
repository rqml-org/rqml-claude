#!/usr/bin/env node
/**
 * PreToolUse hook on Edit|Write|MultiEdit (REQ-HOOK-PREIMPL): before the agent
 * edits a code file, consult the toolchain's approval gate (`rqml gate <path>`)
 * and DENY the edit when that file is linked by an implements edge to a
 * requirement that is not approved — so implementation never precedes approval.
 *
 * Net-new, not-yet-linked code is not the target of any implements edge, so the
 * gate is a no-op for it (the Stop gate / `rqml check` remain the backstop for
 * first-write coverage). The verdict is the toolchain's, not the model's
 * (REQ-CORE-NO-LLM). Fails open (REQ-HOOK-FAIL-OPEN).
 *
 * Denial is signaled with the PreToolUse permissionDecision "deny".
 */
import { capped, findSpec, readPayload, resolveCli, runCli, warnOnce } from "./lib.mjs";

const payload = readPayload();
const cwd = payload.cwd ?? process.cwd();
const filePath = payload.tool_input?.file_path;

// Nothing to gate without a target file; never gate edits to the spec itself.
if (typeof filePath !== "string" || filePath.endsWith(".rqml")) process.exit(0);

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

const gate = runCli(cli, ["gate", filePath], cwd);

// 2 = blocked (a clean non-approved-implementation verdict). 0 = nothing to
// block; 1 = invalid spec; 64 = our invocation bug; null = hung/unspawnable —
// all fail open (BR-EXIT-CONTRACT, REQ-HOOK-FAIL-OPEN).
if (gate.status !== 2) process.exit(0);

const reason =
  "Approval-before-implementation gate (rqml): this file implements a requirement that is not yet approved.\n\n" +
  `${capped(`${gate.stdout}\n${gate.stderr}`)}\n\n` +
  "Get the requirement approved first — review it with `rqml overview` / `rqml matrix --status draft,review` and " +
  "`rqml show <REQ-ID>`, then once the developer accepts, `rqml approve <REQ-ID>` — or repoint the edge. " +
  `Reproduce with: rqml gate ${filePath}`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }),
);
process.exit(0);
