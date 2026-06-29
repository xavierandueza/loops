import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPollCycle } from '../src/lib/poll-cycle.js';
import type { GitHubFetcher, PRInfo, InvokePi, State } from '../src/types.js';

const pr: PRInfo = {
  owner: 'acme',
  repo: 'myapp',
  number: 42,
  title: 'Add feature X',
  description: 'This PR adds feature X',
  url: 'https://github.com/acme/myapp/pull/42',
};

const emptyState: State = { seenCommentIds: [], seenReviewIds: [] };

const makeReviewComment = (id: number, reviewId: number) => ({
  id,
  pull_request_review_id: reviewId,
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

  it('uses the deterministic window name, session ID, and address-pr-comments skill for every invocation', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });
    const expectedWindowName = `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
    const expectedSessionId = `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;

    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledWith(
      expectedWindowName,
      expectedSessionId,
      'address-pr-comments',
      expect.any(String),
      '/cwd',
    );
  });

  it('uses the same window name and session ID on a second invocation', async () => {
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });
    const expectedWindowName = `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
    const expectedSessionId = `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
    const state: State = { seenCommentIds: [], seenReviewIds: [] };

    await processPollCycle(fetcher, pr, state, invokePi, '/cwd');
    await processPollCycle(
      makeFetcher({ listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(11)]) }),
      pr,
      { seenCommentIds: [10], seenReviewIds: [] },
      invokePi,
      '/cwd',
    );

    expect(invokePi).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = (invokePi as ReturnType<typeof vi.fn>).mock.calls;
    expect(firstCall[0]).toBe(expectedWindowName);
    expect(firstCall[1]).toBe(expectedSessionId);
    expect(secondCall[0]).toBe(expectedWindowName);
    expect(secondCall[1]).toBe(expectedSessionId);
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
    expect(result.dispatchedAgentCount).toBe(2);
  });

  it('does not re-process comments seen in a previous cycle', async () => {
    const state: State = { seenCommentIds: [10], seenReviewIds: [] };
    const fetcher = makeFetcher({
      listIssueComments: vi.fn().mockResolvedValue([makeIssueComment(10)]),
    });

    await processPollCycle(fetcher, pr, state, invokePi, '/cwd');

    expect(invokePi).not.toHaveBeenCalled();
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

  it('invokes pi separately for two different reviews', async () => {
    const fetcher = makeFetcher({
      listReviewComments: vi.fn().mockResolvedValue([
        makeReviewComment(1, 10),
        makeReviewComment(2, 20),
      ]),
      listReviews: vi.fn().mockResolvedValue([makeReview(10), makeReview(20)]),
    });

    await processPollCycle(fetcher, pr, emptyState, invokePi, '/cwd');

    expect(invokePi).toHaveBeenCalledTimes(2);
  });
});
