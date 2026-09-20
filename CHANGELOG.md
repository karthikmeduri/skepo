# Changelog

## 0.4.0 — Skepo

- Renamed LocalBot to Skepo
- Added the Skepo identity: skep for the shared hive, O for organization and orchestration
- New workspaces now use `.skepo-ledger`
- Preserved compatibility with existing `.localbot-ledger` workspaces
- Added automatic import of previous LocalBot application state
- Updated Windows application identity and installer naming

## 0.3.0 — Execution Board

- Added broker-driven autonomous multi-bot workflows
- Added validated dependency graphs and bounded parallel execution
- Added atomic versioned manifests and task Markdown files
- Added task leases, retries, blocked states, pause, cancellation, and restart recovery
- Added task, token, parallelism, retry, and time budgets
- Added human plan approval and deterministic risky-action checkpoints
- Added final reviewer synthesis and ledger capture
- Added portable `workspace.json` and `bots.json`
- Added recursive workspace file watching
- Added durable orchestration tests

## 0.2.0 — Shared Ledger

- Added user-selected workspace storage on any local drive
- Added Markdown work cards and per-bot `CURRENT.md` briefs
- Added transparent, embedding-free relevance scoring
- Added explicit bot-to-bot consultation and durable handoffs
- Added Shared Ledger activity interface and first-run setup
- Removed the remote font dependency for fully local operation

## 0.1.0

- Initial Windows desktop release
- Ollama model discovery, download, and deletion
- Streaming chat, custom bots, searchable history, and export
