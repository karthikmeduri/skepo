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

### 2026-10-31 scheduled run: cancellation before dispatch

- Already-cancelled requests now reject before credential access or network
  dispatch. A second guard after credential lookup prevents dispatch when
  cancellation or deadline expiry occurs while awaiting credentials.
- Deadline starts before credential lookup. Lookup itself is not interruptible:
  rejection waits for it to settle; this does not promise immediate cancellation
  of a hung vault or cancellation of remote billing after dispatch.
- Updated the pre-cancelled transport test and added three cases for skipped
  credential access, cancellation during lookup and deadline expiry in lookup.
- All 64 tests passed (958 ms Vitest duration), TypeScript check, frontend
  production build (3.73 s), and diff whitespace checks passed.
- No UI changes, GUI validation, paid calls, model downloads, installer rebuild,
  macOS testing or inference/resource benchmark. Tests use mocked credentials.
- Milestone 1 remains incomplete: usage requests and numeric/unknown usage
  handling, in-flight cancellation coverage and reproducible resource baselines.

### 2026-10-30 scheduled run: compatible-API stream completion and errors

- Implementation commit: `36bd00a`, pushed to `origin/codex/provider-reliability`.
- Compatible Chat Completions streams now require `[DONE]` before EOF and
  reject non-null error envelopes in both response modes, including HTTP 200.
  Envelope failures use fixed messages instead of echoing upstream payloads.
  Partial callbacks remain visible, but failures do not return ModelResults.
- Seven fixtures cover truncation (including finish_reason without DONE),
  both error response modes, final usage, no trailing newline and cleanup of
  an open error stream after partial output.
- All 61 tests passed (835 ms Vitest duration); TypeScript, frontend production
  build (3.71 s), and whitespace checks passed. No UI code changed.
- OpenAI Docs skill guided the strict terminal-marker requirement using:
  https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- Third-party gateways omitting DONE now fail closed; no live compatibility
  certification is claimed. Usage requests/accounting, numeric validation,
  unknown-versus-zero counts, cancellation and performance baselines remain.
  Milestone 1 is not complete. No resource/inference benchmark, paid API call,
  model download, installer build, GUI acceptance or macOS validation.

### 2026-10-29 scheduled run: Ollama independent usage counters

- Implementation commit: `68f1671`, pushed to `origin/codex/provider-reliability`.
- Fixed streaming token totals losing prompt counts when only output counts
  arrive, or double-counting prompt tokens when only prompt counts repeat.
  Input and output counts now retain separate cumulative values. Explicit zero
  replaces an earlier value; omitted fields preserve their respective counter.
- Four mocked regression cases cover split updates, repeated input updates,
  packets without usage, repeated output counts and explicit zero values.
- All 54 tests passed (1.02 s Vitest duration), plus TypeScript, frontend
  production build and diff whitespace validation. No UI changes or GUI tests.
- This fixes accounting, not actual inference cost/speed. No resource or live
  inference benchmark, paid call, model download, installer or macOS validation.
- Milestone 1 remains incomplete: compatible-provider truncation/error/usage
  handling, broader cancellation tests and reproducible performance baselines.
  Invalid numeric usage and unknown-versus-zero accounting remain limitations.

### 2026-10-28 scheduled run: Claude truncated-stream detection

- Implementation commit: `46ea49f`, pushed to `origin/codex/provider-reliability`.
- Claude streaming results now require `message_stop` before transport EOF
  counts as success. A content-block stop, ping or stop reason alone cannot
  mark the full message complete. Already emitted partial text remains visible,
  but truncated streams reject instead of returning successful ModelResults.
- Six mocked fixtures cover missing terminal events, partial text and reader
  unlock, and terminal usage with no trailing newline. Existing error-envelope
  and token-accounting regressions remain green.
- All 50 tests passed (985 ms Vitest duration); TypeScript, frontend production
  build and diff whitespace checks passed. These are development checks, not
  inference or resource benchmarks. No UI code changed or GUI test performed.
- No paid calls, model downloads, installer rebuild or macOS validation.
- Milestone 1 is still incomplete: compatible-provider truncation/error/usage
  semantics, broader cancellation tests and inference/resource baselines.
  Terminal-event detection does not certify answer quality or a complete SSE
  event-order validator. Non-streaming behavior is unchanged.
- Reference: https://platform.claude.com/docs/en/build-with-claude/streaming

### 2026-10-27 scheduled run: Ollama truncated-stream detection

- Implementation commit: `fab04ca`, pushed to `origin/codex/provider-reliability`.
- Ollama streaming results now require a boolean `done: true` packet before
  transport EOF can count as success. Missing, false and string-valued markers
  reject with an incomplete-output error; previously delivered text remains
  visible through callbacks but is not returned as a successful ModelResult.
- Seven fixtures cover empty/truncated streams, strict marker validation,
  partial callbacks, terminal usage and valid empty completion. Updated two
  existing transport fixtures to include valid terminal markers.
- All 44 tests passed (714 ms Vitest duration). Initial run exposed an assertion
  unavailable in installed Vitest; replaced it with supported assertions.
  TypeScript check, Vite production build (7.10 s), and whitespace checks passed.
- No inference/resource benchmark, paid API call, model download, installer,
  GUI acceptance or macOS validation was performed. No UI code changed.
- Milestone 1 remains incomplete: Claude and compatible-provider truncation,
  remaining error/usage semantics, cancellation and inference/resource baselines.
  This check confirms protocol completion, not answer quality or completeness.
- Reference: https://docs.ollama.com/api/chat

### 2026-10-26 scheduled run: Claude error envelopes

- Implementation commit: `6194364`, pushed to `origin/codex/provider-reliability`.
- Claude error envelopes now reject both streaming and non-streaming requests,
  including errors delivered with HTTP 200, instead of returning successful
  empty or partial results. Already emitted partial text cannot be withdrawn;
  subsequent chunks are not emitted and unfinished readers are cancelled.
- These envelope errors use a fixed message rather than echoing upstream error
  payloads that could contain private prompt text. This is not a claim that all
  provider error paths sanitize their messages.
- Four new fixture cases cover both response modes, errors after partial output
  with reader cleanup, and error envelopes without details.
- All 37 tests passed (Vitest duration 1.01 s); TypeScript check, Vite production
  build (6.99 s), and diff whitespace validation passed.
- These are development-check timings, not inference or memory benchmarks.
  No paid API calls, model downloads, new installer or macOS validation.
- Milestone 1 remains incomplete: truncated-stream detection, remaining provider
  error/usage semantics, broader cancellation and inference/resource baselines.
- Reference: https://platform.claude.com/docs/en/build-with-claude/streaming

### 2026-10-25 scheduled run: streaming transport cleanup

- Implementation commit: `4fd1905`, pushed to `origin/codex/provider-reliability`.
- Shared provider stream reader now cancels unfinished bodies after parser or
  consumer failures and always releases its reader lock. Cancellation failures
  do not replace the original exception. Flushes the decoder at end of stream.
- Six fixture cases cover malformed NDJSON and SSE, consumer failure with
  failing cleanup, transport failure, final packets without a newline, and
  multibyte UTF-8 characters split across chunks.
- All 33 tests passed (651 ms reported by Vitest); TypeScript check and Vite
  production build passed (7.14 s), plus diff whitespace validation.
- These timings are development checks, not inference/resource benchmarks.
  No claim that cancelling a response guarantees remote billing stops.
- Milestone 1 remains incomplete: provider error envelopes, truncated-stream
  detection, remaining usage semantics, cancellation and inference baselines.
- No paid API calls, downloads, new installer or macOS validation.

### 2026-10-24 scheduled run: workflow persona deduplication

- Implementation commit: `650697c`, pushed to `origin/codex/provider-reliability`.
- Removed duplicate base personas from broker, worker and reviewer messages.
  The provider runner still inserts each bot's base prompt; task-specific
  instructions and safety boundaries remain unchanged. No heuristic substring
  removal is applied to arbitrary user or ledger text.
- Extended the full workflow fixture to check all four model calls retain the
  base persona separately and preserve broker/worker/reviewer instructions.
  Added an Ollama request-composition fixture; existing Anthropic composition
  fixtures remain green.
- All 27 tests passed (670 ms reported by Vitest); TypeScript check and Vite
  production build passed (6.84 s); diff whitespace validation passed.
- No inference benchmark, token savings percentage, or RAM improvement is
  claimed. No paid calls, model downloads, installer or macOS build performed.
- Milestone 1 still needs streaming-error handling, remaining provider usage
  semantics, cancellation coverage and inference/resource baselines.

### 2026-10-23 scheduled run: Anthropic instruction preservation

- Implementation commit: `49ed8a5`, pushed to `origin/codex/provider-reliability`.
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
