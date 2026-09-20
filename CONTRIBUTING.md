# Contributing to Skepo

Skepo welcomes focused issues and pull requests that improve local-first AI workflows.

## Before opening a pull request

1. Keep normal application use local. New network services must be opt-in and clearly disclosed.
2. Preserve the readable Markdown files as the Shared Ledger source of truth.
3. Avoid adding a required database, embedding service, or telemetry SDK.
4. Run `pnpm typecheck`, `pnpm test`, and `pnpm build:dir`.
5. Include screenshots for visible interface changes and tests for reusable logic.

## Good first contribution areas

- Rebuild `index.json` from Markdown frontmatter
- Add file watching for externally edited work cards
- Improve lexical scoring for source code symbols
- Add conflict and decision record cards
- Add import/export for portable workspaces

Please avoid bundling model weights or committing real conversation histories.
