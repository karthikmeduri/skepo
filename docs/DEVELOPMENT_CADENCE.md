# Skepo development cadence

## Priority and scope

On 2026-10-22 the user released the InfraCanvas dependency and made Skepo
the first development priority. InfraCanvas's automation is paused while the
user handles merges, conflicts and heavy testing. The existing 12-milestone
plan remains in effect; milestones are not guaranteed calendar-day deadlines.

## 2026-10-22: milestone 1 started, not complete

- Branch: `codex/provider-reliability`.
- Fixed provider timeout composition: caller cancellation no longer removes
  the configured request deadline.
- Added four mocked transport tests for timeout and cancellation propagation.
- Verification: 19 tests passed, TypeScript build/typecheck passed, Vite
  production build passed, and diff whitespace validation passed.
- The first sandboxed full test run hit localhost and temporary-file rename
  permission restrictions. The approved unrestricted local rerun passed all
  19 tests. No real provider request or paid model call was made.
- No new Windows installer or Mac artifact was produced in this slice.
- Remaining milestone 1 work: system-message preservation/deduplication,
  usage accounting, streaming-error handling, broader cancellation tests,
  and reproducible performance baselines.
- New idea recorded in `READING_PATH_EXPERIMENT.md`: index-first evidence
  retrieval, revision-aware reading receipts, and evaluated model routing.
  This architecture is proposed, not shipped.

## Milestone sequence

### 2026-10-23 scheduled run: Anthropic instruction preservation

- On `codex/provider-reliability`, preserved request-wide system messages in
  Anthropic's top-level system field instead of silently filtering them away.
  This covers broker/worker/reviewer instructions, browser controls and ledger
  context. Existing user/assistant order and caller-owned arrays are preserved.
- Three new fixture cases cover both response modes, multiple system messages,
  whitespace-only instructions and preventing user text from becoming system text.
- All 26 tests passed (Vitest reported 1.02 s); TypeScript check passed.
- Vite production build passed in 7.20 s; diff whitespace validation passed.
  These are build/test timings, not inference or machine-load benchmarks.
- Compatibility choice: these are request-wide Skepo instructions, not a new
  implementation of model-specific mid-conversation system-role semantics.
- Remaining: base-prompt deduplication, streaming errors, usage semantics for
  other providers, inference/resource benchmarks. Milestone 1 is not complete.
- No paid calls, model downloads, installer rebuild or macOS validation.
- Reference: https://platform.claude.com/docs/en/api/typescript/messages/create

### 2026-10-22 scheduled run: Anthropic usage accounting

- Implementation commit: `c05ea54`, pushed to `origin/codex/provider-reliability`.
- Fixed streaming input counts being lost when cumulative output usage arrives.
- Retained per-field cumulative usage across ping/stop events and repeated
  updates; included cache-read and cache-creation input tokens in both response
  modes. This is a token total, not a dollar-cost calculation.
- Added four fixture tests for cumulative usage, cached input, missing updates
  and non-streaming parity. All 23 tests passed; TypeScript and Vite production
  builds and whitespace checks passed. No paid API calls or model downloads.
- Local regression suite: 620 ms reported by Vitest; frontend build: 6.96 s.
  These are development-check timings, not model inference benchmarks or RAM
  measurements. Hardware/inference baselines remain unfinished.
- Reference: https://platform.claude.com/docs/en/build-with-claude/streaming
- Milestone 1 remains incomplete. System messages, streaming failures, other
  providers' usage semantics and performance measurement remain to be addressed.
- This delivery also includes the earlier uncommitted timeout fix and its four
  tests, the cadence log, and the proposed Reading Path design from this chat.
- No installer rebuild, macOS validation, or live-provider certification.

1. Provider correctness, cancellation, accounting and performance baselines.
2. SQLite memory, indexes, revisions, migrations and backups.
3. Safe HTML detail views backed by structured records.
4. Synchronized Markdown state/goal/next-action sticky notes.
5. Bounded retrieval and per-bot changes since last read.
6. Evidence provenance, stale/contradictory evidence and consultations.
7. Execution Board transaction, budget and recovery hardening.
8. Data Studio, profiles and onboarding.
9. Browser/artifact integration, portability and resource optimization.
10. Windows regression and release candidate.
11. macOS packaging and adaptations.
12. Real Windows/macOS acceptance and release candidates.
