/**
 * Shared plumbing for the rqml-claude hooks (REQ-THIN-ADAPTER: nothing here
 * parses or evaluates RQML — this file finds the spec, finds the CLI, runs
 * it, and relays its output).
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

/** Read and parse the hook payload Claude Code passes on stdin. */
export function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

/**
 * The governing spec for a working directory (REQ-DISCOVERY, ENT-MARKER): the
 * nearest *.rqml FILE found by checking `cwd`, then each parent directory, up to
 * the repository root — preferring requirements.rqml where a directory has more
 * than one. A directory whose name ends in ".rqml" (the .rqml/ governance
 * folder) is not a spec. Returns null when no governing spec exists in `cwd` or
 * any parent directory (REQ-DORMANT) — so a session in a subdirectory of a
 * governed project finds that project's spec rather than going dormant.
 */
export function findSpec(cwd) {
  let dir = cwd;
  while (true) {
    const spec = specInDir(dir);
    if (spec !== null) return spec;
    // Stop at the repository root rather than escaping into a parent repo.
    if (existsSync(join(dir, ".git"))) return null;
    const parent = dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

/** The preferred *.rqml FILE directly in `dir`, or null (no walk). */
function specInDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const specs = entries
    .filter((e) => e.isFile() && e.name.endsWith(".rqml"))
    .map((e) => e.name)
    .sort();
  if (specs.length === 0) return null;
  const preferred = specs.includes("requirements.rqml") ? "requirements.rqml" : specs[0];
  return join(dir, preferred);
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
 * The governing project's declared strictness (REQ-STRICTNESS-RESPECT): the
 * `## Strictness: \`level\`` convention in the nearest AGENTS.md found by
 * checking `cwd` then each parent directory up to the repository root — so a
 * session in a subdirectory still reads the project's declaration. Defaults to
 * standard when none is declared.
 */
export function readStrictness(cwd) {
  let dir = cwd;
  while (true) {
    try {
      const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
      const m = agents.match(/^#{1,3}\s*Strictness:\s*`?(relaxed|standard|strict|certified)`?\s*$/m);
      if (m) return m[1];
    } catch {
      /* no AGENTS.md here — climb */
    }
    if (existsSync(join(dir, ".git"))) break; // repository root
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return "standard";
}

/**
 * The package specs beneath `cwd` when no single spec governs it — i.e. a
 * workspace root (REQ-WORKSPACE-FANOUT). Discovery is delegated to the CLI's
 * `status --workspace --json` so the plugin never reimplements enumeration.
 * Returns { units, ambiguous } (each possibly empty) or null when the CLI is
 * unavailable or its output is unparseable — callers fail open (stay silent so
 * an ungoverned directory is not nagged).
 */
export function discoverWorkspace(cli, cwd, strictness) {
  const res = runCli(cli, ["status", "--workspace", "--strictness", strictness, "--json"], cwd);
  if (res.status === null) return null; // hung/unspawnable
  try {
    const report = JSON.parse(res.stdout);
    if (!report || !Array.isArray(report.units)) return null;
    return {
      units: report.units,
      ambiguous: Array.isArray(report.ambiguous) ? report.ambiguous : [],
    };
  } catch {
    return null; // not JSON (e.g. a usage error printed to stderr)
  }
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
