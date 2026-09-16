import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentName, processPollCycle } from '../src/lib/poll-cycle.js';
import type { GitHubFetcher, PRInfo, InvokePi, State, ReviewComment } from '../src/types.js';

const pr: PRInfo = {
  owner: 'acme',
  repo: 'myapp',
  number: 42,
  title: 'Add feature X',
  description: 'This PR adds feature X',
  url: 'https://github.com/acme/myapp/pull/42',
  headSha: 'abc123',
};

const emptyState: State = {
  seenCommentIds: [],
  seenReviewIds: [],
  seenCIFailureIds: [],
};

const makeReviewComment = (id: number, reviewId: number): ReviewComment => ({
  id,
  pull_request_review_id: reviewId,
  in_reply_to_id: null,
  body: `comment ${id}`,
  path: 'src/foo.ts',
  line: 10,
  original_line: 10,
  user: { login: 'reviewer' },
  html_url: `https://github.com/acme/myapp/pull/42#discussion_r${id}`,
  diff_hunk: '@@ -1,3 +1,4 @@\n context',
});

const makeIssueComment = (id: number) => ({
  id,
  body: `issue comment ${id}`,
  user: { login: 'reviewer' },
  html_url: `https://github.com/acme/myapp/pull/42#issuecomment-${id}`,
});

const makeReview = (id: number, state = 'CHANGES_REQUESTED') => ({
  id,
  state,
  body: null,
  user: { login: 'reviewer' },
  submitted_at: '2024-01-01T00:00:00Z',
});

function makeFetcher(overrides: Partial<GitHubFetcher> = {}): GitHubFetcher {
  return {
    getPR: vi.fn().mockResolvedValue(pr),
    listReviewComments: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    listReviews: vi.fn().mockResolvedValue([]),
    listCIFailures: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('processPollCycle', () => {
  let invokePi: InvokePi;

  beforeEach(() => {
    invokePi = vi.fn().mockResolvedValue(undefined);
  });

  it('does not invoke pi when there are no new comments', async () => {
    const fetcher = makeFetcher();
    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');
    expect(invokePi).not.toHaveBeenCalled();
  });

  it('invokes pi once for a standalone issue comment', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });

    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(1);
  });

  it('invokes pi once for a review with 3 inline comments', async () => {
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([
        makeReviewComment(1, 99),
        makeReviewComment(2, 99),
        makeReviewComment(3, 99),
      ]),
      listReviews: vi.fn().mockResolvedValue([makeReview(99)]),
    });

    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(1);
  });

  it('uses the deterministic Herdr agent name, session ID, and address-pr-comments skill', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });
    const expectedAgentName = 'loops-pr-42-bcf2abe9';
    const expectedSessionId = `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;

    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledWith(
      expectedAgentName,
      expectedSessionId,
      'address-pr-comments',
      expect.any(String),
      '/cwd',
    );
  });

  it('uses the same agent name and session ID on a second invocation', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });
    const expectedAgentName = 'loops-pr-42-bcf2abe9';
    const expectedSessionId = `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
    const state: State = { ...emptyState };

    await processPollCycle(fetcher, pr, state, invokePi, '/cwd');
    await processPollCycle(
      makeFetcher({ listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(11)]) }),
      pr,
      { ...emptyState, seenCommentIds: [10] },
      invokePi,
      '/cwd',
    );

    expect(invokePi).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = (invokePi as ReturnType<typeof vi.fn>).mock.calls;
    expect(firstCall[0]).toBe(expectedAgentName);
    expect(firstCall[1]).toBe(expectedSessionId);
    expect(secondCall[0]).toBe(expectedAgentName);
    expect(secondCall[1]).toBe(expectedSessionId);
  });

  it('keeps Herdr agent names within the 32-character limit', () => {
    expect(
      agentName({
        ...pr,
        owner: 'an-extremely-long-organisation-name',
        repo: 'an-even-longer-repository-name-than-usual',
        number: Number.MAX_SAFE_INTEGER,
      }),
    ).toMatch(/^[a-z][a-z0-9_-]{0,31}$/);
  });

  it('returns updated state with newly seen comment IDs', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10), makeIssueComment(11)]),
    });

    const result = await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(result.state.seenCommentIds).toContain(10);
    expect(result.state.seenCommentIds).toContain(11);
  });

  it('returns poll metadata', async () => {
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([
        makeReviewComment(1, 10),
        makeReviewComment(2, 10),
      ]),
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(11)]),
      listReviews: vi.fn().mockResolvedValue([makeReview(10)]),
    });

    const result = await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(result.newCommentCount).toBe(3);
    expect(result.dispatchedAgentCount).toBe(1);
  });

  it('does not re-process comments seen in a previous cycle', async () => {
    const state: State = { ...emptyState, seenCommentIds: [10] };
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });

    await processPollCycle(fetcher, pr, state, invokePi, '/cwd');

    expect(invokePi).not.toHaveBeenCalled();
  });

  it('ignores issue comments from configured agent accounts', async () => {
    const ignoredComments = ['linear-code', 'github-actions', 'readme-ai-writer'].map((login, index) => {
      const comment = makeIssueComment(10 + index);
      comment.user = { login };
      return comment;
    });
    const humanComment = makeIssueComment(20);
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([...ignoredComments, humanComment]),
    });

    const result = await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(1);
    const prompt = (invokePi as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(prompt).toContain('**Comment ID:** 20');
    expect(prompt).not.toContain('**Comment ID:** 10');
    expect(prompt).not.toContain('**Comment ID:** 11');
    expect(prompt).not.toContain('**Comment ID:** 12');
    expect(result.state.seenCommentIds).toEqual([10, 11, 12, 20]);
    expect(result.skippedIgnoredCommentCount).toBe(3);
  });

  it('does not invoke pi for issue comments marked as an agent response', async () => {
    const agentComment = makeIssueComment(10);
    agentComment.body = '(agent response)\nFixed this in the latest commit.';
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([agentComment]),
    });

    const result = await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).not.toHaveBeenCalled();
    expect(result.state.seenCommentIds).toContain(10);
    expect(result.skippedAgentResponseCount).toBe(1);
  });

  it('ignores reviews from configured agent accounts case-insensitively', async () => {
    const review = makeReview(99);
    review.user = { login: 'GitHub-Actions' };
    const reviewComment = makeReviewComment(10, 99);
    reviewComment.user = { login: 'GitHub-Actions' };
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([reviewComment]),
      listReviews: vi.fn().mockResolvedValue([review]),
    });

    const result = await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).not.toHaveBeenCalled();
    expect(result.state.seenCommentIds).toContain(10);
    expect(result.skippedIgnoredCommentCount).toBe(1);
  });

  it('actions a human follow-up on a review created by an ignored agent', async () => {
    const originalComment = makeReviewComment(10, 99);
    originalComment.user = { login: 'github-actions' };
    const humanReply = makeReviewComment(11, 99);
    humanReply.in_reply_to_id = 10;
    const review = makeReview(99);
    review.user = { login: 'github-actions' };
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([originalComment, humanReply]),
      listReviews: vi.fn().mockResolvedValue([review]),
    });
    const state: State = { ...emptyState, seenCommentIds: [10] };

    await processPollCycle(fetcher, pr, state, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(1);
    const prompt = (invokePi as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(prompt).toContain('**Comment ID:** 11');
  });

  it('does not invoke pi for review batches marked as an agent response', async () => {
    const agentReviewComment = makeReviewComment(10, 99);
    agentReviewComment.body = '(agent response)\nHandled these review comments.';
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([agentReviewComment]),
      listReviews: vi.fn().mockResolvedValue([makeReview(99)]),
    });

    const result = await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).not.toHaveBeenCalled();
    expect(result.state.seenCommentIds).toContain(10);
    expect(result.skippedAgentResponseCount).toBe(1);
  });

  it('passes the prompt containing PR title and URL to pi', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });

    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    const prompt = (invokePi as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(prompt).toContain(pr.title);
    expect(prompt).toContain(pr.url);
  });

  it('passes full inline thread context and marks old versus new comments', async () => {
    const originalComment = makeReviewComment(10, 99);
    originalComment.body = 'original concern';
    const newReply = makeReviewComment(11, 99);
    newReply.body = 'new reply with important context';
    newReply.in_reply_to_id = 10;
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([originalComment, newReply]),
      listReviews: vi.fn().mockResolvedValue([makeReview(99)]),
    });
    const state: State = { ...emptyState, seenCommentIds: [10] };

    await processPollCycle(fetcher, pr, state, invokePi, '/cwd');

    const prompt = (invokePi as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(prompt).toContain('**Thread status:** OLD thread context');
    expect(prompt).toContain('**Body:** original concern');
    expect(prompt).toContain('**Thread status:** NEW comment to action');
    expect(prompt).toContain('**Body:** new reply with important context');
  });

  it('still invokes pi when an old thread comment is an agent response but the new reply is not', async () => {
    const originalComment = makeReviewComment(10, 99);
    originalComment.body = '(agent response)\nPrevious agent reply.';
    const newReply = makeReviewComment(11, 99);
    newReply.body = 'human follow-up';
    newReply.in_reply_to_id = 10;
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([originalComment, newReply]),
      listReviews: vi.fn().mockResolvedValue([makeReview(99)]),
    });
    const state: State = { ...emptyState, seenCommentIds: [10] };

    await processPollCycle(fetcher, pr, state, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(1);
  });

  it('dispatches a failing CI check for the PR current head commit', async () => {
    const fetcher = makeFetcher({
      getPR: vi.fn().mockResolvedValue({ ...pr, headSha: 'current123' }),
      listCIFailures: vi.fn().mockResolvedValue([
        {
          id: 'check:123',
          name: 'test',
          conclusion: 'failure',
          detailsUrl: 'https://github.com/acme/myapp/actions/runs/123',
          title: 'Tests failed',
          summary: '2 tests failed',
          text: 'Expected 200, received 500',
        },
      ]),
    });

    const result = await processPollCycle(
      fetcher,
      { ...pr, headSha: 'stale123' },
      emptyState,
      invokePi,
      '/cwd',
    );

    expect(fetcher.listCIFailures).toHaveBeenCalledWith('acme', 'myapp', 'current123');
    expect(invokePi).toHaveBeenCalledTimes(1);
    const prompt = (invokePi as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(prompt).toContain('## Failing CI to Action');
    expect(prompt).toContain('**Check:** test');
    expect(prompt).toContain('**Summary:** 2 tests failed');
    expect(prompt).toContain('Expected 200, received 500');
    expect(result.newCIFailureCount).toBe(1);
    expect(result.state.seenCIFailureIds).toEqual(['check:123']);
  });

  it('batches failing CI and new comments into one pi message', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
      listCIFailures: vi.fn().mockResolvedValue([
        {
          id: 'status:456',
          name: 'ci/build',
          conclusion: 'error',
          detailsUrl: 'https://ci.example.com/build/456',
          title: null,
          summary: 'Build infrastructure error',
          text: null,
        },
      ]),
    });

    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(1);
    const prompt = (invokePi as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(prompt).toContain('**Comment ID:** 10');
    expect(prompt).toContain('**Check:** ci/build');
  });

  it('does not re-dispatch a previously seen CI failure', async () => {
    const fetcher = makeFetcher({
      listCIFailures: vi.fn().mockResolvedValue([
        {
          id: 'check:123',
          name: 'test',
          conclusion: 'failure',
          detailsUrl: null,
          title: null,
          summary: null,
          text: null,
        },
      ]),
    });
    const state = {
      ...emptyState,
      seenCIFailureIds: ['check:123'],
    };

    const result = await processPollCycle(fetcher, pr, state, invokePi, '/cwd');

    expect(invokePi).not.toHaveBeenCalled();
    expect(result.newCIFailureCount).toBe(0);
  });

  it('batches different reviews and issue comments into one pi message', async () => {
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([
        makeReviewComment(1, 10),
        makeReviewComment(2, 20),
      ]),
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(3)]),
      listReviews: vi.fn().mockResolvedValue([makeReview(10), makeReview(20)]),
    });

    const result = await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(1);
    const prompt = (invokePi as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    expect(prompt).toContain('**Review ID:** 10');
    expect(prompt).toContain('**Review ID:** 20');
    expect(prompt).toContain('**Comment ID:** 3');
    expect(result.dispatchedAgentCount).toBe(1);
  });
});
