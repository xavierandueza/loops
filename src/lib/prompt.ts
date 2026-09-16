import type { PRInfo, CommentBatch, ReviewComment, IssueComment, CIFailure } from '../types.js';

export function buildPrompt(
  pr: PRInfo,
  batches: CommentBatch[],
  ciFailures: CIFailure[] = [],
): string {
  const lines: string[] = [
    `# PR Action Required`,
    ``,
    `## PR Context`,
    `**Title:** ${pr.title}`,
    `**URL:** ${pr.url}`,
    `**Description:**`,
    pr.description || '_No description provided._',
  ];

  for (const batch of batches) {
    lines.push(``);
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
  }

  for (const failure of ciFailures) {
    lines.push(
      ``,
      `## Failing CI to Action`,
      `**Check:** ${failure.name}`,
      `**Conclusion:** ${failure.conclusion}`,
    );
    if (failure.detailsUrl) lines.push(`**Details:** ${failure.detailsUrl}`);
    if (failure.title) lines.push(`**Title:** ${failure.title}`);
    if (failure.summary) lines.push(`**Summary:** ${failure.summary}`);
    if (failure.text) lines.push(`**Output:**`, failure.text);
  }

  return lines.join('\n');
}

function formatReviewComment(c: ReviewComment): string[] {
  const status = 'isNew' in c && c.isNew ? 'NEW comment to action' : 'OLD thread context';

  return [
    ``,
    `**Thread status:** ${status}`,
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
