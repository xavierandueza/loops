import { groupNewComments, extractNewCommentIds } from './grouping.js';
import { buildPrompt } from './prompt.js';
import type {
  CommentBatch,
  GitHubFetcher,
  PRInfo,
  State,
  InvokePi,
  PollCycleResult,
} from '../types.js';

export function windowName(pr: PRInfo): string {
  return `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
}

export function sessionId(pr: PRInfo): string {
  return `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
}

export function skillName(): string {
  return 'address-pr-comments';
}

const AGENT_RESPONSE_MARKER = '(agent response)';

function hasAgentResponseMarker(body: string | null): boolean {
  return body?.toLowerCase().includes(AGENT_RESPONSE_MARKER) ?? false;
}

function batchHasAgentResponse(batch: CommentBatch): boolean {
  if (batch.type === 'review') {
    return (
      hasAgentResponseMarker(batch.reviewBody) ||
      batch.comments.some((comment) => hasAgentResponseMarker(comment.body))
    );
  }

  return hasAgentResponseMarker(batch.comment.body);
}

export async function processPollCycle(
  fetcher: GitHubFetcher,
  pr: PRInfo,
  state: State,
  invokePi: InvokePi,
  cwd: string,
): Promise<PollCycleResult> {
  const [reviewComments, issueComments, reviews] = await Promise.all([
    fetcher.listReviewComments(pr.owner, pr.repo, pr.number),
    fetcher.listIssueComments(pr.owner, pr.repo, pr.number),
    fetcher.listReviews(pr.owner, pr.repo, pr.number),
  ]);

  const batches = groupNewComments(reviewComments, issueComments, reviews, state);

  const newIds = extractNewCommentIds(batches);

  if (batches.length === 0) {
    return { state, newCommentCount: 0, dispatchedAgentCount: 0, skippedAgentResponseCount: 0 };
  }

  const agentResponseBatches: CommentBatch[] = [];
  const actionableBatches: CommentBatch[] = [];

  for (const batch of batches) {
    if (batchHasAgentResponse(batch)) {
      agentResponseBatches.push(batch);
    } else {
      actionableBatches.push(batch);
    }
  }

  const window = windowName(pr);
  const session = sessionId(pr);
  const skill = skillName();

  for (const batch of actionableBatches) {
    const prompt = buildPrompt(pr, batch);
    await invokePi(window, session, skill, prompt, cwd);
  }

  return {
    state: {
      seenCommentIds: [...state.seenCommentIds, ...newIds],
      seenReviewIds: state.seenReviewIds,
    },
    newCommentCount: newIds.length,
    dispatchedAgentCount: actionableBatches.length,
    skippedAgentResponseCount: extractNewCommentIds(agentResponseBatches).length,
  };
}
