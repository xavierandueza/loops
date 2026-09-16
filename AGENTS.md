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
    github.ts           — Octokit-backed PR feedback and CI fetcher + parsePRUrl
    grouping.ts         — Pure comment grouping logic (groupNewComments, extractNewCommentIds)
    ignored-agents.ts   — GitHub agent logins excluded from dispatch
    pi.ts               — invokePi: creates or prompts a named Pi agent through Herdr
    poll-cycle.ts       — processPollCycle: fetches, filters, batches comments and CI failures, invokes pi, returns updated state
    prompt.ts           — buildPrompt: constructs one structured pi prompt for all actionable comments and CI failures
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
  "seenReviewIds": [789],
  "seenCIFailureIds": ["check:123", "status:456"]
}
```

The file is created on first run and updated after each poll cycle. Restarting the process will not re-process already-seen comments or CI failures. Feedback from ignored agent accounts is marked seen without dispatch.

## Pi invocation

`pr-watch` must run inside a Herdr workspace. All actionable review feedback and newly failing CI found in a poll cycle are combined into one structured prompt. CI includes both GitHub check runs and legacy commit statuses for the PR's current head commit.

The first dispatch creates an unfocused Herdr tab and starts a named Pi agent with a deterministic session ID:
```
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label loops-pr-{owner}-{repo}-{number} --no-focus
herdr agent start <agent-name> --kind pi --pane <pane-id> -- --session-id loops-pr-{owner}-{repo}-{number}
```

Later dispatches target the same live agent by its deterministic Herdr name:
```
herdr agent prompt <agent-name> "/skill:address-pr-comments <structured prompt>"
```

The readable Pi session ID remains `loops-pr-{owner}-{repo}-{number}`. The Herdr agent name includes the PR number and a short repository hash so it stays within Herdr's 32-character limit. If the live agent has exited, the same Pi session ID is used when recreating it.

Agent-authored feedback from logins in `src/lib/ignored-agents.ts` is marked seen without being dispatched. The `address-pr-comments` skill should be installed as a Pi skill from `skills/address-pr-comments/SKILL.md`.

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
