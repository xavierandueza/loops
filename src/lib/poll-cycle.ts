import { homedir } from 'os';
import { join } from 'path';
import { groupNewComments, extractNewCommentIds } from './grouping.js';
import { buildPrompt } from './prompt.js';
import type { GitHubFetcher, PRInfo, State, InvokePi } from '../types.js';

export function sessionId(pr: PRInfo): string {
  return `loops-pr-${pr.owner}-${pr.repo}-${pr.number}`;
}

export function skillPath(): string {
  return join(homedir(), '.loops', 'skills', 'pr-review', 'SKILL.md');
}

export async function processPollCycle(
  fetcher: GitHubFetcher,
  pr: PRInfo,
  state: State,
  invokePi: InvokePi,
  cwd: string,
): Promise<State> {
  const [reviewComments, issueComments, reviews] = await Promise.all([
    fetcher.listReviewComments(pr.owner, pr.repo, pr.number),
    fetcher.listIssueComments(pr.owner, pr.repo, pr.number),
    fetcher.listReviews(pr.owner, pr.repo, pr.number),
  ]);

  const batches = groupNewComments(reviewComments, issueComments, reviews, state);

  if (batches.length === 0) {
    return state;
  }

  const sid = sessionId(pr);
  const skill = skillPath();

  for (const batch of batches) {
    const prompt = buildPrompt(pr, batch);
    await invokePi(sid, skill, prompt, cwd);
  }

  const newIds = extractNewCommentIds(batches);
  return {
    seenCommentIds: [...state.seenCommentIds, ...newIds],
    seenReviewIds: state.seenReviewIds,
  };
}
