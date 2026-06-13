---
description: Record an architectural decision as an ADR in .rqml/adr/ — the Design stage of the RQML process
---

Run the **Design** stage of the RQML process (https://rqml.org/docs/development-process/design): turn a design decision into a durable Architecture Decision Record. This command never writes implementation code — design precedes code.

The argument is the decision under discussion (a topic, or an ADR id/keyword to revisit). With no argument, summarize the current architecture from the existing ADRs in `.rqml/adr/`.

1. **Classify** the decision into exactly one of:
   - `required_by_spec` — directly mandated by RQML/spec rules,
   - `derived_from_requirements` — effectively forced by requirements or constraints,
   - `discretionary_design_choice` — a real choice with viable alternatives,
   - `implementation_detail` — too low-level to record.
   Only the first three are ADR-worthy. If it is an `implementation_detail`, reason about it but state plainly that no ADR is created.

2. **Assess ADR-worthiness.** A decision warrants an ADR when there are multiple plausible options, it affects architecture/workflow/behavior, it constrains future work, or it touches more than one component.

3. **Explore options** with honest pros and cons, then **recommend** a decision tied to the relevant requirement ids (`rqml show <REQ-ID>` to read them, `rqml impact <REQ-ID>` to see what the decision touches).

4. **Write the ADR** when it is ADR-worthy. Create `.rqml/adr/` if absent. Name the file `NNNN-kebab-case-slug.md` where `NNNN` is the next zero-padded number after the highest existing one. Use the canonical template:

   ```markdown
   # ADR-NNNN: Short decision title

   - Status: Accepted
   - Date: <today>
   - Classification: <one of the three ADR-worthy classes>
   - Related requirements: REQ-...
   - Related ADRs: None
   - Affected components: ...

   ## Context
   ## Decision drivers
   ## Options considered
   ## Decision
   ## Consequences
   ## Supersession
   None
   ```

   Save as `Accepted` when the decision is clear, or `Proposed` to finalize later. ADRs are **immutable once accepted** — to change one, write a new ADR that supersedes it and mark the old one `Superseded by ADR-NNNN`; never edit or delete it.

5. For a significant decision you may also record a `<decision>` element in the spec as the agent-readable summary, cross-referenced to the ADR by id. The ADR holds the long-form context.

Report the ADR path and classification. Do not implement the decision here — that is the Code stage.
