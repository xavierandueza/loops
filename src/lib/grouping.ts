import type {
  ReviewComment,
  ThreadedReviewComment,
  IssueComment,
  Review,
  State,
  CommentBatch,
} from '../types.js';

export function groupNewComments(
  reviewComments: ReviewComment[],
  issueComments: IssueComment[],
  reviews: Review[],
  state: State,
): CommentBatch[] {
  const seenIds = new Set(state.seenCommentIds);
  const reviewMap = new Map(reviews.map((r) => [r.id, r]));
  const batches: CommentBatch[] = [];

  const newReviewComments = reviewComments.filter((c) => !seenIds.has(c.id));

  const byReviewId = new Map<number, Map<number, ThreadedReviewComment>>();
  for (const comment of newReviewComments) {
    if (comment.pull_request_review_id === null) continue;

    const threadRootId = comment.in_reply_to_id ?? comment.id;
    const threadComments = reviewComments.filter(
      (candidate) => candidate.id === threadRootId || candidate.in_reply_to_id === threadRootId,
    );
    const group = byReviewId.get(comment.pull_request_review_id) ?? new Map();

    for (const threadComment of threadComments) {
      group.set(threadComment.id, {
        ...threadComment,
        isNew: !seenIds.has(threadComment.id),
      });
    }

    byReviewId.set(comment.pull_request_review_id, group);
  }

  for (const [reviewId, commentsById] of byReviewId) {
    const review = reviewMap.get(reviewId);
    if (!review || review.state === 'PENDING') continue;

    batches.push({
      type: 'review',
      reviewId,
      verdict: review.state,
      reviewBody: review.body ?? null,
      reviewAuthor: review.user?.login ?? 'unknown',
      comments: [...commentsById.values()],
    });
  }

  for (const comment of issueComments) {
    if (seenIds.has(comment.id)) continue;
    batches.push({ type: 'issue', comment });
  }

  return batches;
}

export function extractNewCommentIds(batches: CommentBatch[]): number[] {
  const ids: number[] = [];
  for (const batch of batches) {
    if (batch.type === 'review') {
      ids.push(...batch.comments.filter((c) => c.isNew).map((c) => c.id));
    } else {
      ids.push(batch.comment.id);
    }
  }
  return ids;
}
