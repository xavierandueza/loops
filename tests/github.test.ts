import { beforeEach, describe, expect, it, vi } from 'vitest';

const listForRef = vi.fn();
const getCombinedStatusForRef = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    checks: { listForRef },
    repos: { getCombinedStatusForRef },
  })),
}));

import { createFetcher } from '../src/lib/github.js';

describe('GitHubFetcher CI failures', () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    listForRef.mockReset();
    getCombinedStatusForRef.mockReset();
  });

  it('returns failed check runs and legacy commit statuses', async () => {
    listForRef.mockResolvedValue({
      data: {
        check_runs: [
          {
            id: 10,
            name: 'test',
            status: 'completed',
            conclusion: 'failure',
            details_url: 'https://github.com/acme/myapp/actions/runs/10',
            html_url: 'https://github.com/acme/myapp/runs/10',
            output: {
              title: 'Tests failed',
              summary: '2 tests failed',
              text: 'failure output',
            },
          },
          {
            id: 11,
            name: 'lint',
            status: 'completed',
            conclusion: 'success',
            details_url: null,
            html_url: null,
            output: { title: null, summary: null, text: null },
          },
        ],
      },
    });
    getCombinedStatusForRef.mockResolvedValue({
      data: {
        statuses: [
          {
            id: 20,
            context: 'external/build',
            state: 'error',
            target_url: 'https://ci.example.com/build/20',
            description: 'Runner unavailable',
          },
          {
            id: 21,
            context: 'external/deploy',
            state: 'pending',
            target_url: null,
            description: null,
          },
        ],
      },
    });

    const failures = await createFetcher().listCIFailures('acme', 'myapp', 'abc123');

    expect(listForRef).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'myapp',
      ref: 'abc123',
      filter: 'latest',
      per_page: 100,
    });
    expect(getCombinedStatusForRef).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'myapp',
      ref: 'abc123',
      per_page: 100,
    });
    expect(failures).toEqual([
      {
        id: 'check:10',
        name: 'test',
        conclusion: 'failure',
        detailsUrl: 'https://github.com/acme/myapp/actions/runs/10',
        title: 'Tests failed',
        summary: '2 tests failed',
        text: 'failure output',
      },
      {
        id: 'status:20',
        name: 'external/build',
        conclusion: 'error',
        detailsUrl: 'https://ci.example.com/build/20',
        title: null,
        summary: 'Runner unavailable',
        text: null,
      },
    ]);
  });
});
