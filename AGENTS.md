# AGENTS.md — loops

`loops` is a TypeScript CLI for long-lived, on-demand agent loops. Each subcommand monitors something (a PR, an issue, a CI run) and autonomously actions new events via pi agent sessions.

## Running

```bash
loops <subcommand> [args]
```

The binary is a thin shell wrapper (`bin/loops`) that delegates to `tsx src/index.ts`. No build step required.

## Architecture

```
src/
  index.ts              — Commander entry point; registers all subcommands
  commands/
    pr-watch.ts         — `loops pr-watch <pr-url>` implementation
  lib/
    github.ts           — Octokit-backed GitHubFetcher + parsePRUrl
    grouping.ts         — Pure comment grouping logic (groupNewComments, extractNewCommentIds)
    pi.ts               — invokePi: spawns `pix --session-id <session-id> <window-name> "/skill:address-pr-comments <prompt>"`
    poll-cycle.ts       — processPollCycle: fetches, groups, invokes pi, returns updated state
    prompt.ts           — buildPrompt: constructs the structured pi prompt for a comment batch
    state.ts            — loadState / saveState: JSON persistence at ~/.loops/state/
  types.ts              — All shared types (State, PRInfo, CommentBatch, GitHubFetcher, InvokePi, …)
skills/
  address-pr-comments/
    SKILL.md            — Skill loaded into each pi invocation for pr-watch
tests/
  state.test.ts         — State persistence tests
  grouping.test.ts      — Comment grouping logic tests
  poll-cycle.test.ts    — Poll cycle integration tests (pi is mocked)
```

## GitHub auth

Octokit auth is resolved in this order:
1. `GITHUB_TOKEN` env var
2. `gh auth token` (requires `gh auth login`)

If neither is available, the CLI throws with a clear error message.

## State files

State is persisted per-PR at:
```
~/.loops/state/pr-{owner}-{repo}-{number}.json
```

Schema:
```json
{
  "seenCommentIds": [123, 456],
  "seenReviewIds": [789]
}
```

The file is created on first run and updated after each batch is handed to pi. Restarting the process will not re-process already-seen comments.

## pi invocation

Each comment batch becomes one pix invocation:
```
pix --session-id loops-pr-{owner}-{repo}-{number} loops-pr-{owner}-{repo}-{number} "/skill:address-pr-comments <structured prompt>"
```

The session ID is deterministic per PR, so each dispatched pi agent continues the same session. The window name is also deterministic per PR. If a window already exists, pix creates a suffixed window.

The `address-pr-comments` skill should be installed as a pi skill from `skills/address-pr-comments/SKILL.md`.

## Adding a new subcommand

1. Create `src/commands/{name}.ts` exporting an async action function.
2. Register it in `src/index.ts` with `program.command(...)`.
3. Add a `GitHubFetcher`-style interface to `src/types.ts` if you need injectable fetchers for testing.
4. Add tests under `tests/`.

The `processPollCycle` pattern in `src/lib/poll-cycle.ts` is the recommended shape: pure fetcher interface, injectable `invokePi`, returns updated state. This keeps the polling loop unit-testable without hitting GitHub or spawning pi.

## Tests

```bash
npm test          # vitest run (single pass)
npm run typecheck # tsc --noEmit
```

Tests mock both Octokit (via the `GitHubFetcher` interface) and pi invocation (via the `InvokePi` injectable). No real network calls or pi sessions are made during tests.
