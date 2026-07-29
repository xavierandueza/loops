import { createHash } from 'crypto';
import { groupNewComments, extractNewCommentIds } from './grouping.js';
import { buildPrompt } from './prompt.js';
import { IGNORED_AGENT_LOGINS } from './ignored-agents.js';
import type {
  CommentBatch,
  GitHubFetcher,
  PRInfo,
  State,
  InvokePi,
  PollCycleResult,
} from '../types.js';

export function agentName(pr: PRInfo): string {
  const repositoryHash = createHash('sha256')
    .update(`${pr.owner}/${pr.repo}`)
    .digest('hex')
    .slice(0, 8);
  const prNumber = String(pr.number).slice(-14);
  return `loops-pr-${prNumber}-${repositoryHash}`;
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
      batch.comments.some((comment) => comment.isNew && hasAgentResponseMarker(comment.body))
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
    return {
      state,
      newCommentCount: 0,
      dispatchedAgentCount: 0,
      skippedAgentResponseCount: 0,
      skippedIgnoredCommentCount: 0,
    };
  }

  const agentResponseBatches: CommentBatch[] = [];
  const ignoredBatches: CommentBatch[] = [];
  const actionableBatches: CommentBatch[] = [];

  for (const batch of batches) {
    if (batch.type === 'issue') {
      const author = batch.comment.user?.login;
      if (author && IGNORED_AGENT_LOGINS.has(author.toLowerCase())) {
        ignoredBatches.push(batch);
        continue;
      }
      if (batchHasAgentResponse(batch)) {
        agentResponseBatches.push(batch);
      } else {
        actionableBatches.push(batch);
      }
      continue;
    }

    const ignoredNewCommentIds = new Set(
      batch.comments
        .filter((comment) => {
          const author = comment.user?.login ?? batch.reviewAuthor;
          return comment.isNew && IGNORED_AGENT_LOGINS.has(author.toLowerCase());
        })
        .map((comment) => comment.id),
    );

    if (ignoredNewCommentIds.size > 0) {
      ignoredBatches.push({
        ...batch,
        comments: batch.comments.filter(
          (comment) => comment.isNew && ignoredNewCommentIds.has(comment.id),
        ),
      });
    }

    const actionableBatch: CommentBatch = {
      ...batch,
      comments: batch.comments.filter(
        (comment) => !comment.isNew || !ignoredNewCommentIds.has(comment.id),
      ),
    };
    if (!actionableBatch.comments.some((comment) => comment.isNew)) {
      continue;
    }
    if (batchHasAgentResponse(actionableBatch)) {
      agentResponseBatches.push(actionableBatch);
    } else {
      actionableBatches.push(actionableBatch);
    }
  }

  const agent = agentName(pr);
  const session = sessionId(pr);
  const skill = skillName();

  if (actionableBatches.length > 0) {
    const prompt = buildPrompt(pr, actionableBatches);
    await invokePi(agent, session, skill, prompt, cwd);
  }

  return {
    state: {
      seenCommentIds: [...state.seenCommentIds, ...newIds],
      seenReviewIds: state.seenReviewIds,
    },
    newCommentCount: newIds.length,
    dispatchedAgentCount: actionableBatches.length > 0 ? 1 : 0,
    skippedAgentResponseCount: extractNewCommentIds(agentResponseBatches).length,
    skippedIgnoredCommentCount: extractNewCommentIds(ignoredBatches).length,
  };
}
