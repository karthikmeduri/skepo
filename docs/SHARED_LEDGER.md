# Shared Ledger architecture

Shared Ledger is Skepo's file-native coordination layer. It is designed for small local models, human inspection, low context use, and easy version control.

## Why it is not traditional RAG

Traditional retrieval-augmented generation usually splits documents into chunks, computes embeddings, stores vectors, and performs similarity search. That is useful for large document collections, but it adds another model, database lifecycle, opaque ranking, and hardware cost.

Shared Ledger treats agent work as structured events rather than arbitrary documents:

1. A bot completes an exchange.
2. Skepo writes one Markdown work card with the request, outcome, continuation guidance, identity, and keywords.
3. A rebuildable JSON index stores only card metadata.
4. New requests are matched using visible lexical overlap, recency, and a cross-bot bonus.
5. Only a configurable number of cards are placed in context.

The Markdown files remain the source of truth. Deleting `index.json` never destroys knowledge; a future index rebuilder can derive it again.

## On-disk protocol

```text
.skepo-ledger/
├── README.md
├── INDEX.md
├── index.json
├── workspace.json
├── bots.json
├── bots/
│   └── <name>-<id>/
│       ├── CURRENT.md
│       └── journal/
│           └── <timestamp>-<task>.md
├── handoffs/
│   └── <timestamp>-<task>.md
├── sessions/
│   └── <session-id>/
│       ├── manifest.json
│       ├── STATE.md
│       ├── decisions.md
│       └── tasks/
│           └── task-001.md
└── shared/
```

Every work card has YAML-compatible frontmatter and plain Markdown sections. This makes the protocol usable by Skepo, a text editor, Git, scripts, and other agents. Legacy `.localbot-ledger` workspaces are detected automatically.

## Token discipline

- Chat transcripts are not copied into the ledger.
- Outcomes are capped before writing.
- Retrieval defaults to four cards and is capped at eight.
- Bots do not chat continuously in the background.
- A direct consultation is user-triggered and produces one synthesized handoff.

## Autonomous execution protocol

The Execution Board uses an application-owned state machine. Models propose plans and produce task results, but they never directly mutate the manifest.

- The broker creates a bounded dependency graph.
- Skepo normalizes IDs and removes forward or invalid dependencies, guaranteeing a DAG.
- A task runs only when every dependency is complete.
- Independent ready tasks may run concurrently up to the configured limit.
- Each running task receives a time-limited lease and revision.
- Manifest and task updates are serialized and written through atomic renames.
- Token, time, task-count, retry, and parallelism budgets are enforced by code.
- Plans and deterministically detected risky actions wait for human approval.
- Failed dependencies block downstream work.
- Interrupted runs appear paused and can reclaim their stale leases.
- The reviewer reconciles completed outputs into one final result, which is also added to the Shared Ledger.

## Trust model

Ledger cards are prior work, not immutable facts. The injected instruction tells a bot to verify them against the current task. Files can be edited by the user and reviewed in Git like normal source code.

## Roadmap

- Rebuild `index.json` from Markdown frontmatter
- Rich diff views for notes changed by external tools
- Project-level goals and decision records
- Conflict cards when two bots reach incompatible conclusions
- Optional local minhash signatures for fuzzy matching without embeddings
- Selective Git commits and portable workspace bundles
- Per-task model/tool permissions for future action-capable workers
