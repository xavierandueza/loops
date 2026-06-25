import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import type { GitHubFetcher, PRInfo, ReviewComment, IssueComment, Review } from '../types.js';

function getToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('No GitHub token found. Run `gh auth login` or set GITHUB_TOKEN.');
  }
}

export function createFetcher(): GitHubFetcher {
  const octokit = new Octokit({ auth: getToken() });

  return {
    async getPR(owner, repo, pull_number): Promise<PRInfo> {
      const { data } = await octokit.pulls.get({ owner, repo, pull_number });
      return {
        owner,
        repo,
        number: pull_number,
        title: data.title,
        description: data.body ?? '',
        url: data.html_url,
      };
    },

    async listReviewComments(owner, repo, pull_number): Promise<ReviewComment[]> {
      const { data } = await octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number,
        per_page: 100,
      });
      return data.map((c) => ({
        id: c.id,
        pull_request_review_id: c.pull_request_review_id ?? null,
        body: c.body,
        path: c.path,
        line: c.line ?? null,
        original_line: c.original_line ?? null,
        user: c.user ? { login: c.user.login } : null,
        html_url: c.html_url,
        diff_hunk: c.diff_hunk,
      }));
    },

    async listIssueComments(owner, repo, issue_number): Promise<IssueComment[]> {
      const { data } = await octokit.issues.listComments({
        owner,
        repo,
        issue_number,
        per_page: 100,
      });
      return data.map((c) => ({
        id: c.id,
        body: c.body ?? '',
        user: c.user ? { login: c.user.login } : null,
        html_url: c.html_url,
      }));
    },

    async listReviews(owner, repo, pull_number): Promise<Review[]> {
      const { data } = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number,
        per_page: 100,
      });
      return data.map((r) => ({
        id: r.id,
        state: r.state,
        body: r.body ?? null,
        user: r.user ? { login: r.user.login } : null,
        submitted_at: r.submitted_at ?? null,
      }));
    },
  };
}

export function parsePRUrl(url: string): { owner: string; repo: string; number: number } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error(`Invalid PR URL: ${url}`);
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}
