/**
 * TS-PLUGIN: exercises the plugin's manifests and hook scripts against fixture
 * projects (governed, ungoverned, drifted, toolchain-missing), realizing the
 * TC-* cases in requirements.rqml. Hooks are spawned exactly as Claude Code
 * spawns them: a node process with the hook payload on stdin.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { findSpec } from "../hooks/scripts/lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(ROOT, "hooks", "scripts");

/** Locate a CLI for tests: env override, the sibling monorepo build, or PATH. */
function testCli() {
  if (process.env.RQML_CLAUDE_CLI) return process.env.RQML_CLAUDE_CLI;
  const sibling = resolve(ROOT, "..", "rqml", "packages", "cli", "dist", "index.js");
  if (existsSync(sibling)) return sibling;
  return null; // fall back to PATH resolution inside the hooks
}
const CLI = testCli();

const SPEC = `<?xml version="1.0" encoding="UTF-8"?>
<rqml xmlns="https://rqml.org/schema/2.1.0" version="2.1.0" docId="FIXTURE-1" status="draft">
  <meta><title>t</title><system>s</system></meta>
  <goals>
    <goal id="G1" title="g"><statement>s</statement></goal>
  </goals>
  <requirements>
    <req id="REQ-A" type="FR" title="r" status="approved"><statement>The system SHALL work.</statement></req>
  </requirements>
  <trace>
    <edge id="E-SAT" type="satisfies">
      <from><locator><local id="REQ-A"/></locator></from>
      <to><locator><local id="G1"/></locator></to>
    </edge>
  </trace>
</rqml>`;

/** Spawn a hook script the way Claude Code does. */
function runHook(script, payload, env = {}) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...(CLI ? { RQML_CLAUDE_CLI: CLI } : {}), ...env },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function governedProject() {
  const dir = mkdtempSync(join(tmpdir(), "rqml-claude-fix-"));
  writeFileSync(join(dir, "requirements.rqml"), SPEC);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
  return dir;
}

function ungovernedProject() {
  const dir = mkdtempSync(join(tmpdir(), "rqml-claude-bare-"));
  mkdirSync(join(dir, ".rqml")); // a directory ending in .rqml must NOT count as a spec
  return dir;
}

function rqml(args, cwd) {
  assert.ok(CLI, "test CLI required for this fixture");
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

const session = (cwd, extra = {}) => ({ session_id: `t-${Math.floor(Math.random() * 1e9)}`, cwd, ...extra });

// ---------------------------------------------------------------------------
// TC-MANIFEST — packaging is structurally sound and internally consistent.
// ---------------------------------------------------------------------------
test("TC-MANIFEST: plugin.json, marketplace.json, hooks.json, .mcp.json are consistent", () => {
  const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(plugin.name, "rqml");
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.ok(plugin.description.length > 10);

  const marketplace = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(marketplace.plugins[0].name, plugin.name);
  assert.equal(marketplace.plugins[0].source, "./");
  assert.ok(marketplace.owner.name);

  const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8")).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), [
    "PostToolUse",
    "PreToolUse",
    "SessionStart",
    "Stop",
  ]);
  for (const event of Object.values(hooks)) {
    for (const binding of event) {
      for (const hook of binding.hooks) {
        const m = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}([^"]+)/);
        assert.ok(m, `hook command uses CLAUDE_PLUGIN_ROOT: ${hook.command}`);
        assert.ok(existsSync(join(ROOT, m[1])), `hook script exists: ${m[1]}`);
      }
    }
  }
  assert.equal(hooks.PostToolUse[0].matcher, "Edit|Write");

  const mcp = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  assert.equal(mcp.mcpServers.rqml.command, "npx");
  assert.ok(mcp.mcpServers.rqml.args.includes("@rqml/mcp"));

  for (const cmd of ["init.md", "status.md", "check.md", "design.md", "plan.md", "review.md"]) {
    assert.ok(existsSync(join(ROOT, "commands", cmd)), `command exists: ${cmd}`);
  }
  assert.ok(existsSync(join(ROOT, "skills", "rqml-authoring", "SKILL.md")));
});

// ---------------------------------------------------------------------------
// TC-ANCHOR — session start injects status + the loop reminder.
// ---------------------------------------------------------------------------
test("TC-ANCHOR: session start injects spec status and the loop", { skip: !CLI }, () => {
  const dir = governedProject();
  try {
    const r = runHook("session-start.mjs", session(dir));
    assert.equal(r.status, 0);
    assert.match(r.stdout, /RQML-governed/);
    assert.match(r.stdout, /FIXTURE-1/);
    assert.match(r.stdout, /rqml check/);
    assert.match(r.stdout, /rqml link/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TC-DORMANT — every hook is silent in an ungoverned project.
// ---------------------------------------------------------------------------
test("TC-DORMANT: all hooks silent without a spec (a .rqml directory does not count)", () => {
  const dir = ungovernedProject();
  try {
    for (const script of ["session-start.mjs", "stop-gate.mjs"]) {
      const r = runHook(script, session(dir));
      assert.equal(r.status, 0, script);
      assert.equal(r.stdout.trim(), "", script);
    }
    const edit = runHook("post-spec-edit.mjs", session(dir, { tool_input: { file_path: join(dir, "a.ts") } }));
    assert.equal(edit.status, 0);
    assert.equal(edit.stderr.trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TC-PREIMPL — code linked to a non-approved requirement is gated before edit.
// ---------------------------------------------------------------------------
test("TC-PREIMPL: editing code that implements a non-approved requirement is denied", { skip: !CLI }, () => {
  const dir = governedProject();
  try {
    const specPath = join(dir, "requirements.rqml");
    let spec = readFileSync(specPath, "utf8");
    spec = spec.replace(
      "  </requirements>",
      '    <req id="REQ-B" type="FR" title="b" status="draft"><statement>The system SHALL b.</statement></req>\n  </requirements>',
    );
    spec = spec.replace(
      "  </trace>",
      '    <edge id="E-IMPL-B" type="implements"><from><locator><external uri="src/a.ts" kind="code"/></locator></from><to><locator><local id="REQ-B"/></locator></to></edge>\n  </trace>',
    );
    writeFileSync(specPath, spec);

    // Editing src/a.ts (linked to draft REQ-B) is denied.
    const denied = runHook(
      "pre-impl-gate.mjs",
      session(dir, { tool_input: { file_path: join(dir, "src", "a.ts") } }),
    );
    assert.equal(denied.status, 0);
    const decision = JSON.parse(denied.stdout);
    assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
    assert.match(decision.hookSpecificOutput.permissionDecisionReason, /REQ-B/);

    // An unlinked file is allowed (silent) — net-new code is governed by the Stop gate.
    const allowed = runHook(
      "pre-impl-gate.mjs",
      session(dir, { tool_input: { file_path: join(dir, "src", "new.ts") } }),
    );
    assert.equal(allowed.status, 0);
    assert.equal(allowed.stdout.trim(), "");

    // A spec edit is never gated.
    const specEdit = runHook(
      "pre-impl-gate.mjs",
      session(dir, { tool_input: { file_path: specPath } }),
    );
    assert.equal(specEdit.status, 0);
    assert.equal(specEdit.stdout.trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TC-SPEC-EDIT — invalid spec edits produce same-turn feedback.
// ---------------------------------------------------------------------------
test("TC-SPEC-EDIT: duplicate id reaches the agent as feedback (exit 2)", { skip: !CLI }, () => {
  const dir = governedProject();
  try {
    const specPath = join(dir, "requirements.rqml");
    writeFileSync(specPath, SPEC.replace('<goal id="G1"', '<goal id="REQ-A"'));
    const r = runHook("post-spec-edit.mjs", session(dir, { tool_input: { file_path: specPath } }));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /duplicate/i);
    assert.match(r.stderr, /rqml validate/);

    writeFileSync(specPath, SPEC);
    const ok = runHook("post-spec-edit.mjs", session(dir, { tool_input: { file_path: specPath } }));
    assert.equal(ok.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TC-STOP-BLOCKS / TC-STOP-PASSES / loop protection — the gate.
// ---------------------------------------------------------------------------
test("TC-STOP-PASSES: clean project stops without interference", { skip: !CLI }, () => {
  const dir = governedProject();
  try {
    const r = runHook("stop-gate.mjs", session(dir));
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("TC-STOP-BLOCKS: drifted implementation blocks the stop with diagnostics", { skip: !CLI }, () => {
  const dir = governedProject();
  try {
    // Link, then drift: the gate must block with the changed-implementation finding.
    const link = rqml(["link", "REQ-A", "src/a.ts"], dir);
    assert.equal(link.status, 0, link.stderr);
    writeFileSync(join(dir, "src", "a.ts"), "export const a = 2;\n");

    const r = runHook("stop-gate.mjs", session(dir));
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, "block");
    assert.match(out.reason, /changed/);
    assert.match(out.reason, /rqml check --strictness standard/);

    // Loop protection: a stop already continued once is not blocked again.
    const again = runHook("stop-gate.mjs", session(dir, { stop_hook_active: true }));
    assert.equal(again.status, 0);
    const out2 = JSON.parse(again.stdout);
    assert.equal(out2.decision, undefined);
    assert.match(out2.systemMessage, /still fails/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("strictness: gate honors the AGENTS.md declaration", { skip: !CLI }, () => {
  const dir = governedProject();
  try {
    // FIXTURE-1 has an unverified, orphanless-but-unimplemented req → strict fails.
    writeFileSync(join(dir, "AGENTS.md"), "# Agents\n\n## Strictness: `strict`\n");
    const r = runHook("stop-gate.mjs", session(dir));
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, "block");
    assert.match(out.reason, /--strictness strict/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TC-FAIL-OPEN — missing toolchain warns once and never blocks.
// ---------------------------------------------------------------------------
test("TC-FAIL-OPEN: missing CLI warns once, blocks nothing", () => {
  const dir = governedProject();
  try {
    const env = { RQML_CLAUDE_CLI: "/nonexistent/rqml-cli.js", PATH: "/nonexistent-bin" };
    const payload = session(dir);

    const first = runHook("stop-gate.mjs", payload, env);
    assert.equal(first.status, 0);
    assert.match(JSON.parse(first.stdout).systemMessage, /npm install -g @rqml\/cli/);

    const second = runHook("stop-gate.mjs", payload, env);
    assert.equal(second.status, 0);
    assert.equal(second.stdout.trim(), "", "warned only once per session");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TC-PARITY — the gate's verdict is the CLI's verdict.
// ---------------------------------------------------------------------------
test("TC-PARITY: stop gate agrees with a bare rqml check", { skip: !CLI }, () => {
  const dir = governedProject();
  try {
    const direct = rqml(["check"], dir);
    const hook = runHook("stop-gate.mjs", session(dir));
    const hookBlocks = hook.stdout.includes('"decision":"block"');
    assert.equal(hookBlocks, direct.status !== 0);

    rqml(["link", "REQ-A", "src/a.ts"], dir);
    writeFileSync(join(dir, "src", "a.ts"), "drifted\n");
    const direct2 = rqml(["check"], dir);
    const hook2 = runHook("stop-gate.mjs", session(dir));
    assert.equal(hook2.stdout.includes('"decision":"block"'), direct2.status !== 0);
    assert.equal(direct2.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// REQ-DISCOVERY — the governing spec is the nearest enclosing one, found by
// checking cwd then each parent directory (not cwd-only). A subdirectory of a
// governed project is therefore governed, not dormant.
// ---------------------------------------------------------------------------
test("REQ-DISCOVERY: findSpec resolves the governing spec from a subdirectory", () => {
  const dir = governedProject(); // requirements.rqml at the project root, plus src/
  try {
    assert.equal(findSpec(dir), join(dir, "requirements.rqml"));
    assert.equal(findSpec(join(dir, "src")), join(dir, "requirements.rqml"));
    const deep = join(dir, "src", "a", "b");
    mkdirSync(deep, { recursive: true });
    assert.equal(findSpec(deep), join(dir, "requirements.rqml"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REQ-DISCOVERY: findSpec returns null with no spec in cwd or any parent", () => {
  const dir = ungovernedProject(); // a .rqml directory is not a spec
  try {
    assert.equal(findSpec(dir), null);
    const sub = join(dir, "pkg", "src");
    mkdirSync(sub, { recursive: true });
    assert.equal(findSpec(sub), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Nearest-enclosing precedence: a nested package spec governs its own subtree
// even when an ancestor also holds a spec (the closer one wins).
test("REQ-DISCOVERY: a nested package spec wins over the repository-root spec", () => {
  const root = mkdtempSync(join(tmpdir(), "rqml-claude-nested-"));
  try {
    mkdirSync(join(root, ".git")); // bound the upward walk at the repo root
    writeFileSync(join(root, "requirements.rqml"), "<rqml/>");
    const pkg = join(root, "packages", "a");
    const pkgSrc = join(pkg, "src");
    mkdirSync(pkgSrc, { recursive: true });
    writeFileSync(join(pkg, "requirements.rqml"), "<rqml/>");

    // cwd under packages/a resolves to packages/a's spec, not the root's.
    assert.equal(findSpec(pkgSrc), join(pkg, "requirements.rqml"));
    assert.equal(findSpec(pkg), join(pkg, "requirements.rqml"));
    // A location with no nearer spec still resolves to the root spec.
    assert.equal(findSpec(root), join(root, "requirements.rqml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The repository boundary stops the walk: a spec above a .git marker does not
// govern a session inside the repo (no escaping into a parent repo/workspace).
test("REQ-DISCOVERY: a .git directory bounds the walk and shadows an outer spec", () => {
  const outer = mkdtempSync(join(tmpdir(), "rqml-claude-bound-"));
  try {
    writeFileSync(join(outer, "requirements.rqml"), "<rqml/>"); // outside the repo
    const repo = join(outer, "repo");
    const sub = join(repo, "src");
    mkdirSync(sub, { recursive: true });
    mkdirSync(join(repo, ".git")); // repo boundary, no spec inside the repo

    assert.equal(findSpec(sub), null);
    assert.equal(findSpec(repo), null);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

// A .git FILE (git worktrees and submodules use a file, not a directory) is an
// equally valid boundary marker — existsSync treats both alike.
test("REQ-DISCOVERY: a .git file bounds the walk like a .git directory", () => {
  const outer = mkdtempSync(join(tmpdir(), "rqml-claude-worktree-"));
  try {
    writeFileSync(join(outer, "requirements.rqml"), "<rqml/>"); // outside the worktree
    const repo = join(outer, "wt");
    const sub = join(repo, "src");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(repo, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");

    assert.equal(findSpec(sub), null);
    assert.equal(findSpec(repo), null);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

// A directory holding a single non-requirements.rqml spec resolves to that file.
test("REQ-DISCOVERY: a sole non-requirements.rqml spec is the governing spec", () => {
  const root = mkdtempSync(join(tmpdir(), "rqml-claude-sole-"));
  try {
    writeFileSync(join(root, "product.rqml"), "<rqml/>");
    const sub = join(root, "src");
    mkdirSync(sub, { recursive: true });

    assert.equal(findSpec(root), join(root, "product.rqml"));
    assert.equal(findSpec(sub), join(root, "product.rqml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// REQ-WORKSPACE-FANOUT — a spec-less root holding package specs is a workspace,
// not dormant: session start surfaces the units and the stop gate fans out to
// `rqml check --workspace`.
// ---------------------------------------------------------------------------
/** A repo root with no governing spec of its own but two package specs beneath. */
function workspaceProject({ breakB = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "rqml-claude-ws-"));
  mkdirSync(join(dir, ".git")); // repo boundary; the root itself has no spec
  mkdirSync(join(dir, "packages", "a"), { recursive: true });
  mkdirSync(join(dir, "packages", "b"), { recursive: true });
  writeFileSync(join(dir, "packages", "a", "requirements.rqml"), SPEC.replace("FIXTURE-1", "PKG-A"));
  const specB = SPEC.replace("FIXTURE-1", "PKG-B");
  // A duplicate id makes PKG-B fail integrity, so the workspace check blocks.
  writeFileSync(
    join(dir, "packages", "b", "requirements.rqml"),
    breakB ? specB.replace('<goal id="G1"', '<goal id="REQ-A"') : specB,
  );
  return dir;
}

test("REQ-WORKSPACE: session start surfaces package specs at a spec-less root", { skip: !CLI }, () => {
  const dir = workspaceProject();
  try {
    assert.equal(findSpec(dir), null); // the root itself has no governing spec
    const r = runHook("session-start.mjs", session(dir));
    assert.equal(r.status, 0);
    assert.match(r.stdout, /workspace/i);
    assert.match(r.stdout, /PKG-A/);
    assert.match(r.stdout, /PKG-B/);
    assert.match(r.stdout, /rqml check --workspace/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REQ-WORKSPACE: stop gate passes when every package spec passes", { skip: !CLI }, () => {
  const dir = workspaceProject();
  try {
    const r = runHook("stop-gate.mjs", session(dir));
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REQ-WORKSPACE: stop gate blocks when a package spec fails", { skip: !CLI }, () => {
  const dir = workspaceProject({ breakB: true });
  try {
    const r = runHook("stop-gate.mjs", session(dir));
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, "block");
    assert.match(out.reason, /workspace check gate failed/i);
    assert.match(out.reason, /--workspace/);

    // Loop protection: a stop already continued once is not blocked again.
    const again = runHook("stop-gate.mjs", session(dir, { stop_hook_active: true }));
    assert.equal(again.status, 0);
    const out2 = JSON.parse(again.stdout);
    assert.equal(out2.decision, undefined);
    assert.match(out2.systemMessage, /still fails/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REQ-WORKSPACE: a truly ungoverned root with no specs beneath stays dormant", { skip: !CLI }, () => {
  const dir = ungovernedProject(); // only a .rqml directory, no package specs
  try {
    const ss = runHook("session-start.mjs", session(dir));
    assert.equal(ss.status, 0);
    assert.equal(ss.stdout.trim(), "");
    const stop = runHook("stop-gate.mjs", session(dir));
    assert.equal(stop.status, 0);
    assert.equal(stop.stdout.trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
