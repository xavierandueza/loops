# loops-pr-watch: Autonomous PR Comment Agent

## Problem

When a pull request receives review comments, acting on them is a context-switching interruption. An engineer (or outer agent) must read the comment, understand the diff context, make the change, commit, push, and reply — for every comment. This is mechanical enough to delegate, but currently there is no tool to do it. The `loops` CLI provides an on-demand watcher that monitors a PR for new comments and autonomously actions them via a dedicated pi agent session.

## Success criteria

1. Running `loops pr-watch <pr-url>` from a project repo root begins polling that PR for new comments every 30 seconds
2. State is persisted at `~/.loops/state/pr-{owner}-{repo}-{number}.json` — restarting the process does not re-process already-seen comments
3. Review comments belonging to the same GitHub review (same `pull_request_review_id`) are batched and passed to pi as a single invocation
4. Standalone PR issue comments are passed to pi individually
5. Each pi invocation uses a deterministic session ID (`loops-pr-{owner}-{repo}-{number}`), creating the session on first run and resuming it on subsequent runs
6. pi receives: PR metadata (title, description, URL), the full previous comment thread history, and the new comment(s) being actioned
7. pi runs in the project repo cwd (where `loops pr-watch` was invoked), with the pr-review skill loaded
8. pi commits any code changes directly to the PR branch and pushes
9. For review comment replies, pi posts via `gh api POST /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies`
10. For top-level PR comment replies, pi posts via `gh pr comment`
11. The `agents` repo contains a skill documenting the `loops` CLI and how to invoke `pr-watch`

## Out of scope

- Watching multiple PRs simultaneously from a single process
- Adaptive polling intervals
- Webhook-based triggering (no server, no ngrok)
- Creating or updating the PR itself (title, labels, assignees)
- Handling PR review approvals or requesting re-review
- Any loop type other than `pr-watch` (issue-watch, ci-watch etc. are future subcommands)
- Auth token management — assumes `gh auth login` is already configured

## Implementation decisions

**Repository:** A new standalone repo at `~/projects/loops`. Nix setup is responsible for cloning this repo, running `npm install`, and symlinking the `loops` binary onto `$PATH`. The `agents` repo has no code dependency on `loops` — the connection is via PATH convention.

**Language and runtime:** TypeScript, run via `tsx` (no build step). Octokit (`@octokit/rest`) for all GitHub API calls. Auth delegated to `gh`'s token via the `gh auth token` output. 

**CLI shape:** Single `loops` binary using a subcommand pattern (e.g. via `commander`). Entry: `loops pr-watch <pr-url>`. Designed to accept additional subcommands in future without structural change.

**State file schema:**
```json
{
  "seenCommentIds": [123, 456],
  "seenReviewIds": [789]
}
```
Stored at `~/.loops/state/pr-{owner}-{repo}-{number}.json`. Created on first run, updated after each batch is handed to pi.

**Deterministic session ID:** `loops-pr-{owner}-{repo}-{number}`. Passed to pi via `--session-id`. pi creates the session on first invocation, resumes on all subsequent ones.

**Comment grouping logic:**
- Fetch both review comments (`GET /pulls/{number}/comments`) and issue comments (`GET /issues/{number}/comments`) each poll cycle
- Filter to IDs not in `seenCommentIds`
- For review comments: group by `pull_request_review_id`. Only emit a group once the parent review object has a submitted state (not pending)
- For issue comments: emit individually
- Each group/individual comment → one pi invocation

**pi invocation shape:**
```
pi -p \
  --session-id loops-pr-{owner}-{repo}-{number} \
  --skill ~/.loops/skills/pr-review/SKILL.md \
  "<structured prompt>"
```
Structured prompt includes: PR title, description, URL, full comment thread history for context, and the new comment(s) being actioned (with author, body, file+line for inline comments, review verdict for review submissions).

**pi reply strategy (encoded in pr-review skill):**
- Review comment thread → `gh api repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies -f body="..."`
- Top-level issue comment → `gh pr comment {number} --body "..."`
- Reply body always includes: what was done (or why it wasn't), commit SHA if a change was made

**pi commit strategy (encoded in pr-review skill):**
- Make code changes in the cwd (project repo root)
- `git add -A && git commit -m "Address review: <brief summary>"`
- `git push`
- Then post reply with the SHA if changes made (make sure its a link they can click to review that exact commit)

**Agent behaviour (pr-review skill):** pi uses full judgment. The skill establishes context and instructs pi to: analyze the comment, action it if it's a clear directive, answer if it's a question, and push back with reasoning if it disagrees. No rigid heuristic categories — monitor over time and encode rules if inconsistency emerges.

**Skill placement:**
- `loops` repo: `skills/pr-review/SKILL.md` — the actionable skill loaded into each pi invocation. Contains reply strategy, commit strategy, and judgment guidance.

## Proposed test seams

Note - testing pi behaviour and results isn't in scope for these changes, we should test that we're invoking pi, but those should be dead sessions if that makes sense.

However there should be automated tests that we do get the right events and would invoke pi in those situations.

1. **State persistence** — run `loops pr-watch`, let it process one comment, kill and restart the process, verify the already-seen comment is not re-processed (traces to criterion 2)
2. **Review comment grouping** — create a GitHub review with 3 inline comments, verify pi is invoked once with all 3, not three times (traces to criterion 3)
3. **Standalone comment** — post a regular PR comment, verify pi is invoked once with just that comment (traces to criterion 4)
4. **Session resumption** — verify second pi invocation for the same PR reuses the same session file (traces to criterion 5)

## Further notes

- `loops` repo should have its own `AGENTS.md` covering the CLI structure, Octokit auth pattern, and how to add new subcommands — so future agents can extend it cleanly
- The `agents` repo skill for `loops` should be minimal: what the tool does, how to invoke it, and nothing about implementation internals
- Polling at 30s with Octokit hitting 2-3 endpoints per cycle is well within GitHub's 5,000 req/hour authenticated rate limit, even across multiple concurrent terminal sessions
- `gh auth token` can be used to seed `GITHUB_TOKEN` if Octokit doesn't pick it up automatically via environment
