# Changelog

## 0.8.0 — Personas and model freedom

- Added encrypted bring-your-own-key providers for OpenAI, Anthropic, DeepSeek, GLM/Z.AI, and Kimi
- Added unlimited custom OpenAI-compatible endpoints with editable base URLs
- Routed streaming chat, consultations, workflows, review, and Web Harness through each bot's selected provider
- Added an original animated persona system with six configurable identities and seven colorways
- Added provider-aware bot profiles, readiness indicators, API tests, and local/cloud route disclosure
- Kept credentials out of application state, portable bot definitions, Shared Ledger files, exports, and Git
- Added migration support so existing Ollama bots continue working without reconfiguration

## 0.7.0 — Local decision intelligence

- Added Laya as an open-weight local System 1 decision provider
- Added per-bot decision provider selection: workspace, Auto, Laya, Jev, or Rules
- Added one-click isolated Laya runtime installation and typed-decisions model preparation
- Added lazy local service startup, CPU thread limits, and idle shutdown
- Added confidence thresholds with provider fallback and durable provenance
- Added provider readiness, device, model, progress, and fallback visibility
- Added live Jev-compatible System One contract tests and per-bot routing tests

## 0.6.0 — Web Harness

- Added a persistent, local browser agent powered by any configured Ollama bot
- Added compact numbered page maps and delta-only snapshots to reduce context use
- Added per-site Markdown navigation memory inside the selected workspace
- Added explicit Chrome/Edge CDP connection for user-started debugging sessions
- Added bounded step budgets, cancellation, and visible action history
- Added approval gates for consequential actions and manual handoff for verification challenges
- Added browser safety and snapshot-compression tests

## 0.5.0 — Harness and decision layer

- Added an automatic four-role starter team using the first installed Ollama model
- Added typed plan and result gates with Auto, Local, and Jev modes
- Added optional Jev integration with Windows-encrypted API key storage
- Added a zero-token deterministic fallback when Jev is not configured or unavailable
- Added a live decision trail and durable decision records for every workflow
- Made decision logs atomic under parallel worker completion

## 0.4.0 — Skepo

- Renamed LocalBot to Skepo
- Added the Skepo visual identity and Windows application branding
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
