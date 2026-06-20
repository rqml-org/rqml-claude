/**
 * TS-PLUGIN (TC-DOCS-CONVERSION, TC-DOCS-SURFACES): the adoption documentation
 * contract. Verifies REQ-DOCS-CONVERSION, REQ-DOCS-ONBOARDING, and
 * REQ-DOCS-SURFACES: the README and docs/ explain RQML and the plugin, link
 * their concept/quickstart/troubleshooting pages with no broken relative links,
 * the install surfaces carry benefit-led copy, and the spec traces it all.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_DOCS = [
  "README.md",
  "docs/quickstart.md",
  "docs/why-rqml-claude.md",
  "docs/troubleshooting.md",
];

const README_SECTIONS = [
  "## What is RQML?",
  "## What this plugin does",
  "## First 10 minutes",
  "## Daily workflow",
  "## Enforcement boundary",
];

const README_DOC_LINKS = [
  "docs/quickstart.md",
  "docs/why-rqml-claude.md",
  "docs/troubleshooting.md",
];

const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

/** Broken relative markdown-link targets in one file, resolved from its dir. */
function brokenRelativeLinks(relative, contents) {
  const broken = [];
  for (const match of contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.includes(">")) target = target.slice(1, target.indexOf(">"));
    target = target.split(/\s+/)[0]; // drop any "title"
    if (!target || target.startsWith("#") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) continue;
    const file = target.split("#")[0];
    if (!file) continue;
    const resolved = resolve(ROOT, dirname(relative), file);
    if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${sep}`)) broken.push(`${target} (escapes repo)`);
    else if (!existsSync(resolved)) broken.push(target);
  }
  return broken;
}

// ---------------------------------------------------------------------------
// TC-DOCS-CONVERSION — README + docs explain RQML and onboard to first green.
// ---------------------------------------------------------------------------
test("TC-DOCS-CONVERSION: every required doc exists with no broken relative links", () => {
  for (const relative of REQUIRED_DOCS) {
    assert.ok(existsSync(join(ROOT, relative)), `missing required documentation: ${relative}`);
    assert.deepEqual(brokenRelativeLinks(relative, read(relative)), [], `broken links in ${relative}`);
  }
});

test("TC-DOCS-CONVERSION: README covers the concept-to-onboarding sections and links the docs", () => {
  const readme = read("README.md");
  for (const section of README_SECTIONS) {
    assert.ok(readme.includes(section), `README.md missing required section: ${section}`);
  }
  for (const doc of README_DOC_LINKS) {
    assert.ok(readme.includes(`](${doc})`), `README.md must link to ${doc}`);
  }
  // The RQML logo anchors the top of the README for engagement.
  assert.match(readme, /RQML_logo_transparent\.png/);
});

// ---------------------------------------------------------------------------
// TC-DOCS-SURFACES — install-surface copy is benefit-led.
// ---------------------------------------------------------------------------
test("TC-DOCS-SURFACES: plugin and marketplace copy names spec outcomes and the rqml check gate", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const copy = [
    plugin.description,
    marketplace.description,
    marketplace.plugins[0].description,
  ];
  for (const text of copy) {
    assert.equal(typeof text, "string");
    assert.ok(/\brequirements?\b/i.test(text) || /\bspec\b/i.test(text), `copy must mention requirements/spec: ${text}`);
  }
  const combined = copy.join("\n");
  assert.match(combined, /\brqml check\b/i, "install-surface copy must name the rqml check gate");
});

// ---------------------------------------------------------------------------
// TC-DOCS-CONVERSION / TC-DOCS-SURFACES — the spec traces the documentation.
// ---------------------------------------------------------------------------
test("requirements.rqml carries the documentation requirements and trace links", () => {
  const spec = read("requirements.rqml");
  for (const id of ["REQ-DOCS-CONVERSION", "REQ-DOCS-ONBOARDING", "REQ-DOCS-SURFACES"]) {
    assert.ok(spec.includes(`id="${id}"`), `requirements.rqml missing ${id}`);
  }
  for (const uri of [
    "README.md",
    "docs/quickstart.md",
    "docs/why-rqml-claude.md",
    "docs/troubleshooting.md",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
  ]) {
    assert.ok(spec.includes(`uri="${uri}"`), `requirements.rqml missing trace link for ${uri}`);
  }
});

// ---------------------------------------------------------------------------
// Negative cases — the contract actually fails when the docs regress.
// ---------------------------------------------------------------------------
test("a broken relative link is detected", () => {
  const broken = brokenRelativeLinks("README.md", "See [gone](docs/does-not-exist.md).\n");
  assert.deepEqual(broken, ["docs/does-not-exist.md"]);
});

test("external and anchor links are not flagged as broken", () => {
  const contents = "[ext](https://rqml.org) and [frag](#section) and ![logo](docs/quickstart.md)\n";
  assert.deepEqual(brokenRelativeLinks("README.md", contents), []);
});

test("a missing README section would be caught", () => {
  const stripped = read("README.md").replace("## Enforcement boundary", "## Renamed");
  assert.ok(!README_SECTIONS.every((s) => stripped.includes(s)));
});

test("weak install-surface copy would be caught", () => {
  const weak = "RQML enforcement hooks for Claude Code.";
  const benefitLed = /\brequirements?\b/i.test(weak) || /\bspec\b/i.test(weak);
  assert.equal(benefitLed && /\brqml check\b/i.test(weak), false);
});
