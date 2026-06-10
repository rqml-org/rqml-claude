#!/usr/bin/env node
/**
 * PostToolUse hook on Edit|Write (REQ-HOOK-SPEC-VALIDATE): when the agent
 * touches an .rqml document, validate it immediately and feed diagnostics
 * back in the same turn. Exit 2 sends stderr to the agent as tool feedback
 * (REQ-HOOK-DIAGNOSTICS: verbatim diagnostics + the reproducing command).
 */
import { capped, readPayload, resolveCli, runCli, warnOnce } from "./lib.mjs";

const payload = readPayload();
const cwd = payload.cwd ?? process.cwd();
const filePath = payload.tool_input?.file_path;

if (typeof filePath !== "string" || !filePath.endsWith(".rqml")) process.exit(0);

const cli = resolveCli(cwd);
if (cli === null) {
  const warning = warnOnce(payload.session_id);
  if (warning !== null) {
    process.stderr.write(`[rqml] ${warning}\n`);
    process.exit(2); // feedback, not a block: PostToolUse exit 2 informs the agent
  }
  process.exit(0);
}

const result = runCli(cli, ["validate", filePath], cwd);
if (result.status === 0 || result.status === null) process.exit(0);
if (result.status === 64) process.exit(0); // our invocation bug (BR-EXIT-CONTRACT): never punish the agent

process.stderr.write(
  `[rqml] The spec edit left ${filePath} invalid:\n\n` +
    `${capped(`${result.stdout}\n${result.stderr}`)}\n\n` +
    `Fix the document now (reproduce with: rqml validate ${filePath}).\n`,
);
process.exit(2);
