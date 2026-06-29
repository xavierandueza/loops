import { groupNewComments, extractNewCommentIds } from './grouping.js';
import { buildPrompt } from './prompt.js';
import type { GitHubFetcher, PRInfo, State, InvokePi, PollCycleResult } from '../types.js';

export function windowName(pr: PRInfo): string {
  return `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
}

export function skillName(): string {
  return 'address-pr-comments';
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
    return { state, newCommentCount: 0, dispatchedAgentCount: 0 };
  }

  const window = windowName(pr);
  const skill = skillName();

  for (const batch of batches) {
    const prompt = buildPrompt(pr, batch);
    await invokePi(window, skill, prompt, cwd);
  }

  return {
    state: {
      seenCommentIds: [...state.seenCommentIds, ...newIds],
      seenReviewIds: state.seenReviewIds,
    },
    newCommentCount: newIds.length,
    dispatchedAgentCount: batches.length,
  };
}
