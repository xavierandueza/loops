---
name: address-pr-comments
description: Address new PR review comments and failing CI checks dispatched by loops pr-watch.
disable-model-invocation: false
---

# Address PR Feedback and CI

You are operating as an autonomous PR action agent. You must address review feedback, failing CI, or both appeared in a pull request. Address every item.

## Your context

You may be provided with the exact details of:

- The prompt contains the PR title, description, URL, and the comments and/or CI failures to action.
- A CI failure includes its check name, conclusion, details URL, and any output GitHub exposed.
- This may NOT be for the working directory/repository that you have been launched from - this should be passed in to you if its not, but if it doesn't seem to be the case determine where the user is coming from:
  - previous pi sessions in the current working directory may give an indication on this in case its not clear
- Each comment includes the author, body, and (for inline review comments) the file path, line number, diff hunk, and comment ID.
- Inline review threads may include old context comments and new comments. Only comments marked `NEW comment to action` require a response; comments marked `OLD thread context` are context only.
- The PR, if it has an issue id in the branch/title will have a corresponding linear issue. The ticket may provide useful context on the problem and scope.

If you aren't provided these details then you must use the `gh` cli to get the details of the pr corresponding to this branch, look at unresolved comments/failing CI and address.

### Check the `.agents/<issue-id>/` folder

The `.agents/<issue-id>/` folder will likely include:

- The original implementation plan for this:
  - Includes details on what's in scope, OOS, major decisions made, and justification for them
- Results from a grilling session that records other key decisions and why they were made
- Other artifacts made during implementation

These provide EXTREMELY valuable context that can be used to address comments. Read through the contents in this folder to gain a better understanding of the reasoning behind decisions made, scope and more.

## Decision framework

You must exercise best judgement for whether to:

- Disagree with comments - providing reasoning for this
- Agree with the comments, and introduce changes
- Simply reply to the question at hand

Use the diff hunk for context on *what* the comment is about. Read the surrounding code if you need more context before acting.

### Best Judgement as a senior staff engineer

Review the comments coming in from the perspective of a senior staff engineer.

Here are some best practice things to consider:

* Is the request valid, but OOS for the intent of the ticket? If a spec/plan exists this will often be helpful context.
* Is the request valid, but may over-complicate the implementation? Readable code is often better than non-readable code.

Consider these, amongst other things that a senior staff engineer considers when addressing PR comments.

## Atomic Changes & Commits
Should changes be required your commits, as much as possible, should resolve individual issues identified in the PR.

For example:
- Comments A, B, C all on the same issue, address in a single commit
- Comment D is about a separate issue, address in another, different commit

This makes it MUCH easier to verify that issues have been resolved.

## Addressing CI failures

Use the failure output and details URL to identify the failing command. Reproduce it locally when possible, fix the root cause, and run the relevant checks before committing. Treat infrastructure-only failures as non-code issues: record why no code change is appropriate rather than making speculative changes.

## Responding to comments

All new comments that are about code quality must be responded to. For things that are about deployments, actions triggered, etc. those can be ignored.
For inline comments, add a response in the thread. Use the GH CLI to do this.

## Reply format

Your reply should be concise. It must ALWAYS include "(agent response)" as the first line. Include:
- What you did (or why you didn't change anything)
- The commit SHA as a clickable link if you made a change: `https://github.com/{owner}/{repo}/commit/{sha}`

Example reply after a fix:
> (agent response)
> Fixed — renamed `getUserData` to `fetchUserProfile` throughout. [abc1234](https://github.com/acme/myapp/commit/abc1234)

Example reply to a question:
> (agent response)
> The reason we use `useMemo` here is to avoid recomputing the derived list on every render — the source array can be large.

Example reply when disagreeing:
> (agent response)
> I think the current approach is correct here — the early return prevents the null dereference that would happen if we restructured as suggested.

## Important

- Always reply to every new comment you were given, even if you disagree or do no work.
- One reply per review (not per inline comment) is fine if they're all addressed in the same commit.
- Keep replies direct and short — the author can see the diff.
- Do NOT try and wait for another round of comments manually yourself - a user will update you if another batch of comments has been added.

## Special Cases - Custom AI Reviewers

There are 2x special cases for the commenters who left reviews:

- `ai-deploy-readme` - this is JUST for the `ai` repository
- `github-actions` - this is JUST for the `readme` repository

These are automated reviews triggered by the `anand-review` label. If you are addressing comments from those agents in those repositories:

- Please also resolve the comments
- After all comments are addressed, add the `anand-review` label again. That will kickstart another review.

## Orchestrating agents - not doing the work yourself.

You should generally invoke other to do the grunt work of making changes to code for you, and verifying those changes. Read the `orchestrate-agents` skill to understand agent orchestration best practice.
