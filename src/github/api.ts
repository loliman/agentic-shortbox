import * as github from '@actions/github';

export class GitHubApi {
  private octokit: ReturnType<typeof github.getOctokit>;
  private owner: string;
  private repo: string;

  constructor(token: string) {
    this.octokit = github.getOctokit(token);
    this.owner = github.context.repo.owner;
    this.repo = github.context.repo.repo;
  }

  /**
   * Posts an explanatory comment to the issue
   */
  public async postComment(issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: body,
    });
  }

  /**
   * Swaps existing state:* labels with the new state label
   */
  public async updateStateLabel(issueNumber: number, currentLabels: string[], newState: string): Promise<void> {
    const stateLabelsToRemove = currentLabels.filter(label => label.startsWith('state:'));
    
    // Remove old state labels
    for (const label of stateLabelsToRemove) {
      if (label === `state:${newState}`) continue; // Skip identical states
      try {
        await this.octokit.rest.issues.removeLabel({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          name: label,
        });
      } catch (err: any) {
        // Ignore 404 (label might have been removed already by a race condition)
        if (err.status !== 404) throw err;
      }
    }

    // Add new state label
    if (!stateLabelsToRemove.includes(`state:${newState}`)) {
      await this.octokit.rest.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels: [`state:${newState}`],
      });
    }
  }

  /**
   * Posts an explanatory comment to a Pull Request
   */
  public async postPRComment(prNumber: number, body: string): Promise<void> {
    // PR comments (not review comments) hit the same issues endpoint in reality
    await this.postComment(prNumber, body);
  }

  /**
   * Closes an issue programmatically
   */
  public async closeIssue(issueNumber: number): Promise<void> {
    await this.octokit.rest.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      state: 'closed'
    });
  }

  /**
   * Gets the diff of a PR
   */
  public async getPullRequestDiff(prNumber: number): Promise<string> {
    const response = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      mediaType: {
        format: 'diff'
      }
    });
    
    // octokit rest pulls returns string logic when diff format is requested
    return response.data as unknown as string;
  }
}
