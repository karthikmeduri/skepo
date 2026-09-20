# Skepo

Skepo is a private Windows workspace for organizing teams of AI agents powered by models installed through [Ollama](https://ollama.com/). The name combines **skep**—a traditional beehive—with **O** for organization, orchestration, and continuity. Prompts, agent settings, and chat history stay on the computer.

## Features

- Create multiple bots with custom names, prompts, colors, and generation settings
- Discover locally installed Ollama models
- Download and delete Ollama models with live progress
- Stream chat responses and stop or regenerate output
- Markdown, tables, code blocks, copy actions, and response speed
- Search, export, and delete conversations
- Choose any local drive or folder for shared bot knowledge
- File-native Shared Ledger with Markdown work cards and per-bot current-state briefs
- Transparent local keyword scoring instead of embeddings or a vector database
- Explicit bot-to-bot consultations saved as durable handoff files
- Autonomous Execution Board with broker planning and dependency-aware workers
- Atomic manifests, task leases, bounded parallelism, retries, cancellation, and recovery
- Human plan/risk approvals plus final reviewer synthesis
- Dark, light, and system themes
- Atomic local JSON persistence
- Sandboxed Electron renderer with context isolation

## Requirements

- Windows 10 or 11
- [Ollama](https://ollama.com/download/windows) running locally
- Node.js 20+ and pnpm for development

## Development

```powershell
pnpm install
pnpm dev
```

Ollama defaults to `http://127.0.0.1:11434`. Change it under **Settings** if the service runs elsewhere.

## Build the installer

```powershell
pnpm build
```

The NSIS installer is written to `release/Skepo-Setup-0.4.0.exe`.

## Shared Ledger

Choose **Shared Ledger** in the sidebar and select a folder on any local drive. Skepo creates a `.skepo-ledger` directory containing:

- `INDEX.md` — a readable activity stream
- `bots/<bot>/CURRENT.md` — each bot's recent working state
- `bots/<bot>/journal/*.md` — append-only work cards
- `handoffs/*.md` — direct bot-to-bot consultations
- `index.json` — small, rebuildable lookup metadata

When a new prompt arrives, Skepo scores note keywords, titles, recency, and cross-agent value locally. Only the best few cards enter the model context. This avoids replaying entire conversations and requires no embedding model or database.

See [docs/SHARED_LEDGER.md](docs/SHARED_LEDGER.md) for the architecture and roadmap.

## Execution Board

Open **Execution Board**, enter a goal, and assign broker, worker, and reviewer agents. The broker returns a bounded JSON task graph. Skepo validates the graph and executes only tasks whose dependencies are complete.

Every run is persisted under `.skepo-ledger/sessions/<session-id>/` with an atomic `manifest.json`, human-readable `STATE.md`, `decisions.md`, and one Markdown file per task. Runs support plan approval, deterministic risky-action flags, task leases, token/time/task budgets, safe parallelism, pause, cancellation, retries, blocked states, restart recovery, and final reviewer synthesis. Existing `.localbot-ledger` workspaces remain supported.

## Privacy model

Skepo does not include telemetry, remote fonts, or a cloud backend. It sends chat requests only to the configured Ollama URL. If that URL points to another machine, prompts travel to that machine. Application data is stored as `skepo-state.json` in Electron's Windows user-data directory. Previous LocalBot state is imported automatically. Shared Ledger files are written only to the folder selected by the user.
