# Reading Path: index first, evidence next

Status: proposed experiment, not implemented or benchmarked.

The user released Skepo's InfraCanvas dependency on 2026-10-22. Skepo is
the current development priority; InfraCanvas is held for user-led merges,
conflict resolution, and testing.

## Proposed flow

1. Build a local hierarchical index from source headings, page references,
   tables and stable section IDs. Preserve source hashes and original evidence.
2. Look up topics using deterministic indexed search before calling a model.
3. Fetch a bounded evidence packet with definitions, relevant sections,
   exceptions, citations and unresolved questions. Expand coverage when needed.
4. Optionally use a stronger model to plan a complex reading/writing task;
   reuse the resulting explicit brief, not hidden reasoning or model weights.
5. Route bounded extraction, formatting or note updates to a smaller model
   only when evaluations support that task/model combination.
6. Validate citations, required fields and contradictions. Expand retrieval,
   escalate to a stronger model or abstain if evidence is inadequate.
7. Store revision-aware bookmarks and invalidate dependent notes when their
   sources change. HTML is a safe human-facing view; Markdown is the short
   handoff; SQLite is the intended canonical structured record store.

## Distinctive experiment: reading receipts

Record which source revisions and sections support each note or claim,
which exceptions were checked, what remains unread, and why a model was
selected. On a later task, refresh only affected evidence and dependent
claims. Missing evidence must remain visible, not hidden by a summary.

## Constraints

- 1B/2B/3B refers to model parameter counts, not tokens or parameters per second.
- Ordinary prompts do not train weights. Arbitrarily activating a subset of a
  dense model is not a supported optimization. MoE routing is model-defined.
- Cross-model handoffs use text/structured evidence; do not assume KV caches
  transfer across different models. Model residency is not prompt caching.
- Use the user's configured/installed models; do not download models silently.
- API-only, local-only and mixed modes share the same evidence protocol.
  Never escalate private local data to a cloud provider without permission.
- Retrieved content is untrusted evidence, never permission to execute actions.
- Laya/Jev can support bounded decisions; they are not general writing models
  or reliable sole judges of factual correctness.
- This combines known retrieval, routing and caching ideas. No novelty or
  guaranteed lossless quality claim is made.

## Evaluation before enabling defaults

Compare a strong-model baseline with indexed strong-model retrieval and the
adaptive small/strong pipeline. Include long documents, cross-section questions,
changed sources, exceptions, unsupported questions and malicious document text.
Measure factual/citation correctness, omissions, task completion, cold and warm
latency, actual provider token usage, RAM/VRAM, model-switch overhead and total
cost including preparation, retries and verification. Use held-out tasks and
human review; self-reported model confidence alone is not an acceptance gate.

Integrate incrementally with milestones 2–6 after provider correctness and
baseline measurement. A fixed one-or-two-call preparation budget is not assumed
to suffice for arbitrarily large documents.
