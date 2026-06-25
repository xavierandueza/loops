import { describe, it, expect } from 'vitest';
import { groupNewComments } from '../src/lib/grouping.js';
import type { ReviewComment, IssueComment, Review, State } from '../src/types.js';

const makeReviewComment = (
  id: number,
  reviewId: number,
  overrides: Partial<ReviewComment> = {},
): ReviewComment => ({
  id,
  pull_request_review_id: reviewId,
  body: `comment ${id}`,
  path: 'src/foo.ts',
  line: 10,
  original_line: 10,
  user: { login: 'reviewer' },
  html_url: `https://github.com/owner/repo/pull/1#discussion_r${id}`,
  diff_hunk: '@@ -1,3 +1,4 @@\n context',
  ...overrides,
});

const makeIssueComment = (id: number, overrides: Partial<IssueComment> = {}): IssueComment => ({
  id,
  body: `issue comment ${id}`,
  user: { login: 'reviewer' },
  html_url: `https://github.com/owner/repo/pull/1#issuecomment-${id}`,
  ...overrides,
});

const makeReview = (id: number, state: string): Review => ({
  id,
  state,
  body: 'Review body',
  user: { login: 'reviewer' },
  submitted_at: '2024-01-01T00:00:00Z',
});

const emptyState: State = { seenCommentIds: [], seenReviewIds: [] };

describe('groupNewComments', () => {
  describe('review comment grouping', () => {
    it('groups 3 inline comments from the same review into a single batch', () => {
      const reviewComments = [
        makeReviewComment(1, 42),
        makeReviewComment(2, 42),
        makeReviewComment(3, 42),
      ];
      const reviews = [makeReview(42, 'CHANGES_REQUESTED')];

      const batches = groupNewComments(reviewComments, [], reviews, emptyState);

      expect(batches).toHaveLength(1);
      expect(batches[0].type).toBe('review');
      if (batches[0].type === 'review') {
        expect(batches[0].comments).toHaveLength(3);
        expect(batches[0].reviewId).toBe(42);
      }
    });

    it('groups comments from different reviews into separate batches', () => {
      const reviewComments = [
        makeReviewComment(1, 42),
        makeReviewComment(2, 99),
        makeReviewComment(3, 99),
      ];
      const reviews = [makeReview(42, 'COMMENTED'), makeReview(99, 'APPROVED')];

      const batches = groupNewComments(reviewComments, [], reviews, emptyState);

      expect(batches).toHaveLength(2);
    });

    it('skips review comments where the parent review is still PENDING', () => {
      const reviewComments = [makeReviewComment(1, 42)];
      const reviews = [makeReview(42, 'PENDING')];

      const batches = groupNewComments(reviewComments, [], reviews, emptyState);

      expect(batches).toHaveLength(0);
    });

    it('skips review comments when no matching review exists', () => {
      const reviewComments = [makeReviewComment(1, 42)];

      const batches = groupNewComments(reviewComments, [], [], emptyState);

      expect(batches).toHaveLength(0);
    });

    it('filters out already-seen review comments', () => {
      const reviewComments = [
        makeReviewComment(1, 42),
        makeReviewComment(2, 42),
      ];
      const reviews = [makeReview(42, 'CHANGES_REQUESTED')];
      const state: State = { seenCommentIds: [1], seenReviewIds: [] };

      const batches = groupNewComments(reviewComments, [], reviews, state);

      expect(batches).toHaveLength(1);
      if (batches[0].type === 'review') {
        expect(batches[0].comments).toHaveLength(1);
        expect(batches[0].comments[0].id).toBe(2);
      }
    });

    it('skips an entire review group if all its comments are already seen', () => {
      const reviewComments = [makeReviewComment(1, 42)];
      const reviews = [makeReview(42, 'COMMENTED')];
      const state: State = { seenCommentIds: [1], seenReviewIds: [] };

      const batches = groupNewComments(reviewComments, [], reviews, state);

      expect(batches).toHaveLength(0);
    });
  });

  describe('issue comment handling', () => {
    it('emits each issue comment as a separate batch', () => {
      const issueComments = [makeIssueComment(10), makeIssueComment(11)];

      const batches = groupNewComments([], issueComments, [], emptyState);

      expect(batches).toHaveLength(2);
      expect(batches[0].type).toBe('issue');
      expect(batches[1].type).toBe('issue');
    });

    it('filters out already-seen issue comments', () => {
      const issueComments = [makeIssueComment(10), makeIssueComment(11)];
      const state: State = { seenCommentIds: [10], seenReviewIds: [] };

      const batches = groupNewComments([], issueComments, [], state);

      expect(batches).toHaveLength(1);
      if (batches[0].type === 'issue') {
        expect(batches[0].comment.id).toBe(11);
      }
    });

    it('returns empty when all issue comments are already seen', () => {
      const issueComments = [makeIssueComment(10)];
      const state: State = { seenCommentIds: [10], seenReviewIds: [] };

      const batches = groupNewComments([], issueComments, [], state);

      expect(batches).toHaveLength(0);
    });
  });

  describe('mixed review and issue comments', () => {
    it('returns both review batches and issue batches', () => {
      const reviewComments = [makeReviewComment(1, 42)];
      const issueComments = [makeIssueComment(10)];
      const reviews = [makeReview(42, 'COMMENTED')];

      const batches = groupNewComments(reviewComments, issueComments, reviews, emptyState);

      expect(batches).toHaveLength(2);
      const types = batches.map((b) => b.type);
      expect(types).toContain('review');
      expect(types).toContain('issue');
    });
  });
});
