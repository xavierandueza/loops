export type State = {
  seenCommentIds: number[];
  seenReviewIds: number[];
};

export type PRInfo = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  description: string;
  url: string;
};

export type ReviewComment = {
  id: number;
  pull_request_review_id: number | null;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  user: { login: string } | null;
  html_url: string;
  diff_hunk: string;
};

export type IssueComment = {
  id: number;
  body: string;
  user: { login: string } | null;
  html_url: string;
};

export type Review = {
  id: number;
  state: string;
  body: string | null;
  user: { login: string } | null;
  submitted_at: string | null;
};

export type ReviewBatch = {
  type: 'review';
  reviewId: number;
  verdict: string;
  reviewBody: string | null;
  reviewAuthor: string;
  comments: ReviewComment[];
};

export type IssueBatch = {
  type: 'issue';
  comment: IssueComment;
};

export type CommentBatch = ReviewBatch | IssueBatch;

export type PollCycleResult = {
  state: State;
  newCommentCount: number;
  dispatchedAgentCount: number;
  skippedAgentResponseCount: number;
};

export type InvokePi = (
  windowName: string,
  sessionId: string,
  skillName: string,
  prompt: string,
  cwd: string,
) => Promise<void>;

export type GitHubFetcher = {
  getPR: (owner: string, repo: string, pull_number: number) => Promise<PRInfo>;
  listReviewComments: (owner: string, repo: string, pull_number: number) => Promise<ReviewComment[]>;
  listIssueComments: (owner: string, repo: string, issue_number: number) => Promise<IssueComment[]>;
  listReviews: (owner: string, repo: string, pull_number: number) => Promise<Review[]>;
};
