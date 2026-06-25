import type { PRInfo, CommentBatch, ReviewComment, IssueComment } from '../types.js';

export function buildPrompt(pr: PRInfo, batch: CommentBatch): string {
  const lines: string[] = [
    `# PR Review Action`,
    ``,
    `## PR Context`,
    `**Title:** ${pr.title}`,
    `**URL:** ${pr.url}`,
    `**Description:**`,
    pr.description || '_No description provided._',
    ``,
  ];

  if (batch.type === 'review') {
    lines.push(
      `## Review to Action`,
      `**Review ID:** ${batch.reviewId}`,
      `**Author:** ${batch.reviewAuthor}`,
      `**Verdict:** ${batch.verdict}`,
    );
    if (batch.reviewBody) {
      lines.push(`**Summary comment:** ${batch.reviewBody}`);
    }
    lines.push(``, `### Inline Comments (${batch.comments.length})`);
    for (const comment of batch.comments) {
      lines.push(...formatReviewComment(comment));
    }
  } else {
    lines.push(`## Comment to Action`, ...formatIssueComment(batch.comment));
  }

  return lines.join('\n');
}

function formatReviewComment(c: ReviewComment): string[] {
  return [
    ``,
    `**File:** \`${c.path}\`${c.line !== null ? ` line ${c.line}` : ''}`,
    `**Author:** ${c.user?.login ?? 'unknown'}`,
    `**Comment URL:** ${c.html_url}`,
    `**Comment ID:** ${c.id}`,
    `**Diff hunk:**`,
    '```diff',
    c.diff_hunk,
    '```',
    `**Body:** ${c.body}`,
  ];
}

function formatIssueComment(c: IssueComment): string[] {
  return [
    `**Author:** ${c.user?.login ?? 'unknown'}`,
    `**Comment URL:** ${c.html_url}`,
    `**Comment ID:** ${c.id}`,
    `**Body:** ${c.body}`,
  ];
}
