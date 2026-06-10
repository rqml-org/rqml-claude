---
name: rqml-authoring
description: Authoring and editing RQML requirements documents (.rqml) — structure, statement quality, acceptance criteria, and traceability. Use when drafting or revising requirements, goals, scenarios, state machines, or trace links in an RQML-governed project.
---

# RQML Authoring

RQML (https://rqml.org) is an XML format for software requirements. An `.rqml`
document has up to eleven sections in fixed order — meta, catalogs, domain,
goals, scenarios, requirements, behavior, interfaces, verification, trace,
governance — of which only **meta** and **requirements** are mandatory. Add a
section when it earns its keep, not before.

## Non-negotiables

- **Validate after every edit**: `rqml validate` (XSD + referential integrity).
  Never leave the document invalid between turns.
- **Never hand-edit trace edges** for implementation or verification links —
  `rqml link <REQ-ID> <path>` (and `--type verifiedBy` for tests) writes a
  correct edge and records the drift baseline.
- **Never invent element shapes** — `rqml skeleton <req|edge|testCase|stateMachine>`
  emits schema-valid snippets to fill in.
- **Read before you write**: `rqml show <ID>` for one artifact with its trace
  neighborhood; `rqml impact <ID>` before changing anything that exists.

## Statement quality

- One atomic, testable obligation per `<req>`; split compound statements.
- RFC 2119 keywords carry the obligation: SHALL/MUST (binding), SHOULD
  (default expectation), MAY (genuinely optional). Priority attribute matches:
  must / should / may.
- Classify with `type`: FR (functional), NFR (quality), IR (interface),
  DR (data/structure), SR (security), CR (compliance/constraint), PR (process),
  UXR (usability), OR (operational).
- Give every verifiable requirement `<acceptance>` criteria in
  given/when/then form — they are what tests get generated from.
- Statements answer *what* and *how well*; put *why* in `<rationale>` and
  design choices in `<decision>` elements, not in the statement.

## Identity and lifecycle

- IDs match `[A-Za-z][A-Za-z0-9._-]*` (2–80 chars), unique across the whole
  document. Conventions: REQ-*, GOAL-*/QGOAL-*, ENT-*, SM-*/ST-*/TR-*, TC-*,
  DEC-*, RISK-*/OBS-*, E-* for trace edges, CRIT-* for criteria.
- Lifecycle: draft → review → approved → deprecated. **Only approved
  requirements drive implementation**; new requirements you draft are
  `status="draft"` until the developer approves them.

## Traceability

- Every requirement should `satisfies` a goal or scenario (otherwise it is an
  orphan — the coverage report will say so).
- `implements` edges run code → requirement; `verifiedBy` runs requirement →
  test. Record both with `rqml link`, never manually.
- Cross-document references use doc locators; external artifacts use external
  locators with a URI.

## Finishing

A spec-editing task is done when `rqml validate` is clean and `rqml check`
exits 0 at the project's strictness. The stop gate enforces the same thing.
