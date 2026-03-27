import * as github from '@actions/github';

export class GitHubProvider {
  private octokit: ReturnType<typeof github.getOctokit>;

  constructor(token: string) {
    const opts: any = {};
    if (process.env.TEST_GITHUB_API_URL) {
      opts.baseUrl = process.env.TEST_GITHUB_API_URL;
    }
    this.octokit = github.getOctokit(token, opts);
  }

  async updateStateLabel(owner: string, repo: string, issueNumber: number, targetState: string): Promise<void> {
    // 1. Fetch current labels
    const { data: issue } = await this.octokit.rest.issues.get({
       owner,
       repo,
       issue_number: issueNumber
    });
    const currentLabels = issue.labels.map(l => typeof l === 'string' ? l : l.name).filter(n => n !== undefined) as string[];

    console.log(`[GitHubProvider] Setting state to ${targetState} on #${issueNumber}`);
    const newLabels = [
       ...currentLabels.filter(label => !label.startsWith('state:')),
       `state:${targetState}`
    ];

    await this.octokit.rest.issues.setLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: newLabels
    });
  }

  async postComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    });
  }

  async createPullRequest(owner: string, repo: string, head: string, base: string, title: string, body: string): Promise<number> {
    const { data } = await this.octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body
    });
    return data.number;
  }

  async getIssueBody(owner: string, repo: string, issueNumber: number): Promise<string> {
    const { data } = await this.octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
    return data.body || '';
  }

  async createIssue(owner: string, repo: string, title: string, body: string): Promise<number> {
    const { data } = await this.octokit.rest.issues.create({ owner, repo, title, body });
    return data.number;
  }

  async assignReviewer(owner: string, repo: string, prNumber: number, username: string): Promise<void> {
    await this.octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: prNumber,
      reviewers: [username]
    });
  }
}
