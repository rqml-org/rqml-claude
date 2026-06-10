/**
 * Shared plumbing for the rqml-claude hooks (REQ-THIN-ADAPTER: nothing here
 * parses or evaluates RQML — this file finds the spec, finds the CLI, runs
 * it, and relays its output).
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

/** Read and parse the hook payload Claude Code passes on stdin. */
export function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

/**
 * The project marker (REQ-DORMANT, ENT-MARKER): the lone *.rqml FILE in the
 * project root, preferring requirements.rqml. Directories whose name ends in
 * ".rqml" (the .rqml/ governance folder) are not specs.
 */
export function findSpec(cwd) {
  let entries;
  try {
    entries = readdirSync(cwd, { withFileTypes: true });
  } catch {
    return null;
  }
  const specs = entries
    .filter((e) => e.isFile() && e.name.endsWith(".rqml"))
    .map((e) => e.name)
    .sort();
  if (specs.length === 0) return null;
  const preferred = specs.includes("requirements.rqml") ? "requirements.rqml" : specs[0];
  return join(cwd, preferred);
}

/**
 * Locate the rqml CLI without touching the network (CON-OFFLINE).
 * Resolution order: RQML_CLAUDE_CLI override (a path to a JS entry or an
 * executable) → the project's local node_modules/.bin/rqml → `rqml` on PATH.
 * Returns { cmd, args } or null (fail open, REQ-HOOK-FAIL-OPEN).
 */
export function resolveCli(cwd) {
  const override = process.env.RQML_CLAUDE_CLI;
  if (override) {
    if (override.endsWith(".js") || override.endsWith(".mjs")) {
      return existsSync(override) ? { cmd: process.execPath, args: [override] } : null;
    }
    return { cmd: override, args: [] };
  }
  const local = join(cwd, "node_modules", ".bin", "rqml");
  if (isExecutable(local)) return { cmd: local, args: [] };
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir && isExecutable(join(dir, "rqml"))) return { cmd: join(dir, "rqml"), args: [] };
  }
  return null;
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The project's declared strictness (REQ-STRICTNESS-RESPECT): the AGENTS.md
 * convention `## Strictness: \`level\``, defaulting to standard.
 */
export function readStrictness(cwd) {
  try {
    const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    const m = agents.match(/^#{1,3}\s*Strictness:\s*`?(relaxed|standard|strict|certified)`?\s*$/m);
    if (m) return m[1];
  } catch {
    /* no AGENTS.md — default */
  }
  return "standard";
}

/**
 * Run the rqml CLI (BR-EXIT-CONTRACT). Returns { status, stdout, stderr };
 * a hung or unspawnable CLI resolves to status null, which callers treat as
 * fail-open.
 */
export function runCli(cli, cliArgs, cwd) {
  const result = spawnSync(cli.cmd, [...cli.args, ...cliArgs], {
    cwd,
    encoding: "utf8",
    timeout: 20000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const INSTALL_HINT =
  "The rqml CLI is not available. Install it with: npm install -g @rqml/cli " +
  "(spec-first enforcement is disabled until then; CI remains the backstop).";

/**
 * Fail-open warning, at most once per session (REQ-HOOK-FAIL-OPEN). Returns
 * the warning text the first time, null afterwards.
 */
export function warnOnce(sessionId) {
  const marker = join(tmpdir(), `rqml-claude-warned-${sessionId || "nosession"}`);
  if (existsSync(marker)) return null;
  try {
    writeFileSync(marker, "1");
  } catch {
    /* unwritable tmpdir: warn every time rather than never */
  }
  return INSTALL_HINT;
}

/** Cap diagnostics so a pathological report cannot flood the context. */
export function capped(text, limit = 4000) {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}\n… (truncated; run the command below for the full report)`;
}
