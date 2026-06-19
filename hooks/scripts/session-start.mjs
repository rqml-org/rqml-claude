#!/usr/bin/env node
/**
 * SessionStart hook (REQ-HOOK-ANCHOR): in an RQML-governed project, inject
 * the rqml status summary and a compact statement of the loop into the
 * agent's context. At a workspace root — no spec governs the directory but
 * package specs sit beneath it — surface those units instead of going dormant
 * (REQ-WORKSPACE-FANOUT). Dormant when no spec is found at all (REQ-DORMANT);
 * fails open when the toolchain is missing (REQ-HOOK-FAIL-OPEN).
 *
 * Stdout from a SessionStart hook is added to the agent's context.
 */
import { discoverWorkspace, findSpec, readPayload, readStrictness, resolveCli, runCli, warnOnce } from "./lib.mjs";

const payload = readPayload();
const cwd = payload.cwd ?? process.cwd();

const spec = findSpec(cwd);
const cli = resolveCli(cwd);
const strictness = readStrictness(cwd);

if (spec === null) {
  // Possibly a workspace root: a directory with no governing spec but package
  // specs beneath it. Without the CLI we cannot tell a workspace from an
  // ungoverned directory, so stay silent rather than nag (REQ-DORMANT).
  if (cli === null) process.exit(0);
  const ws = discoverWorkspace(cli, cwd, strictness);
  if (ws === null || ws.units.length === 0) process.exit(0); // genuinely dormant
  process.stdout.write(workspaceAnchor(ws, strictness));
  process.exit(0);
}

if (cli === null) {
  const warning = warnOnce(payload.session_id);
  if (warning !== null) process.stdout.write(`[rqml] ${warning}\n`);
  process.exit(0);
}

const status = runCli(cli, ["status"], cwd);
if (status.status !== 0) process.exit(0); // unreadable spec: validation hook will surface it

process.stdout.write(
  `[rqml] This project is RQML-governed (strictness: ${strictness}). The spec is the source of truth.\n\n` +
    `${status.stdout.trim()}\n\n` +
    "Follow the five-stage RQML process (rqml.org/docs/development-process): " +
    "**Spec** (specify before coding) · **Design** (`/rqml:design` records significant decisions as ADRs in `.rqml/adr/`) · " +
    "**Plan** (`/rqml:plan` maintains `.rqml/plan.md`) · **Code** (`rqml show <ID>` to read, `rqml impact <ID>` before changing, " +
    "implement, then `rqml link <ID> <path>` — `--type verifiedBy` for tests; never hand-edit trace XML) · " +
    "**Verify** (finish only when `rqml check` exits 0 — the stop gate enforces this). " +
    "MCP tools (rqml_show, rqml_impact, rqml_link, …) are available; prefer their `path` inputs over inlining documents.\n",
);

/** Anchor text for a workspace root: the discovered units and how to gate them. */
function workspaceAnchor(ws, level) {
  const lines = [
    `[rqml] This directory is an RQML workspace (strictness: ${level}) — ` +
      `${ws.units.length} package spec(s) beneath it, none governing the root itself:`,
    "",
  ];
  for (const unit of ws.units) {
    const r = unit && typeof unit.result === "object" && unit.result ? unit.result : {};
    lines.push(`  • ${r.docId ?? "unknown"} (${r.status ?? "unknown"}) — ${unit.path}`);
  }
  if (ws.ambiguous.length > 0) {
    lines.push(
      `  ${ws.ambiguous.length} ambiguous directory(ies) (multiple *.rqml, no requirements.rqml) — ` +
        "resolve before they can be gated.",
    );
  }
  lines.push(
    "",
    "Run `rqml check --workspace` to gate every unit at once, or cd into a package to be governed " +
      "by its spec. The stop gate runs the workspace check before the turn can end.",
    "Follow the five-stage RQML process (rqml.org/docs/development-process): Spec · Design · Plan · Code · Verify.",
    "",
  );
  return lines.join("\n");
}
