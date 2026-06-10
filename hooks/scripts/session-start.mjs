#!/usr/bin/env node
/**
 * SessionStart hook (REQ-HOOK-ANCHOR): in an RQML-governed project, inject
 * the rqml status summary and a compact statement of the loop into the
 * agent's context. Dormant when no spec exists (REQ-DORMANT); fails open
 * when the toolchain is missing (REQ-HOOK-FAIL-OPEN).
 *
 * Stdout from a SessionStart hook is added to the agent's context.
 */
import { findSpec, readPayload, readStrictness, resolveCli, runCli, warnOnce } from "./lib.mjs";

const payload = readPayload();
const cwd = payload.cwd ?? process.cwd();

const spec = findSpec(cwd);
if (spec === null) process.exit(0); // dormant

const cli = resolveCli(cwd);
if (cli === null) {
  const warning = warnOnce(payload.session_id);
  if (warning !== null) process.stdout.write(`[rqml] ${warning}\n`);
  process.exit(0);
}

const strictness = readStrictness(cwd);
const status = runCli(cli, ["status"], cwd);
if (status.status !== 0) process.exit(0); // unreadable spec: validation hook will surface it

process.stdout.write(
  `[rqml] This project is RQML-governed (strictness: ${strictness}). The spec is the source of truth.\n\n` +
    `${status.stdout.trim()}\n\n` +
    "The loop: `rqml show <ID>` to read one requirement (statement, acceptance, traces) · " +
    "`rqml impact <ID>` before changing an artifact · `rqml link <ID> <path>` after implementing " +
    "(use `--type verifiedBy` for tests; never hand-edit trace XML) · finish only when `rqml check` exits 0 — " +
    "the stop gate enforces this. MCP tools (rqml_show, rqml_impact, rqml_link, …) are available; " +
    "prefer their `path` inputs over inlining documents.\n",
);
