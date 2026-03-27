import * as core from '@actions/core';
import * as github from '@actions/github';
import { BotController } from '../bot/controller';

export async function main() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('Missing GITHUB_TOKEN');

    // Bridge action inputs → process.env so LLMClient picks them up uniformly.
    // When consumed as a reusable action, keys arrive via `with:` inputs.
    // When run directly in the host workflow via env:, process.env is already set.
    const openaiKey = core.getInput('openai-api-key') || process.env.OPENAI_API_KEY;
    const geminiKey = core.getInput('gemini-api-key') || process.env.GEMINI_API_KEY;
    if (openaiKey) process.env.OPENAI_API_KEY = openaiKey;
    if (geminiKey) process.env.GEMINI_API_KEY = geminiKey;

    const octokit = github.getOctokit(token);
    const controller = new BotController(octokit, {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    });

    const eventName = github.context.eventName;

    // 1. Welcome Routine on Issue Opening
    if (eventName === 'issues' && github.context.payload.action === 'opened') {
      const issue = github.context.payload.issue;
      if (!issue) return;
      core.info(`[Action] Intercepted new issue #${issue.number}`);
      await controller.handleWelcome(issue.number);
      return;
    }

    // 2. Command Routines on Issue Comments
    if (eventName === 'issue_comment' && github.context.payload.action === 'created') {
      const issue = github.context.payload.issue;
      const comment = github.context.payload.comment;
      
      if (!issue || !comment) return;
      if (comment.user?.type === 'Bot') {
        core.info('[Action] Ignoring bot-authored comment event.');
        return;
      }

      const body = comment.body;
      const author = comment.user.login;
      const number = issue.number;
      // Extract labels if present
      const labels = issue.labels ? issue.labels.map((l: any) => l.name) : [];
      
      // Determine if it's a Pull Request or standard Issue
      const isPR = !!issue.pull_request;

      core.info(`[Action] Parsing comment from @${author} on #${number} [isPR=${isPR}]`);

      await controller.handleCommand({
        number,
        author,
        body,
        labels,
        isPR
      });
      return;
    }

    // 3. Rework Commands on PR Review Comments
    if (eventName === 'pull_request_review_comment' && github.context.payload.action === 'created') {
      const pullRequest = github.context.payload.pull_request;
      const comment = github.context.payload.comment;

      if (!pullRequest || !comment) return;
      if (comment.user?.type === 'Bot') {
        core.info('[Action] Ignoring bot-authored review comment event.');
        return;
      }

      const labels = pullRequest.labels ? pullRequest.labels.map((l: any) => l.name) : [];

      core.info(`[Action] Parsing review comment from @${comment.user.login} on PR #${pullRequest.number}`);

      await controller.handleCommand({
        number: pullRequest.number,
        author: comment.user.login,
        body: comment.body,
        labels,
        isPR: true
      });
      return;
    }

  } catch (error: any) {
    core.setFailed(`[AI Bot Execution Error]: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
