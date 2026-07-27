/**
 * TC-FLOOR and TC-FLOOR-SYNC (REQ-CLI-FLOOR).
 *
 * The floor check warns when the installed rqml CLI is older than the minimum
 * this plugin honours — and, just as importantly, stays silent otherwise. A gate
 * that nags about version numbers gets switched off, and then it protects
 * nobody, so the silent cases are tested as carefully as the loud one.
 *
 * The sync test pulls the canonical declaration and skips when it is
 * unreachable, matching the craft drift guard: a network-less run must not fail
 * spuriously.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, readFloor } from "../hooks/scripts/lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(ROOT, "hooks", "scripts");
const CANONICAL = "https://rqml.org/toolchain-floor.json";
const FLOOR = JSON.parse(readFileSync(join(ROOT, "toolchain-floor.json"), "utf8"));

const SPEC = `<?xml version="1.0" encoding="UTF-8"?>
<rqml xmlns="https://rqml.org/schema/2.1.0" version="2.1.0" docId="FLOOR-FIX-1" status="draft">
  <meta><title>t</title><system>s</system></meta>
  <requirements>
    <req id="REQ-A" type="FR" title="r" status="approved"><statement>The system SHALL work.</statement></req>
  </requirements>
</rqml>`;

/**
 * A stand-in rqml CLI reporting `version`. `status` prints nothing useful, which
 * is fine — these tests are about the version line, and session-start exits
 * quietly when status fails.
 */
function fakeCli(version) {
  const dir = mkdtempSync(join(tmpdir(), "rqml-claude-fakecli-"));
  const path = join(dir, "fake-rqml.mjs");
  writeFileSync(
    path,
    `const a = process.argv.slice(2);\n` +
      `if (a.includes("--version")) { process.stdout.write(${JSON.stringify(version)} + "\\n"); process.exit(0); }\n` +
      `process.exit(1);\n`,
  );
  return { path, dir };
}

function governedProject() {
  const dir = mkdtempSync(join(tmpdir(), "rqml-claude-floor-"));
  writeFileSync(join(dir, "requirements.rqml"), SPEC);
  mkdirSync(join(dir, "src"));
  return dir;
}

function runSessionStart(cwd, cliPath, sessionId) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, "session-start.mjs")], {
    input: JSON.stringify({ session_id: sessionId, cwd }),
    encoding: "utf8",
    env: { ...process.env, RQML_CLAUDE_CLI: cliPath },
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

const sid = () => `floor-${Math.floor(Math.random() * 1e9)}`;

/** Bump a semantic version by `delta` on its minor component (may go negative-safe). */
function shift(version, delta) {
  const [maj, min, patch] = version.split("-")[0].split(".").map(Number);
  return delta < 0 && min === 0
    ? `${Math.max(0, maj - 1)}.0.${patch}`
    : `${maj}.${Math.max(0, min + delta)}.${patch}`;
}

// ---------------------------------------------------------------------------
// TC-FLOOR — CRIT-FLOOR-BELOW / CRIT-FLOOR-SATISFIED / CRIT-FLOOR-UNREADABLE
// ---------------------------------------------------------------------------

test("TC-FLOOR: an under-floor CLI warns once, names the versions, blocks nothing", () => {
  const dir = governedProject();
  const cli = fakeCli(shift(FLOOR.cliFloor, -1));
  const session = sid();
  try {
    const first = runSessionStart(dir, cli.path, session);
    assert.equal(first.status, 0, "the session is never blocked over a version");
    assert.match(first.stdout, new RegExp(`rqml ${shift(FLOOR.cliFloor, -1).replace(/\./g, "\\.")}`));
    assert.match(first.stdout, new RegExp(FLOOR.cliFloor.replace(/\./g, "\\.")));
    assert.match(first.stdout, /npm install -g @rqml\/cli/);

    const second = runSessionStart(dir, cli.path, session);
    assert.doesNotMatch(second.stdout, /is below the/, "warned only once per session");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cli.dir, { recursive: true, force: true });
  }
});

test("TC-FLOOR: a CLI at or above the floor is never mentioned, however new", () => {
  const dir = governedProject();
  for (const version of [FLOOR.cliFloor, shift(FLOOR.cliFloor, 9)]) {
    const cli = fakeCli(version);
    try {
      const out = runSessionStart(dir, cli.path, sid());
      assert.doesNotMatch(out.stdout, /is below the/, `${version} should produce no version warning`);
    } finally {
      rmSync(cli.dir, { recursive: true, force: true });
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

test("TC-FLOOR: an unreadable version is silent, not a guess", () => {
  const dir = governedProject();
  const cli = fakeCli("not-a-version");
  try {
    const out = runSessionStart(dir, cli.path, sid());
    assert.equal(out.status, 0);
    assert.doesNotMatch(out.stdout, /is below the/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cli.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TC-FLOOR-SYNC — CRIT-FLOOR-VENDORED / CRIT-FLOOR-OVERRIDE
// ---------------------------------------------------------------------------

test("TC-FLOOR-SYNC: the vendored floor matches the published ecosystem declaration", async (t) => {
  let canonical;
  try {
    const res = await fetch(CANONICAL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    canonical = await res.text();
  } catch (err) {
    t.skip(`canonical declaration unreachable (${err.message}); skipping the drift check`);
    return;
  }

  assert.equal(
    readFileSync(join(ROOT, "toolchain-floor.json"), "utf8"),
    canonical,
    "toolchain-floor.json has drifted from the canonical declaration. Do not edit the vendored " +
      `copy — change it in rqml-org/rqml (integrations/toolchain-floor.json) and re-vendor from ${CANONICAL}.`,
  );
});

test("TC-FLOOR-SYNC: a plugin floor may be raised above the ecosystem value, never lowered", () => {
  const declared = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).rqmlToolchain?.floor;
  if (declared !== undefined && declared !== "inherit") {
    assert.ok(
      compareVersions(declared, FLOOR.cliFloor) >= 0,
      `package.json declares floor ${declared}, below the ecosystem floor ${FLOOR.cliFloor}. ` +
        "A plugin may need a newer toolchain than the ecosystem baseline, never an older one.",
    );
  }
  // And the resolver honours that rule whatever the manifest says.
  assert.equal(readFloor(ROOT), declared && declared !== "inherit" ? declared : FLOOR.cliFloor);
});

test("TC-FLOOR-SYNC: a missing vendored declaration disables the check rather than guessing", () => {
  const bare = mkdtempSync(join(tmpdir(), "rqml-claude-nofloor-"));
  try {
    assert.equal(readFloor(bare), null);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});
