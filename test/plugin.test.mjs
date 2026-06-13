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
  assert.deepEqual(Object.keys(hooks).sort(), ["PostToolUse", "SessionStart", "Stop"]);
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

  for (const cmd of ["init.md", "status.md", "check.md", "design.md", "plan.md"]) {
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
